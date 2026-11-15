/**
 * Shared connection to `realms.db`.
 *
 * Deliberately **not** marked `server-only`, unlike the modules that wrap it.
 * `server-only` is not resolvable outside Next's bundler — it exists only
 * inside `next/dist/compiled`, so a `tsx` script importing any module that
 * carries it dies at resolution with "Cannot find module 'server-only'",
 * `--conditions=react-server` or not. Operator scripts need the db, so the
 * connection layer and the SQL have to sit below that line and the
 * `server-only` marker goes on the app-facing wrappers
 * (`realm-db.ts`, `raid-db.ts`). Nothing here is a leak risk on its own:
 * `better-sqlite3` is a native module, so a client bundle that reached this
 * would fail to build anyway.
 *
 * One `Database` per path per process, cached. Both `realm-db.ts` and
 * `raid-db.ts` live in the same file (see Correction 1 in the plan: raid
 * state must not become a second sqlite file, or it falls out of `DB_FILES`
 * in `scripts/lib/state-paths.sh` and the hardcoded path in
 * `realms-state-backup.service`, and a chain reset would leave a felled boss
 * with no receipts and no way to re-arm).
 *
 * Each caller owns its own schema: call `openRealmsDb()` and run your
 * `CREATE TABLE IF NOT EXISTS` behind a module-local `ready` flag. That
 * keeps migrations next to the code that needs them and avoids a central
 * registry whose ordering would depend on import order.
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database, { type Database as DatabaseType } from "better-sqlite3";

/**
 * Default location. `process.cwd()` in Next.js (both `next dev` and
 * `next build`) is the app root, and `pnpm` runs package scripts from the
 * package directory, so both resolve to `apps/web/data/realms.db`.
 *
 * `REALMS_DB_PATH` overrides it. That exists for two reasons that are not
 * configuration-for-its-own-sake: a script invoked from somewhere other than
 * `apps/web` would otherwise silently create a *second* empty db rather than
 * fail, and tests need a disposable file. Not registered in `env.ts` because
 * it is an operator/test escape hatch, not a product setting, and a missing
 * value is the normal case rather than a misconfiguration.
 */
export function defaultDbPath(): string {
  const override = process.env.REALMS_DB_PATH;
  if (override && override.trim().length > 0) return resolve(override.trim());
  return resolve(process.cwd(), "data", "realms.db");
}

const connections = new Map<string, DatabaseType>();

/**
 * Open (or reuse) the connection for `path`, defaulting to
 * `defaultDbPath()`. Creates the parent directory on first open.
 *
 * WAL plus `foreign_keys` matches what `realm-db.ts` has always set; the
 * pragmas are idempotent, so re-opening the same path is free.
 */
export function openRealmsDb(path = defaultDbPath()): DatabaseType {
  const existing = connections.get(path);
  if (existing) return existing;

  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  connections.set(path, db);
  return db;
}

/**
 * Close and forget a connection. For tests and for scripts that want the
 * WAL checkpointed before the process exits; the long-lived server never
 * calls it.
 */
export function closeRealmsDb(path = defaultDbPath()): void {
  const db = connections.get(path);
  if (!db) return;
  db.close();
  connections.delete(path);
}
