import "server-only";

/**
 * Player-realm metadata store.
 *
 * `EcosystemRegistry` is the on-chain source of truth for "this address
 * is a realm" — but the protocol contracts don't store any of the
 * cosmetic / runtime metadata a play session needs:
 *
 *   - which flavor preset (fantasy / scifi / cyberpunk) drives narration
 *   - which boss the run leads to at BOSS_DEPTH
 *   - a creator-chosen display name
 *   - the HD index of the server-derived minter delegate for this realm
 *
 * Until those land on-chain (if ever), the dapp persists them in a tiny
 * sqlite file. Lives at `apps/web/data/realms.db` (gitignored). Schema
 * is created once at first open. No migrations system yet — is
 * the only writer.
 *
 * NEVER import this from a "use client" file.
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import type { Preset, Tier } from "@/lib/engine/types";

/**
 * BIP-44 indices 0–3 are reserved for the admin + 3 starter-realm
 * owners (see `realm-signer.ts`). Player-realm minter delegates start
 * here and grow by 1 per `/create`. Stored persistently so re-running
 * the server after a crash hands the same minter address back to the
 * same realm; collisions are prevented by the `UNIQUE` constraint.
 */
export const PLAYER_REALM_SIGNER_INDEX_START = 4;

export type PlayerRealmRow = {
  address: `0x${string}`;
  owner: `0x${string}`;
  preset: Preset;
  bossId: string;
  name: string;
  signerIndex: number;
  maxTier: Tier;
  createdAt: number;
};

type Row = {
  address: string;
  owner: string;
  preset: string;
  boss_id: string;
  name: string;
  signer_index: number;
  max_tier: number;
  created_at: number;
};

let cached: DatabaseType | undefined;

function dbPath(): string {
  // `process.cwd()` in Next.js (both `next dev` and `next build`) is the
  // app root (`apps/web`). Pin to an absolute path so the file lives in
  // the same place regardless of where the dev server was invoked from.
  return resolve(process.cwd(), "data", "realms.db");
}

function open(): DatabaseType {
  if (cached) return cached;
  const path = dbPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_realms (
      address      TEXT PRIMARY KEY,
      owner        TEXT NOT NULL,
      preset       TEXT NOT NULL CHECK (preset IN ('fantasy','scifi','cyberpunk')),
      boss_id      TEXT NOT NULL,
      name         TEXT NOT NULL,
      signer_index INTEGER NOT NULL UNIQUE,
      max_tier     INTEGER NOT NULL DEFAULT 2 CHECK (max_tier BETWEEN 1 AND 5),
      created_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_player_realms_owner ON player_realms(owner);
    CREATE INDEX IF NOT EXISTS idx_player_realms_preset ON player_realms(preset);
  `);
  cached = db;
  return db;
}

function rowToRealm(r: Row): PlayerRealmRow {
  return {
    address: r.address as `0x${string}`,
    owner: r.owner as `0x${string}`,
    preset: r.preset as Preset,
    bossId: r.boss_id,
    name: r.name,
    signerIndex: r.signer_index,
    maxTier: r.max_tier as Tier,
    createdAt: r.created_at,
  };
}

/**
 * Next free BIP-44 index for a fresh player-realm delegate. Starts at
 * `PLAYER_REALM_SIGNER_INDEX_START` and skips any already-claimed slots.
 * Wrapped in a transaction-style read so concurrent `/create` flows
 * can't both grab the same index — the actual write uses INSERT with
 * the UNIQUE constraint as the final guard.
 */
export function getNextSignerIndex(): number {
  const db = open();
  const row = db
    .prepare<[], { max_idx: number | null }>(
      "SELECT MAX(signer_index) AS max_idx FROM player_realms",
    )
    .get();
  const used = row?.max_idx ?? null;
  return used === null
    ? PLAYER_REALM_SIGNER_INDEX_START
    : Math.max(used + 1, PLAYER_REALM_SIGNER_INDEX_START);
}

export function getPlayerRealm(
  address: `0x${string}`,
): PlayerRealmRow | undefined {
  const db = open();
  const row = db
    .prepare<[string], Row>("SELECT * FROM player_realms WHERE address = ?")
    .get(address.toLowerCase());
  return row ? rowToRealm(row) : undefined;
}

export function listPlayerRealms(): PlayerRealmRow[] {
  const db = open();
  const rows = db
    .prepare<[], Row>("SELECT * FROM player_realms ORDER BY created_at ASC")
    .all();
  return rows.map(rowToRealm);
}

export function insertPlayerRealm(input: {
  address: `0x${string}`;
  owner: `0x${string}`;
  preset: Preset;
  bossId: string;
  name: string;
  signerIndex: number;
  maxTier: Tier;
}): PlayerRealmRow {
  const db = open();
  const createdAt = Math.floor(Date.now() / 1000);
  const stmt = db.prepare(`
    INSERT INTO player_realms (
      address, owner, preset, boss_id, name, signer_index, max_tier, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    input.address.toLowerCase(),
    input.owner.toLowerCase(),
    input.preset,
    input.bossId,
    input.name,
    input.signerIndex,
    input.maxTier,
    createdAt,
  );
  return {
    address: input.address.toLowerCase() as `0x${string}`,
    owner: input.owner.toLowerCase() as `0x${string}`,
    preset: input.preset,
    bossId: input.bossId,
    name: input.name,
    signerIndex: input.signerIndex,
    maxTier: input.maxTier,
    createdAt,
  };
}
