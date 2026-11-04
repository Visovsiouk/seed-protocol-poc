import "server-only";

/**
 * App-facing raid state: the singleton connection, the schema guard, and the
 * cached HP bar.
 *
 * All SQL lives in `raid-store.ts`, which takes its db handle as an argument
 * and carries no `server-only` marker so operator scripts can reach it. This
 * file is the half that only the running server should touch — it binds the
 * store to the one real `realms.db` and adds the read cache.
 *
 * NEVER import this from a "use client" file, and never from a `tsx` script
 * (`server-only` is unresolvable outside Next's bundler — see `sqlite.ts`).
 *
 * ## Why the HP bar is cached in memory
 *
 * `better-sqlite3` is synchronous, so every read blocks the thread that also
 * serves SSR. A boss HP bar is the one value in this app that many clients
 * poll at once, and a db read per poll would put N clients × poll rate of
 * blocking reads on that thread for a number that changes only when an
 * attempt is submitted. One `next start` process is the only writer, so
 * invalidating on write is trivially coherent — there is no other process to
 * miss an update from.
 *
 * The cache is deliberately *not* time-based. A TTL would mean the bar can
 * be stale right after your own attempt landed, which is the one moment
 * anybody is looking at it.
 */

import {
  countPlayerAttempts,
  getContribution,
  getCurrentEdition,
  getEdition,
  listContributions,
  listContributors,
  migrateRaidTables,
  openNextEdition,
  recordAttempt,
  type ContributorTotal,
  type RaidContribution,
  type RaidEdition,
  type RecordAttemptInput,
  type RecordAttemptResult,
} from "./raid-store";
import { openRealmsDb } from "./sqlite";

let migrated = false;
let currentCache: RaidEdition | null | undefined;

function db() {
  const handle = openRealmsDb();
  if (!migrated) {
    migrateRaidTables(handle);
    migrated = true;
  }
  return handle;
}

/** Drop the cached edition. Called after every write in this module. */
function invalidate(): void {
  currentCache = undefined;
}

/**
 * The standing (or most recently felled) edition, served from memory.
 *
 * `undefined` in the cache slot means "not yet read"; `null` means "read,
 * and there is no edition" — without that distinction a pre-first-edition
 * server would re-query on every poll, which is exactly the load this
 * cache exists to remove.
 */
export function currentEdition(): RaidEdition | null {
  if (currentCache !== undefined) return currentCache;
  currentCache = getCurrentEdition(db()) ?? null;
  return currentCache;
}

/** The HP bar's payload. `null` before the first edition is opened. */
export type RaidBarState = {
  edition: number;
  totalHp: number;
  currentHp: number;
  phase: 1 | 2;
  felled: boolean;
};

export function raidBar(): RaidBarState | null {
  const e = currentEdition();
  if (!e) return null;
  return {
    edition: e.edition,
    totalHp: e.totalHp,
    currentHp: e.currentHp,
    phase: e.phase,
    felled: e.felledAt !== null,
  };
}

export function raidEdition(edition: number): RaidEdition | undefined {
  return getEdition(db(), edition);
}

export function raidContribution(
  entryTxHash: `0x${string}`,
): RaidContribution | undefined {
  return getContribution(db(), entryTxHash);
}

export function raidContributions(edition: number): RaidContribution[] {
  return listContributions(db(), edition);
}

export function raidContributors(edition: number): ContributorTotal[] {
  return listContributors(db(), edition);
}

export function raidPlayerAttempts(
  edition: number,
  player: `0x${string}`,
): number {
  return countPlayerAttempts(db(), edition, player);
}

/**
 * Record a verified attempt against the pool. Idempotent on the entry tx
 * hash — see `recordAttempt` in the store for why the ordering inside the
 * transaction is what makes that true.
 */
export function submitAttempt(input: RecordAttemptInput): RecordAttemptResult {
  const res = recordAttempt(db(), input);
  invalidate();
  return res;
}

/**
 * Open the next edition. The operator path proper is
 * `scripts/open-edition.ts`; this exists so a route could do it too, and so
 * the cache is invalidated either way when the server is the one opening it.
 */
export function openEdition(totalHp: number): RaidEdition {
  const e = openNextEdition(db(), totalHp);
  invalidate();
  return e;
}
