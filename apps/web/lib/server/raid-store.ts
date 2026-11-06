/**
 * The Colophon's persistence layer — S4 of the raid plan.
 *
 * Every statement against `raid_boss` and `raid_contribution` lives here, and
 * it takes its `Database` handle as an argument rather than reaching for a
 * module singleton. That is the whole point of the file.
 * `realm-db.ts` has zero tests and the reason is structural: it hardcodes
 * `resolve(process.cwd(), "data", "realms.db")` behind a module-level cache,
 * so a test cannot point it anywhere disposable. The plan's instruction was
 * to take a path override from the first commit or inherit the same dead end;
 * injecting the handle goes one better, since a caller can hand this an
 * in-memory db and never touch a file.
 *
 * It is also not `server-only` — see `sqlite.ts` for why that marker can't
 * appear anywhere the operator script's import graph reaches.
 *
 * ## The two invariants
 *
 * **The decrement is atomic and idempotent.** An attempt is keyed on its
 * `attempt_id`, a server-issued opaque identifier handed out when the
 * attempt is granted. `recordAttempt` inserts the contribution and subtracts
 * the HP inside one `db.transaction()`; a duplicate id collides on the
 * primary key and the whole transaction is skipped, so a double submission
 * subtracts once.
 *
 * The id used to be the entry transaction's hash, back when an attempt was
 * bought with a surrendered loot item. That cost is gone — it would have
 * made the boss unattemptable on a fresh server, where the first players to
 * reach the raid own exactly one good item and need thirty attempts — and
 * attempts are earned by clearing T5 realms instead. Server-issued is
 * strictly better than a tx hash anyway: it is unpredictable before issue,
 * which is what closes the run-seed grinding the plan worried about, rather
 * than merely making it unprofitable.
 *
 * **The pool only falls.** `current_hp` is clamped at 0, never restored
 * within an edition, and an attempt's recorded `damage` is the amount that
 * actually came off the pool — so the contributor list sums to exactly
 * `total_hp` and the last row is the killing blow. The claim is kept
 * separately in `damage_claimed`: a final attempt that hit for 400 into a
 * pool with 120 left is a more interesting record than one that hit for 120,
 * and the difference is not recoverable once discarded.
 */

import { randomBytes } from "node:crypto";
import type { Database as DatabaseType } from "better-sqlite3";

/** A boss edition. One row per edition, newest highest. */
export type RaidEdition = {
  edition: number;
  totalHp: number;
  currentHp: number;
  /** 1 while the pool is above half, 2 at or below. Derived, stored for queries. */
  phase: 1 | 2;
  openedAt: number;
  /** Unix seconds when the pool reached 0, or null while it still stands. */
  felledAt: number | null;
};

/** One verified attempt against an edition. */
export type RaidContribution = {
  attemptId: `0x${string}`;
  edition: number;
  player: `0x${string}`;
  /** HP this attempt actually removed from the pool (clamped at the remainder). */
  damage: number;
  /** HP the attempt dealt to the boss in its own fight, before clamping. */
  damageClaimed: number;
  turns: number;
  survived: boolean;
  /** True for the single attempt that took the pool to 0. */
  killingBlow: boolean;
  /** Rounds this attempt was allowed, fixed when it was issued. */
  turnLimit: number;
  /** Server-issued run seed, or null for an attempt not opened via `openAttempt`. */
  rngSeed: `0x${string}` | null;
  /** Action trace so far ('a'/'s' per round), or null if never reported. */
  trace: string | null;
  createdAt: number;
};

export type RecordAttemptInput = {
  edition: number;
  attemptId: `0x${string}`;
  player: `0x${string}`;
  damage: number;
  turns: number;
  survived: boolean;
};

export type AdvanceAttemptInput = {
  edition: number;
  attemptId: `0x${string}`;
  player: `0x${string}`;
  /**
   * Total damage this attempt has dealt **since the fight began**, not since
   * the last call. Cumulative is what makes the write idempotent: resending
   * a value already recorded applies nothing, so a retry, a double-click or
   * a duplicated packet cannot double-count.
   */
  cumulativeDamage: number;
  /** Rounds resolved so far. Latest call wins. */
  turns: number;
  survived: boolean;
  /**
   * Action trace for the rounds resolved so far, one character per round.
   * Optional, and only ever replaces a shorter one — see `advanceAttempt`.
   */
  trace?: string;
};

export type RecordAttemptResult = {
  /** True when this hash had already been recorded and nothing was subtracted. */
  duplicate: boolean;
  /** HP removed by *this* call. 0 for a duplicate or an already-felled pool. */
  applied: number;
  /** True when this call is the one that took the pool to 0. */
  felled: boolean;
  /** The edition as it stands after the call. */
  edition: RaidEdition;
};

type BossRow = {
  edition: number;
  total_hp: number;
  current_hp: number;
  phase: number;
  opened_at: number;
  felled_at: number | null;
};

type ContributionRow = {
  attempt_id: string;
  edition: number;
  player: string;
  damage: number;
  damage_claimed: number;
  turns: number;
  survived: number;
  killing_blow: number;
  turn_limit: number;
  rng_seed: string | null;
  trace: string | null;
  created_at: number;
};

/**
 * The phase boundary, in one place.
 *
 * S6 wants the transition to fire when the *collective* crosses half, so it
 * keys off the edition pool rather than a per-attempt HP bar — which is why
 * the engine's `checkPhaseTransition` is handed the edition total as
 * `baseHp` and the current pool as `startHp`. `floor` matches the engine's
 * `monsterHp <= floor(baseHp / 2)`; the two must agree or the bar and the
 * fight disagree about which half the raid is in.
 */
export function phaseFor(totalHp: number, currentHp: number): 1 | 2 {
  return currentHp <= Math.floor(totalHp / 2) ? 2 : 1;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS raid_boss (
    edition    INTEGER PRIMARY KEY,
    total_hp   INTEGER NOT NULL CHECK (total_hp > 0),
    current_hp INTEGER NOT NULL CHECK (current_hp >= 0),
    phase      INTEGER NOT NULL DEFAULT 1 CHECK (phase IN (1, 2)),
    opened_at  INTEGER NOT NULL,
    felled_at  INTEGER
  );

  CREATE TABLE IF NOT EXISTS raid_contribution (
    attempt_id     TEXT PRIMARY KEY,
    edition        INTEGER NOT NULL REFERENCES raid_boss(edition),
    player         TEXT NOT NULL,
    damage         INTEGER NOT NULL CHECK (damage >= 0),
    damage_claimed INTEGER NOT NULL CHECK (damage_claimed >= 0),
    turns          INTEGER NOT NULL CHECK (turns >= 0),
    survived       INTEGER NOT NULL CHECK (survived IN (0, 1)),
    killing_blow   INTEGER NOT NULL DEFAULT 0 CHECK (killing_blow IN (0, 1)),
    -- Fixed when the attempt is issued, not read from config at submit time:
    -- an operator retuning the limit mid-edition must not retroactively
    -- change the rules of a fight already in progress.
    turn_limit     INTEGER NOT NULL DEFAULT 30 CHECK (turn_limit > 0),
    -- Server-issued, stored so the fight can be replayed later. S3 is
    -- deferred, but the seed is the one input that cannot be reconstructed
    -- afterwards, so discarding it would make replay permanently impossible.
    rng_seed       TEXT,
    -- The player's action trace, one character per round ('a' attack,
    -- 's' secondary). ActionChoice is a two-member union, so a whole
    -- fight's input is a bitstring and costs ~30 bytes.
    --
    -- Stored for the same reason as the seed: seed + trace is exactly what
    -- S3's replay needs, and neither can be recovered after the fact. A
    -- prefix of a trace is itself a valid trace, so a partial fight verifies
    -- as happily as a finished one — which is what lets progress be reported
    -- mid-fight without making replay a special case later.
    trace          TEXT,
    created_at     INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_raid_contribution_edition
    ON raid_contribution(edition, created_at);
  CREATE INDEX IF NOT EXISTS idx_raid_contribution_player
    ON raid_contribution(edition, player);

  CREATE TABLE IF NOT EXISTS raid_attempt_grant (
    grant_key  TEXT PRIMARY KEY,
    player     TEXT NOT NULL,
    realm      TEXT NOT NULL,
    spent_on   TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_raid_grant_unspent
    ON raid_attempt_grant(player, spent_on);

  -- One row per receipt owed, written when the pool hits 0 and cleared one
  -- at a time as each mint confirms. Keyed on the recipient rather than the
  -- contribution row: a contributor has many attempts and gets ONE receipt
  -- for their total, so keying on attempts would mint thirty tokens to
  -- someone who fought thirty times.
  --
  -- tx_hash IS NULL is the pending marker, which is what makes the queue
  -- resumable: a crash mid-mint leaves the unfinished rows exactly as they
  -- were, and the next pass picks them up. Nothing is deleted, so the table
  -- is also the permanent record of who was paid for which edition.
  CREATE TABLE IF NOT EXISTS raid_receipt (
    edition      INTEGER NOT NULL REFERENCES raid_boss(edition),
    player       TEXT NOT NULL,
    token_id     TEXT NOT NULL,
    damage       INTEGER NOT NULL CHECK (damage >= 0),
    share_bps    INTEGER NOT NULL CHECK (share_bps >= 0),
    attempts     INTEGER NOT NULL CHECK (attempts > 0),
    killing_blow INTEGER NOT NULL DEFAULT 0 CHECK (killing_blow IN (0, 1)),
    tx_hash      TEXT,
    enqueued_at  INTEGER NOT NULL,
    minted_at    INTEGER,
    PRIMARY KEY (edition, player)
  );

  CREATE INDEX IF NOT EXISTS idx_raid_receipt_pending
    ON raid_receipt(edition, tx_hash);

  CREATE TABLE IF NOT EXISTS raid_unlock (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    t5_clears  INTEGER NOT NULL DEFAULT 0 CHECK (t5_clears >= 0),
    first_t5_at INTEGER,
    updated_at INTEGER NOT NULL
  );
`;

/**
 * Columns added to `raid_contribution` after the table first existed.
 *
 * `CREATE TABLE IF NOT EXISTS` does nothing to a table that is already
 * there, so a database created before one of these columns was declared
 * keeps the old shape and every insert naming the column fails. SQLite has
 * no `ADD COLUMN IF NOT EXISTS`; a duplicate-column error just means it is
 * already present, so that one case is swallowed and anything else rethrown
 * — the same idiom `realm-db.ts` uses for `player_realms`.
 *
 * Worth having even though these tables have never shipped: that was the
 * reasoning for leaving migrations out, and it was wrong in practice the
 * moment a local database outlived a schema change during development.
 */
const CONTRIBUTION_ADDED_COLUMNS = [
  "turn_limit INTEGER NOT NULL DEFAULT 30",
  "rng_seed TEXT",
  "trace TEXT",
] as const;

/**
 * Create the raid tables if they are absent, and add any column a
 * pre-existing database is missing. Safe to call repeatedly; callers gate it
 * behind a module-local flag so it costs one no-op pass per process rather
 * than one per query.
 *
 * Renames are deliberately *not* handled. `entry_tx_hash` became
 * `attempt_id` while this was unshipped, and that column is the primary key
 * — it cannot be added by `ALTER` — so a database from before that change is
 * a development artifact to delete rather than something to migrate. If the
 * schema ever changes a key after shipping, that needs a real table rebuild,
 * not a line here.
 */
export function migrateRaidTables(db: DatabaseType): void {
  db.exec(SCHEMA);
  for (const col of CONTRIBUTION_ADDED_COLUMNS) {
    try {
      db.exec(`ALTER TABLE raid_contribution ADD COLUMN ${col}`);
    } catch (err) {
      if (!String(err).includes("duplicate column name")) throw err;
    }
  }
}

function toEdition(r: BossRow): RaidEdition {
  return {
    edition: r.edition,
    totalHp: r.total_hp,
    currentHp: r.current_hp,
    phase: r.phase === 2 ? 2 : 1,
    openedAt: r.opened_at,
    felledAt: r.felled_at ?? null,
  };
}

function toContribution(r: ContributionRow): RaidContribution {
  return {
    attemptId: r.attempt_id as `0x${string}`,
    edition: r.edition,
    player: r.player as `0x${string}`,
    damage: r.damage,
    damageClaimed: r.damage_claimed,
    turns: r.turns,
    survived: r.survived === 1,
    killingBlow: r.killing_blow === 1,
    turnLimit: r.turn_limit,
    rngSeed: (r.rng_seed as `0x${string}` | null) ?? null,
    trace: r.trace ?? null,
    createdAt: r.created_at,
  };
}

/** The highest-numbered edition, felled or standing. `undefined` before the first. */
export function getCurrentEdition(db: DatabaseType): RaidEdition | undefined {
  const row = db
    .prepare<[], BossRow>(
      "SELECT * FROM raid_boss ORDER BY edition DESC LIMIT 1",
    )
    .get();
  return row ? toEdition(row) : undefined;
}

export function getEdition(
  db: DatabaseType,
  edition: number,
): RaidEdition | undefined {
  const row = db
    .prepare<[number], BossRow>("SELECT * FROM raid_boss WHERE edition = ?")
    .get(edition);
  return row ? toEdition(row) : undefined;
}

export function listEditions(db: DatabaseType): RaidEdition[] {
  return db
    .prepare<[], BossRow>("SELECT * FROM raid_boss ORDER BY edition ASC")
    .all()
    .map(toEdition);
}

/**
 * Open the next edition at `totalHp`.
 *
 * Refuses while an edition still stands — two open editions would split
 * contributions across two pools and there is no sensible answer to "which
 * one does this attempt hit". The edition number is `MAX + 1` rather than a
 * caller argument so it cannot be made non-contiguous by a typo.
 *
 * `totalHp` is the caller's to choose, and
 * `scripts/colophon-damage.ts --target-attempts N` is how to derive it:
 * attempts-to-kill is the legible figure and HP is that multiplied out.
 */
export function openNextEdition(
  db: DatabaseType,
  totalHp: number,
  now = Math.floor(Date.now() / 1000),
): RaidEdition {
  // `RAID_EDITION_HP` is the configured default, but it is the *caller's* job
  // to read it — this module stays free of env so tests and scripts can hand
  // it any number without a environment in place.
  if (!Number.isInteger(totalHp) || totalHp <= 0) {
    throw new Error(`totalHp must be a positive integer, got ${totalHp}`);
  }
  const tx = db.transaction((): RaidEdition => {
    const current = getCurrentEdition(db);
    if (current && current.felledAt === null) {
      throw new Error(
        `edition ${current.edition} is still standing ` +
          `(${current.currentHp}/${current.totalHp} HP) — it must fall first`,
      );
    }
    const edition = (current?.edition ?? 0) + 1;
    db.prepare(
      `INSERT INTO raid_boss (edition, total_hp, current_hp, phase, opened_at, felled_at)
       VALUES (?, ?, ?, ?, ?, NULL)`,
    ).run(edition, totalHp, totalHp, phaseFor(totalHp, totalHp), now);
    return getEdition(db, edition)!;
  });
  return tx();
}

/**
 * Fetch an edition that can still take attempts, or explain why not.
 *
 * A felled edition throws rather than no-oping: someone mid-fight when the
 * boss died is a real condition and the caller has to tell them something.
 */
function requireStandingEdition(
  db: DatabaseType,
  edition: number,
): RaidEdition {
  const boss = getEdition(db, edition);
  if (!boss) throw new Error(`no such edition: ${edition}`);
  if (boss.felledAt !== null) {
    throw new Error(
      `edition ${boss.edition} was felled at ${boss.felledAt}; it takes no more attempts`,
    );
  }
  return boss;
}

/**
 * Subtract from the pool, re-derive the phase, and stamp `felled_at` if this
 * is the blow that ended it. The one place the pool is written, so the clamp
 * and the phase rule cannot drift between the two submission paths.
 */
function applyToPool(
  db: DatabaseType,
  boss: RaidEdition,
  applied: number,
  remaining: number,
  felled: boolean,
  now: number,
): void {
  if (applied <= 0) return;
  db.prepare(
    `UPDATE raid_boss
        SET current_hp = MAX(0, current_hp - ?),
            phase      = ?,
            felled_at  = CASE WHEN ? THEN ? ELSE felled_at END
      WHERE edition = ?`,
  ).run(applied, phaseFor(boss.totalHp, remaining), felled ? 1 : 0, now, boss.edition);
}

/**
 * Advance an attempt's progress and subtract whatever is newly earned.
 *
 * ## The submission shape, settled
 *
 * The plan left this open with two options — submit once when the run
 * resolves, or submit per swing — and flagged the cost of the first: closing
 * the tab mid-fight would submit nothing, so "dying contributes" would be
 * false for rage-quits specifically, which is the best line in the fiction
 * made into a lie. Neither option is needed. **Submissions carry the
 * attempt's cumulative damage and the server applies the delta.**
 *
 * That is a strict generalisation of both:
 *
 *   - Submitting once at the end is one call with the final total, which is
 *     exactly the old behaviour (`recordAttempt` is now a wrapper).
 *   - Submitting every round is N calls, and the pool moves live — which for
 *     a *collaborative* boss is a feature, not just damage limitation: you
 *     watch the bar move while you fight it.
 *   - Anything between works too: every five rounds, on visibility change,
 *     on unload. Abandonment then loses at most the rounds since the last
 *     call rather than the whole attempt.
 *
 * Cumulative rather than incremental is what buys the idempotency. An
 * increment (`+37 damage`) applied twice is wrong and there is no way to
 * tell the second from a legitimate second increment of the same size. A
 * cumulative total replayed is a no-op by construction, so retries,
 * double-clicks and duplicated packets are all free. It is also monotonic:
 * a submission reporting *less* than what is already recorded — a stale
 * packet arriving late — applies nothing rather than crediting backwards.
 *
 * Throws when the edition is missing or already felled. An attempt against
 * a felled edition is a real condition (someone was mid-fight when the boss
 * died) and the caller has to decide what to tell them, so it must not be
 * silently swallowed as a no-op.
 */
export function advanceAttempt(
  db: DatabaseType,
  input: AdvanceAttemptInput,
  now = Math.floor(Date.now() / 1000),
): RecordAttemptResult {
  if (!Number.isInteger(input.cumulativeDamage) || input.cumulativeDamage < 0) {
    throw new Error(
      `cumulativeDamage must be a non-negative integer, got ${input.cumulativeDamage}`,
    );
  }
  const hash = input.attemptId.toLowerCase() as `0x${string}`;
  const player = input.player.toLowerCase() as `0x${string}`;

  const tx = db.transaction((): RecordAttemptResult => {
    const boss = requireStandingEdition(db, input.edition);
    const prior = db
      .prepare<[string], ContributionRow>(
        "SELECT * FROM raid_contribution WHERE attempt_id = ?",
      )
      .get(hash);
    if (prior && prior.edition !== input.edition) {
      // The hash is the attempt, and an attempt belongs to one edition. A
      // collision across editions means the caller mismatched them.
      throw new Error(
        `attempt ${hash} already belongs to edition ${prior.edition}, not ${input.edition}`,
      );
    }

    // Monotonic: only growth past what is already claimed can earn anything.
    const priorClaimed = prior?.damage_claimed ?? 0;
    const newClaim = Math.max(0, input.cumulativeDamage - priorClaimed);
    const applied = Math.min(newClaim, boss.currentHp);
    const remaining = boss.currentHp - applied;
    const felled = remaining === 0;

    if (prior) {
      // The trace only ever grows: a shorter one is a stale packet, and
      // keeping the longer is the same monotonic rule damage follows. Length
      // rather than content, because a trace is append-only by construction —
      // earlier rounds cannot change once resolved.
      const nextTrace =
        input.trace !== undefined &&
        input.trace.length >= (prior.trace?.length ?? 0)
          ? input.trace
          : prior.trace;
      db.prepare(
        `UPDATE raid_contribution
            SET damage         = damage + ?,
                damage_claimed = MAX(damage_claimed, ?),
                turns          = ?,
                survived       = ?,
                killing_blow   = MAX(killing_blow, ?),
                trace          = ?
          WHERE attempt_id = ?`,
      ).run(
        applied,
        input.cumulativeDamage,
        input.turns,
        input.survived ? 1 : 0,
        felled ? 1 : 0,
        nextTrace,
        hash,
      );
    } else {
      db.prepare(
        `INSERT INTO raid_contribution (
           attempt_id, edition, player, damage, damage_claimed,
           turns, survived, killing_blow, trace, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        hash,
        input.edition,
        player,
        applied,
        input.cumulativeDamage,
        input.turns,
        input.survived ? 1 : 0,
        felled ? 1 : 0,
        input.trace ?? null,
        now,
      );
    }

    applyToPool(db, boss, applied, remaining, felled, now);

    return {
      duplicate: prior !== undefined && applied === 0,
      applied,
      felled: felled && applied > 0,
      edition: getEdition(db, input.edition)!,
    };
  });
  return tx();
}

/**
 * Record a finished attempt in one write — **first submission wins, for
 * good**.
 *
 * Deliberately *not* a wrapper over `advanceAttempt`, because the two make
 * different promises and a caller has to pick one knowingly:
 *
 *   - This one is write-once. A second submission on the same hash is
 *     ignored whatever it claims, including a larger number. Use it when the
 *     attempt is submitted exactly once, at the end.
 *   - `advanceAttempt` is write-many and monotonic. A larger number is
 *     progress, by design — which means the hash alone no longer bounds what
 *     an attempt can claim, and something else has to (the turn limit, and
 *     S3's replay when it lands).
 *
 * Collapsing them would have silently converted every existing caller to the
 * weaker guarantee.
 */
export function recordAttempt(
  db: DatabaseType,
  input: RecordAttemptInput,
  now = Math.floor(Date.now() / 1000),
): RecordAttemptResult {
  if (!Number.isInteger(input.damage) || input.damage < 0) {
    throw new Error(`damage must be a non-negative integer, got ${input.damage}`);
  }
  const hash = input.attemptId.toLowerCase() as `0x${string}`;
  const player = input.player.toLowerCase() as `0x${string}`;

  const tx = db.transaction((): RecordAttemptResult => {
    const boss = requireStandingEdition(db, input.edition);
    const applied = Math.min(input.damage, boss.currentHp);
    const remaining = boss.currentHp - applied;
    const felled = remaining === 0;

    // `INSERT OR IGNORE` first and subtract only if it landed: a repeat
    // inserts 0 rows and returns before the pool is touched. Expressed as an
    // ignored insert rather than a caught constraint error because a
    // duplicate here is an expected flow, not an exception.
    const res = db
      .prepare(
        `INSERT OR IGNORE INTO raid_contribution (
           attempt_id, edition, player, damage, damage_claimed,
           turns, survived, killing_blow, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        hash,
        input.edition,
        player,
        applied,
        input.damage,
        input.turns,
        input.survived ? 1 : 0,
        felled ? 1 : 0,
        now,
      );

    if (res.changes === 0) {
      return { duplicate: true, applied: 0, felled: false, edition: boss };
    }
    applyToPool(db, boss, applied, remaining, felled, now);
    return {
      duplicate: false,
      applied,
      felled,
      edition: getEdition(db, input.edition)!,
    };
  });
  return tx();
}

/**
 * Force `current_hp` to a value, outside the contribution flow.
 *
 * This is the operator correction path and nothing else — it exists because
 * a bug that over-subtracts has no other remedy once the pool has moved, and
 * the alternative is hand-editing a sqlite file on the demo box. It
 * deliberately does **not** touch `raid_contribution`, so the contributor
 * rows stop summing to the damage taken off the pool the moment it is used.
 * That divergence is the honest record of an intervention having happened,
 * and is preferable to rewriting history so the books balance.
 *
 * Re-deriving `felled_at` both ways is intentional: raising a felled
 * edition back above 0 un-fells it, because the alternative is an edition
 * that reads as both standing and dead.
 */
export function correctCurrentHp(
  db: DatabaseType,
  edition: number,
  currentHp: number,
  now = Math.floor(Date.now() / 1000),
): RaidEdition {
  const tx = db.transaction((): RaidEdition => {
    const boss = getEdition(db, edition);
    if (!boss) throw new Error(`no such edition: ${edition}`);
    if (!Number.isInteger(currentHp) || currentHp < 0) {
      throw new Error(`currentHp must be a non-negative integer, got ${currentHp}`);
    }
    if (currentHp > boss.totalHp) {
      throw new Error(
        `currentHp ${currentHp} exceeds edition ${edition}'s total of ${boss.totalHp}`,
      );
    }
    db.prepare(
      `UPDATE raid_boss
          SET current_hp = ?, phase = ?,
              felled_at = CASE WHEN ? THEN COALESCE(felled_at, ?) ELSE NULL END
        WHERE edition = ?`,
    ).run(
      currentHp,
      phaseFor(boss.totalHp, currentHp),
      currentHp === 0 ? 1 : 0,
      now,
      edition,
    );
    return getEdition(db, edition)!;
  });
  return tx();
}

export function getContribution(
  db: DatabaseType,
  attemptId: `0x${string}`,
): RaidContribution | undefined {
  const row = db
    .prepare<[string], ContributionRow>(
      "SELECT * FROM raid_contribution WHERE attempt_id = ?",
    )
    .get(attemptId.toLowerCase());
  return row ? toContribution(row) : undefined;
}

/** Every attempt against an edition, oldest first. The kill's record. */
export function listContributions(
  db: DatabaseType,
  edition: number,
): RaidContribution[] {
  return db
    .prepare<[number], ContributionRow>(
      "SELECT * FROM raid_contribution WHERE edition = ? ORDER BY created_at ASC, rowid ASC",
    )
    .all(edition)
    .map(toContribution);
}

export type ContributorTotal = {
  player: `0x${string}`;
  damage: number;
  attempts: number;
  killingBlow: boolean;
};

/**
 * Per-player totals for an edition, heaviest first — the contributor list
 * the kill is remembered by. Aggregated in SQL rather than in JS because
 * this is read by the felled-edition surface, which has no reason to pull
 * thirty rows per player across the wire to add them up.
 */
export function listContributors(
  db: DatabaseType,
  edition: number,
): ContributorTotal[] {
  return db
    .prepare<
      [number],
      { player: string; damage: number; attempts: number; killing_blow: number }
    >(
      `SELECT player,
              SUM(damage)       AS damage,
              COUNT(*)          AS attempts,
              MAX(killing_blow) AS killing_blow
         FROM raid_contribution
        WHERE edition = ?
        GROUP BY player
        ORDER BY damage DESC, attempts ASC, player ASC`,
    )
    .all(edition)
    .map((r) => ({
      player: r.player as `0x${string}`,
      damage: r.damage,
      attempts: r.attempts,
      killingBlow: r.killing_blow === 1,
    }));
}

// ---------------------------------------------------------------------------
// Earned attempts
// ---------------------------------------------------------------------------

/**
 * Why attempts are earned rather than bought.
 *
 * The plan priced an attempt at one surrendered loot item, with its tier
 * buying the turn limit. That was dropped: it would have made the boss
 * unattemptable exactly when it matters, because the first players to reach
 * the raid own one good item and need roughly thirty attempts, and T5 gear
 * requires a T5 realm — fifty distinct clearers — so there is no stock of
 * spare items to spend on a fresh server.
 *
 * A flat per-day cooldown has the mirror-image failure: thirty attempts at
 * one a day is a month to fell edition 1, so the kill and the contributor
 * list still never get exercised.
 *
 * Clearing a T5 realm grants an attempt instead. It paces itself against
 * play rather than the clock, it is sybil-resistant for free — a burner
 * wallet cannot farm fifty distinct clearers to get T5 gear in the first
 * place — and it reuses the hook the unlock gate already needed, so it costs
 * no chain work, no sink address, and loses no items to a failed credit.
 */
export type AttemptGrant = {
  /** The clear that earned it; the clearReceipt tokenId. */
  grantKey: string;
  player: `0x${string}`;
  realm: `0x${string}`;
  /** The attempt that consumed it, or null while unspent. */
  spentOn: string | null;
  createdAt: number;
};

/**
 * Credit a player with one attempt for clearing a T5 realm.
 *
 * `grantKey` must be the clearReceipt's tokenId, which is derived from
 * (realm, player, runSeed) and is therefore unique per clear. Keying on it
 * makes the grant idempotent **by construction** rather than by where the
 * call sits: a retried or replayed clear re-presents the same token id,
 * collides on the primary key, and grants nothing. The unlock counter next
 * to it has no such key and has to lean on the route's early return, which
 * is the weaker arrangement of the two.
 *
 * Returns whether this call was the one that granted.
 */
export function grantAttempt(
  db: DatabaseType,
  args: { grantKey: string | bigint; player: `0x${string}`; realm: `0x${string}` },
  now = Math.floor(Date.now() / 1000),
): boolean {
  const res = db
    .prepare(
      `INSERT OR IGNORE INTO raid_attempt_grant
         (grant_key, player, realm, spent_on, created_at)
       VALUES (?, ?, ?, NULL, ?)`,
    )
    .run(
      String(args.grantKey),
      args.player.toLowerCase(),
      args.realm.toLowerCase(),
      now,
    );
  return res.changes > 0;
}

/** Unspent attempts a player holds. */
export function attemptBalance(
  db: DatabaseType,
  player: `0x${string}`,
): number {
  const row = db
    .prepare<[string], { n: number }>(
      "SELECT COUNT(*) AS n FROM raid_attempt_grant WHERE player = ? AND spent_on IS NULL",
    )
    .get(player.toLowerCase());
  return row?.n ?? 0;
}

export function listGrants(
  db: DatabaseType,
  player: `0x${string}`,
): AttemptGrant[] {
  return db
    .prepare<
      [string],
      {
        grant_key: string;
        player: string;
        realm: string;
        spent_on: string | null;
        created_at: number;
      }
    >(
      "SELECT * FROM raid_attempt_grant WHERE player = ? ORDER BY created_at ASC",
    )
    .all(player.toLowerCase())
    .map((r) => ({
      grantKey: r.grant_key,
      player: r.player as `0x${string}`,
      realm: r.realm as `0x${string}`,
      spentOn: r.spent_on,
      createdAt: r.created_at,
    }));
}

export type IssuedAttempt = {
  attemptId: `0x${string}`;
  /** Server-chosen run seed. The client never picks this — see below. */
  rngSeed: `0x${string}`;
  edition: number;
  player: `0x${string}`;
  turnLimit: number;
  /** The pool as it stood when the attempt opened. */
  startHp: number;
  /** The edition total, which the fight passes as the boss's `baseHp`. */
  editionHp: number;
};

/** 32 random bytes as hex — the shape `createRng` requires for a seed. */
function randomHex32(): `0x${string}` {
  return `0x${randomBytes(32).toString("hex")}` as `0x${string}`;
}

/**
 * Spend one earned attempt and issue it.
 *
 * Both the id and the run seed are server-generated random 32-byte values,
 * which is what closes the grinding hole the plan flagged: `deriveRunSeed`'s
 * nonce was a client timestamp, so a client could brute-force nonces offline
 * and submit its luckiest run — and replay would accept it, correctly,
 * because it *was* a legitimate run. S1 measured that gain at 2.2x, small
 * enough not to matter here, but an unpredictable server seed removes it for
 * free rather than tolerating it. They are two independent randoms rather
 * than one derived from the other so that knowing the public identifier tells
 * you nothing about the seed before the fight starts.
 *
 * Spending and issuing happen in one transaction, so a crash between them
 * cannot burn a grant without producing an attempt, or vice versa.
 */
export function openAttempt(
  db: DatabaseType,
  args: { edition: number; player: `0x${string}`; turnLimit: number },
  now = Math.floor(Date.now() / 1000),
): IssuedAttempt {
  const player = args.player.toLowerCase() as `0x${string}`;
  if (!Number.isInteger(args.turnLimit) || args.turnLimit <= 0) {
    throw new Error(`turnLimit must be a positive integer, got ${args.turnLimit}`);
  }

  const tx = db.transaction((): IssuedAttempt => {
    const boss = requireStandingEdition(db, args.edition);
    const grant = db
      .prepare<[string], { grant_key: string }>(
        // `rowid` breaks ties: timestamps are whole seconds, so two clears in
        // the same second would otherwise have undefined spend order.
        `SELECT grant_key FROM raid_attempt_grant
          WHERE player = ? AND spent_on IS NULL
          ORDER BY created_at ASC, rowid ASC LIMIT 1`,
      )
      .get(player);
    if (!grant) {
      throw new Error(
        `${player} has no unspent attempts — clear a T5 realm to earn one`,
      );
    }

    const attemptId = randomHex32();
    const rngSeed = randomHex32();

    // Guarded on `spent_on IS NULL` as well as the key so the spend is the
    // thing that fails if two issues race, rather than the grant silently
    // being reused.
    const spent = db
      .prepare(
        "UPDATE raid_attempt_grant SET spent_on = ? WHERE grant_key = ? AND spent_on IS NULL",
      )
      .run(attemptId, grant.grant_key);
    if (spent.changes === 0) {
      throw new Error(`grant ${grant.grant_key} was already spent`);
    }

    db.prepare(
      `INSERT INTO raid_contribution (
         attempt_id, edition, player, damage, damage_claimed,
         turns, survived, killing_blow, turn_limit, rng_seed, trace, created_at
       ) VALUES (?, ?, ?, 0, 0, 0, 0, 0, ?, ?, NULL, ?)`,
    ).run(attemptId, args.edition, player, args.turnLimit, rngSeed, now);

    return {
      attemptId,
      rngSeed,
      edition: args.edition,
      player,
      turnLimit: args.turnLimit,
      startHp: boss.currentHp,
      editionHp: boss.totalHp,
    };
  });
  return tx();
}

// ---------------------------------------------------------------------------
// Kill receipts — enqueued on the fall, minted one at a time
// ---------------------------------------------------------------------------

export type RaidReceipt = {
  edition: number;
  player: `0x${string}`;
  /** Decimal string: a uint256 overflows JS `number`. */
  tokenId: string;
  damage: number;
  shareBps: number;
  attempts: number;
  killingBlow: boolean;
  /** Null while the mint has not landed — the pending marker. */
  txHash: `0x${string}` | null;
  enqueuedAt: number;
  mintedAt: number | null;
};

type ReceiptRow = {
  edition: number;
  player: string;
  token_id: string;
  damage: number;
  share_bps: number;
  attempts: number;
  killing_blow: number;
  tx_hash: string | null;
  enqueued_at: number;
  minted_at: number | null;
};

function toReceipt(r: ReceiptRow): RaidReceipt {
  return {
    edition: r.edition,
    player: r.player as `0x${string}`,
    tokenId: r.token_id,
    damage: r.damage,
    shareBps: r.share_bps,
    attempts: r.attempts,
    killingBlow: r.killing_blow === 1,
    txHash: (r.tx_hash as `0x${string}` | null) ?? null,
    enqueuedAt: r.enqueued_at,
    mintedAt: r.minted_at ?? null,
  };
}

/**
 * Write the receipt queue for a felled edition.
 *
 * **Receipts mint when he falls, not per attempt.** Per-attempt minting
 * would be a transaction per fight for no benefit — the thing worth
 * recording is a contributor's share of the whole kill, which is not known
 * until the pool is empty.
 *
 * Takes a `tokenIdFor` callback rather than importing the deriver, so this
 * module stays free of `viem` and the queue can be tested without it. The
 * real caller passes `deriveRaidReceiptTokenId`.
 *
 * Idempotent on `(edition, player)`: calling it twice for the same edition
 * inserts nothing the second time and — importantly — does **not** reset the
 * `tx_hash` of anything already minted. So a second kill notification, or a
 * retry after a partial run, cannot cause a double mint.
 *
 * Refuses an edition that still stands. Enqueuing early would snapshot
 * shares against an incomplete pool and quietly pay everyone the wrong
 * amount, which is worse than failing.
 */
export function enqueueKillReceipts(
  db: DatabaseType,
  edition: number,
  tokenIdFor: (args: { edition: number; player: `0x${string}` }) => bigint,
  shareFor: (damage: number, editionHp: number) => number,
  now = Math.floor(Date.now() / 1000),
): RaidReceipt[] {
  const tx = db.transaction((): RaidReceipt[] => {
    const boss = getEdition(db, edition);
    if (!boss) throw new Error(`no such edition: ${edition}`);
    if (boss.felledAt === null) {
      throw new Error(
        `edition ${edition} still stands (${boss.currentHp}/${boss.totalHp}) — ` +
          "receipts are owed only once it has fallen",
      );
    }

    for (const c of listContributors(db, edition)) {
      // Zero-damage contributors get nothing. Dying for nothing is still
      // recorded as a contribution row, but a receipt claiming a 0% share
      // is a worse memento than no receipt.
      if (c.damage <= 0) continue;
      db.prepare(
        `INSERT OR IGNORE INTO raid_receipt (
           edition, player, token_id, damage, share_bps, attempts,
           killing_blow, tx_hash, enqueued_at, minted_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL)`,
      ).run(
        edition,
        c.player,
        tokenIdFor({ edition, player: c.player }).toString(),
        c.damage,
        shareFor(c.damage, boss.totalHp),
        c.attempts,
        c.killingBlow ? 1 : 0,
        now,
      );
    }
    return listReceipts(db, edition);
  });
  return tx();
}

export function listReceipts(db: DatabaseType, edition: number): RaidReceipt[] {
  return db
    .prepare<[number], ReceiptRow>(
      // Killing blow first, then heaviest — the order a reader wants, and
      // the order the mints should go out in if only some of them land.
      `SELECT * FROM raid_receipt WHERE edition = ?
        ORDER BY killing_blow DESC, damage DESC, player ASC`,
    )
    .all(edition)
    .map(toReceipt);
}

/** Receipts still owed for an edition, in the order they should be minted. */
export function pendingReceipts(
  db: DatabaseType,
  edition: number,
): RaidReceipt[] {
  return listReceipts(db, edition).filter((r) => r.txHash === null);
}

/**
 * Mark one receipt minted.
 *
 * Guarded on `tx_hash IS NULL` so the first write wins: if two passes
 * somehow overlap, the second cannot overwrite the recorded transaction
 * with its own and leave two hashes claiming to be the mint.
 */
export function markReceiptMinted(
  db: DatabaseType,
  edition: number,
  player: `0x${string}`,
  txHash: `0x${string}`,
  now = Math.floor(Date.now() / 1000),
): boolean {
  const res = db
    .prepare(
      `UPDATE raid_receipt SET tx_hash = ?, minted_at = ?
        WHERE edition = ? AND player = ? AND tx_hash IS NULL`,
    )
    .run(txHash, now, edition, player.toLowerCase());
  return res.changes > 0;
}

/** Editions with receipts still owed — what a resuming worker asks for. */
export function editionsWithPendingReceipts(db: DatabaseType): number[] {
  return db
    .prepare<[], { edition: number }>(
      `SELECT DISTINCT edition FROM raid_receipt
        WHERE tx_hash IS NULL ORDER BY edition ASC`,
    )
    .all()
    .map((r) => r.edition);
}

// ---------------------------------------------------------------------------
// The unlock gate — counted forward, never scanned
// ---------------------------------------------------------------------------

export type RaidUnlock = {
  /** Clears of T5 realms recorded so far. */
  t5Clears: number;
  /** Unix seconds of the first T5 clear, or null before there is one. */
  firstT5At: number | null;
  updatedAt: number | null;
};

/**
 * Read the unlock counter. Zeroed rather than absent before the first clear,
 * so callers never branch on "no row yet".
 */
export function getRaidUnlock(db: DatabaseType): RaidUnlock {
  const row = db
    .prepare<
      [],
      { t5_clears: number; first_t5_at: number | null; updated_at: number }
    >("SELECT t5_clears, first_t5_at, updated_at FROM raid_unlock WHERE id = 1")
    .get();
  return {
    t5Clears: row?.t5_clears ?? 0,
    firstT5At: row?.first_t5_at ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

/**
 * Record one clear of a T5 realm.
 *
 * **Counted forward on purpose.** The gate's natural phrasing — "how many
 * times have T5 realms been cleared" — reads like a query, and answering it
 * by query is the trap: `fetchRealmActivityCounts` is an **uncapped**
 * `AssetMinted` scan per realm behind a 15s cache, so evaluating it on
 * demand means scanning the full history of every realm in the registry on
 * a cache miss. At the moment a clear is minted the route already knows the
 * realm and can resolve its tier from that same cache, so incrementing an
 * integer there turns an O(realms × history) read into an O(1) one.
 *
 * Call this **only** for a receipt that was actually minted by this request.
 * `/api/realm/boss-cleared` returns early on an already-minted replay, which
 * is what keeps a retried submission from counting twice — the idempotency
 * lives in that route's mint path, not here, because this has no key to
 * dedupe on.
 */
export function bumpT5Clears(
  db: DatabaseType,
  now = Math.floor(Date.now() / 1000),
): RaidUnlock {
  db.prepare(
    `INSERT INTO raid_unlock (id, t5_clears, first_t5_at, updated_at)
     VALUES (1, 1, ?, ?)
     ON CONFLICT(id) DO UPDATE
       SET t5_clears  = t5_clears + 1,
           first_t5_at = COALESCE(first_t5_at, ?),
           updated_at  = ?`,
  ).run(now, now, now, now);
  return getRaidUnlock(db);
}

/** How many attempts a player has already spent on an edition. */
export function countPlayerAttempts(
  db: DatabaseType,
  edition: number,
  player: `0x${string}`,
): number {
  const row = db
    .prepare<[number, string], { n: number }>(
      "SELECT COUNT(*) AS n FROM raid_contribution WHERE edition = ? AND player = ?",
    )
    .get(edition, player.toLowerCase());
  return row?.n ?? 0;
}
