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

import { getRaidEnv, raidUnlockOverridden } from "@/lib/env";
import {
  advanceAttempt,
  bumpT5Clears,
  countPlayerAttempts,
  getContribution,
  getCurrentEdition,
  getEdition,
  getRaidUnlock,
  listContributions,
  listContributors,
  migrateRaidTables,
  openNextEdition,
  recordAttempt,
  type AdvanceAttemptInput,
  type ContributorTotal,
  type RaidContribution,
  type RaidEdition,
  type RaidUnlock,
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
 * Record a finished attempt against the pool, write-once on the entry tx
 * hash. A second submission is ignored whatever it claims.
 */
export function submitAttempt(input: RecordAttemptInput): RecordAttemptResult {
  const res = recordAttempt(db(), input);
  invalidate();
  return res;
}

/**
 * Report an in-progress attempt's cumulative damage, applying the delta.
 *
 * This is the submission path for a fight that reports as it goes, which is
 * what makes "dying contributes" true for an abandoned attempt as well as a
 * lost one — the damage already landed. Safe to call every round; replaying a
 * total already recorded applies nothing.
 */
export function advanceAttemptProgress(
  input: AdvanceAttemptInput,
): RecordAttemptResult {
  const res = advanceAttempt(db(), input);
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

// ---------------------------------------------------------------------------
// The unlock gate
// ---------------------------------------------------------------------------

export type RaidGate = {
  unlocked: boolean;
  t5Clears: number;
  required: number;
  /** Clears still needed, or 0 once open. */
  remaining: number;
  /** True when `RAID_UNLOCK_OVERRIDE` forced it rather than the counter. */
  overridden: boolean;
};

/**
 * Is the raid open? A single integer read plus an env threshold.
 *
 * The override is reported rather than hidden: a gate that is open because
 * an operator forced it is a materially different state from one the players
 * opened, and a surface that cannot tell them apart will eventually claim
 * the community achieved something it didn't.
 */
export function raidGate(): RaidGate {
  const required = getRaidEnv().RAID_UNLOCK_T5_CLEARS;
  const { t5Clears } = getRaidUnlock(db());
  const overridden = raidUnlockOverridden();
  return {
    unlocked: overridden || t5Clears >= required,
    t5Clears,
    required,
    remaining: Math.max(0, required - t5Clears),
    overridden,
  };
}

/**
 * Record a T5-realm clear against the gate.
 *
 * Callers must only invoke this for a receipt their own request minted — see
 * `bumpT5Clears` in the store for where the idempotency actually lives.
 */
export function recordT5Clear(): RaidUnlock {
  return bumpT5Clears(db());
}

/** HP the next edition opens at when the caller has no explicit figure. */
export function defaultEditionHp(): number {
  return getRaidEnv().RAID_EDITION_HP;
}
