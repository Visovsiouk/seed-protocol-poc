/**
 * Tests for the raid persistence layer.
 *
 * These exist because `realm-db.ts` has none and the reason was structural —
 * a module-level singleton pointed at `process.cwd()/data/realms.db` cannot
 * be aimed anywhere disposable. `raid-store.ts` takes its handle as an
 * argument, so every case here runs against a fresh `:memory:` database with
 * no file, no cleanup and no shared state between tests.
 *
 * The cases follow the plan's verification list: idempotency, the zero
 * crossing with exactly one killing blow, and the phase transition firing on
 * the edition pool rather than per attempt.
 */

import Database, { type Database as DatabaseType } from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import {
  advanceAttempt,
  attemptBalance,
  bumpT5Clears,
  correctCurrentHp,
  countPlayerAttempts,
  getContribution,
  getCurrentEdition,
  getRaidUnlock,
  grantAttempt,
  listContributions,
  listContributors,
  listGrants,
  migrateRaidTables,
  openAttempt,
  openNextEdition,
  phaseFor,
  recordAttempt,
} from "./raid-store";

const ALICE = "0x00000000000000000000000000000000000000a1" as `0x${string}`;
const BOB = "0x00000000000000000000000000000000000000b2" as `0x${string}`;

/** Distinct, deterministic attempt ids. */
function hash(n: number): `0x${string}` {
  return `0x${n.toString(16).padStart(64, "0")}` as `0x${string}`;
}

let db: DatabaseType;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrateRaidTables(db);
});

describe("migrateRaidTables", () => {
  it("is idempotent", () => {
    expect(() => {
      migrateRaidTables(db);
      migrateRaidTables(db);
    }).not.toThrow();
  });

  it("adds columns a pre-existing database is missing", () => {
    // A database created before `turn_limit`, `rng_seed` and `trace` were
    // declared. `CREATE TABLE IF NOT EXISTS` does nothing to it, so without
    // the ALTER pass every insert naming those columns fails — which is
    // exactly what happened to a local db during development.
    const old = new Database(":memory:");
    old.exec(`
      CREATE TABLE raid_boss (
        edition INTEGER PRIMARY KEY, total_hp INTEGER NOT NULL,
        current_hp INTEGER NOT NULL, phase INTEGER NOT NULL DEFAULT 1,
        opened_at INTEGER NOT NULL, felled_at INTEGER
      );
      CREATE TABLE raid_contribution (
        attempt_id TEXT PRIMARY KEY,
        edition INTEGER NOT NULL REFERENCES raid_boss(edition),
        player TEXT NOT NULL,
        damage INTEGER NOT NULL,
        damage_claimed INTEGER NOT NULL,
        turns INTEGER NOT NULL,
        survived INTEGER NOT NULL,
        killing_blow INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
    `);

    migrateRaidTables(old);

    openNextEdition(old, 500);
    grantAttempt(old, { grantKey: "k", player: ALICE, realm: ALICE });
    const issued = openAttempt(old, {
      edition: 1,
      player: ALICE,
      turnLimit: 25,
    });
    expect(getContribution(old, issued.attemptId)).toMatchObject({
      turnLimit: 25,
      rngSeed: issued.rngSeed,
      trace: null,
    });
    old.close();
  });
});

describe("openNextEdition", () => {
  it("numbers editions from 1 and opens at full HP", () => {
    const e = openNextEdition(db, 1000);
    expect(e.edition).toBe(1);
    expect(e.currentHp).toBe(1000);
    expect(e.totalHp).toBe(1000);
    expect(e.phase).toBe(1);
    expect(e.felledAt).toBeNull();
  });

  it("refuses a second edition while the first still stands", () => {
    openNextEdition(db, 1000);
    expect(() => openNextEdition(db, 500)).toThrow(/still standing/);
  });

  it("opens the successor once the pool has fallen", () => {
    openNextEdition(db, 100);
    recordAttempt(db, {
      edition: 1,
      attemptId: hash(1),
      player: ALICE,
      damage: 100,
      turns: 10,
      survived: true,
    });
    const second = openNextEdition(db, 250);
    expect(second.edition).toBe(2);
    expect(second.currentHp).toBe(250);
    expect(getCurrentEdition(db)?.edition).toBe(2);
  });

  it("rejects a non-positive total", () => {
    expect(() => openNextEdition(db, 0)).toThrow(/positive integer/);
    expect(() => openNextEdition(db, -5)).toThrow(/positive integer/);
  });
});

describe("recordAttempt — idempotency", () => {
  beforeEach(() => openNextEdition(db, 1000));

  it("subtracts once when the same attempt id is submitted twice", () => {
    const input = {
      edition: 1,
      attemptId: hash(7),
      player: ALICE,
      damage: 300,
      turns: 30,
      survived: false,
    };
    const first = recordAttempt(db, input);
    const second = recordAttempt(db, input);

    expect(first.duplicate).toBe(false);
    expect(first.applied).toBe(300);
    expect(second.duplicate).toBe(true);
    expect(second.applied).toBe(0);
    expect(getCurrentEdition(db)?.currentHp).toBe(700);
    expect(listContributions(db, 1)).toHaveLength(1);
  });

  it("does not let a duplicate overwrite the original row", () => {
    const base = {
      edition: 1,
      attemptId: hash(8),
      player: ALICE,
      damage: 100,
      turns: 10,
      survived: true,
    };
    recordAttempt(db, base);
    recordAttempt(db, { ...base, player: BOB, damage: 900, turns: 99 });

    const row = getContribution(db, hash(8))!;
    expect(row.player).toBe(ALICE);
    expect(row.damage).toBe(100);
    expect(row.turns).toBe(10);
    expect(getCurrentEdition(db)?.currentHp).toBe(900);
  });

  it("is case-insensitive on the id, since a client may re-case it", () => {
    recordAttempt(db, {
      edition: 1,
      attemptId: hash(9),
      player: ALICE,
      damage: 50,
      turns: 5,
      survived: true,
    });
    const upper = ("0x" + hash(9).slice(2).toUpperCase()) as `0x${string}`;
    const again = recordAttempt(db, {
      edition: 1,
      attemptId: upper,
      player: ALICE,
      damage: 50,
      turns: 5,
      survived: true,
    });
    expect(again.duplicate).toBe(true);
    expect(getCurrentEdition(db)?.currentHp).toBe(950);
  });
});

describe("recordAttempt — the zero crossing", () => {
  it("clamps damage to the remainder and records exactly one killing blow", () => {
    openNextEdition(db, 500);
    recordAttempt(db, {
      edition: 1,
      attemptId: hash(1),
      player: ALICE,
      damage: 400,
      turns: 30,
      survived: false,
    });
    // Overkill: 300 claimed into a pool with 100 left.
    const kill = recordAttempt(db, {
      edition: 1,
      attemptId: hash(2),
      player: BOB,
      damage: 300,
      turns: 12,
      survived: true,
    });

    expect(kill.applied).toBe(100);
    expect(kill.felled).toBe(true);
    expect(kill.edition.currentHp).toBe(0);
    expect(kill.edition.felledAt).not.toBeNull();

    const rows = listContributions(db, 1);
    expect(rows.filter((r) => r.killingBlow)).toHaveLength(1);
    expect(rows.find((r) => r.killingBlow)!.player).toBe(BOB);
    // Applied damage sums to exactly the pool; the claim is kept separately.
    expect(rows.reduce((s, r) => s + r.damage, 0)).toBe(500);
    expect(rows.find((r) => r.killingBlow)!.damageClaimed).toBe(300);
  });

  it("takes no further attempts once felled", () => {
    openNextEdition(db, 100);
    recordAttempt(db, {
      edition: 1,
      attemptId: hash(1),
      player: ALICE,
      damage: 100,
      turns: 9,
      survived: true,
    });
    expect(() =>
      recordAttempt(db, {
        edition: 1,
        attemptId: hash(2),
        player: BOB,
        damage: 10,
        turns: 3,
        survived: true,
      }),
    ).toThrow(/was felled/);
  });

  it("records a zero-damage attempt without felling or crediting anything", () => {
    openNextEdition(db, 100);
    const res = recordAttempt(db, {
      edition: 1,
      attemptId: hash(3),
      player: ALICE,
      damage: 0,
      turns: 2,
      survived: false,
    });
    expect(res.applied).toBe(0);
    expect(res.felled).toBe(false);
    expect(res.duplicate).toBe(false);
    expect(getCurrentEdition(db)?.currentHp).toBe(100);
    // Still a row: dying for nothing is a contribution the record should keep.
    expect(listContributions(db, 1)).toHaveLength(1);
  });

  it("rejects negative damage rather than healing the pool", () => {
    openNextEdition(db, 100);
    expect(() =>
      recordAttempt(db, {
        edition: 1,
        attemptId: hash(4),
        player: ALICE,
        damage: -50,
        turns: 1,
        survived: true,
      }),
    ).toThrow(/non-negative/);
  });

  it("refuses an attempt against an edition that does not exist", () => {
    expect(() =>
      recordAttempt(db, {
        edition: 99,
        attemptId: hash(5),
        player: ALICE,
        damage: 10,
        turns: 1,
        survived: true,
      }),
    ).toThrow(/no such edition/);
  });
});

describe("advanceAttempt — incremental submission", () => {
  beforeEach(() => openNextEdition(db, 1000));

  const base = {
    edition: 1,
    attemptId: hash(42),
    player: ALICE,
    survived: false,
  };

  it("applies only the growth past what is already claimed", () => {
    expect(advanceAttempt(db, { ...base, cumulativeDamage: 100, turns: 5 }).applied).toBe(100);
    expect(advanceAttempt(db, { ...base, cumulativeDamage: 250, turns: 12 }).applied).toBe(150);
    expect(advanceAttempt(db, { ...base, cumulativeDamage: 300, turns: 18 }).applied).toBe(50);
    expect(getCurrentEdition(db)?.currentHp).toBe(700);

    // One row for the whole attempt, carrying the latest progress.
    const rows = listContributions(db, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ damage: 300, damageClaimed: 300, turns: 18 });
  });

  it("is idempotent: replaying the same cumulative total applies nothing", () => {
    advanceAttempt(db, { ...base, cumulativeDamage: 200, turns: 10 });
    const replay = advanceAttempt(db, { ...base, cumulativeDamage: 200, turns: 10 });
    expect(replay.applied).toBe(0);
    expect(replay.duplicate).toBe(true);
    expect(getCurrentEdition(db)?.currentHp).toBe(800);
  });

  it("ignores a stale packet reporting less than is recorded", () => {
    advanceAttempt(db, { ...base, cumulativeDamage: 400, turns: 20 });
    const stale = advanceAttempt(db, { ...base, cumulativeDamage: 150, turns: 8 });
    expect(stale.applied).toBe(0);
    expect(getCurrentEdition(db)?.currentHp).toBe(600);
    // Damage never walks backwards, even though `turns` takes the late value.
    expect(listContributions(db, 1)[0]).toMatchObject({
      damage: 400,
      damageClaimed: 400,
    });
  });

  it("clamps the final increment to the remainder and fells once", () => {
    advanceAttempt(db, { ...base, cumulativeDamage: 900, turns: 28 });
    const kill = advanceAttempt(db, { ...base, cumulativeDamage: 5000, turns: 30 });
    expect(kill.applied).toBe(100);
    expect(kill.felled).toBe(true);
    expect(kill.edition.currentHp).toBe(0);

    const row = listContributions(db, 1)[0]!;
    expect(row.damage).toBe(1000);
    expect(row.killingBlow).toBe(true);
    // The inflated claim is preserved rather than clipped to what landed.
    expect(row.damageClaimed).toBe(5000);
  });

  it("keeps the contributor sum equal to the pool across many partials", () => {
    for (let i = 1; i <= 4; i++) {
      advanceAttempt(db, {
        edition: 1,
        attemptId: hash(100 + i),
        player: i % 2 === 0 ? BOB : ALICE,
        cumulativeDamage: 50,
        turns: 3,
        survived: true,
      });
      advanceAttempt(db, {
        edition: 1,
        attemptId: hash(100 + i),
        player: i % 2 === 0 ? BOB : ALICE,
        cumulativeDamage: 125,
        turns: 9,
        survived: false,
      });
    }
    const recorded = listContributions(db, 1).reduce((s, r) => s + r.damage, 0);
    expect(recorded).toBe(1000 - getCurrentEdition(db)!.currentHp);
    expect(recorded).toBe(500);
  });

  it("flips the phase mid-attempt, not only between attempts", () => {
    expect(advanceAttempt(db, { ...base, cumulativeDamage: 400, turns: 20 }).edition.phase).toBe(1);
    expect(advanceAttempt(db, { ...base, cumulativeDamage: 520, turns: 26 }).edition.phase).toBe(2);
  });

  it("refuses a hash that belongs to another edition", () => {
    advanceAttempt(db, { ...base, cumulativeDamage: 1000, turns: 30 });
    openNextEdition(db, 500);
    expect(() =>
      advanceAttempt(db, { ...base, edition: 2, cumulativeDamage: 1100, turns: 31 }),
    ).toThrow(/already belongs to edition 1/);
  });

  it("rejects a negative cumulative total", () => {
    expect(() =>
      advanceAttempt(db, { ...base, cumulativeDamage: -1, turns: 1 }),
    ).toThrow(/non-negative/);
  });
});

describe("recordAttempt vs advanceAttempt — different promises", () => {
  beforeEach(() => openNextEdition(db, 1000));

  it("recordAttempt ignores a larger resubmission; advanceAttempt credits it", () => {
    recordAttempt(db, {
      edition: 1,
      attemptId: hash(1),
      player: ALICE,
      damage: 100,
      turns: 10,
      survived: true,
    });
    recordAttempt(db, {
      edition: 1,
      attemptId: hash(1),
      player: ALICE,
      damage: 900,
      turns: 30,
      survived: true,
    });
    expect(getCurrentEdition(db)?.currentHp).toBe(900);

    advanceAttempt(db, {
      edition: 1,
      attemptId: hash(2),
      player: ALICE,
      cumulativeDamage: 100,
      turns: 10,
      survived: true,
    });
    advanceAttempt(db, {
      edition: 1,
      attemptId: hash(2),
      player: ALICE,
      cumulativeDamage: 900,
      turns: 30,
      survived: true,
    });
    expect(getCurrentEdition(db)?.currentHp).toBe(0);
  });
});

describe("phase transition", () => {
  // The engine fires at `monsterHp <= floor(baseHp / 2)`; these must agree or
  // the HP bar and the fight disagree about which half the raid is in.
  it("matches the engine's threshold at the boundary and either side", () => {
    expect(phaseFor(1001, 501)).toBe(1);
    expect(phaseFor(1001, 500)).toBe(2);
    expect(phaseFor(1000, 501)).toBe(1);
    expect(phaseFor(1000, 500)).toBe(2);
    expect(phaseFor(1000, 499)).toBe(2);
  });

  it("fires on the edition pool, not per attempt", () => {
    openNextEdition(db, 1000);
    // Three attempts, none of which could flip a per-attempt bar.
    for (let i = 1; i <= 3; i++) {
      const res = recordAttempt(db, {
        edition: 1,
        attemptId: hash(i),
        player: ALICE,
        damage: 200,
        turns: 30,
        survived: false,
      });
      expect(res.edition.phase).toBe(i < 3 ? 1 : 2);
    }
    expect(getCurrentEdition(db)?.currentHp).toBe(400);
  });

  it("flips exactly as the pool crosses half", () => {
    openNextEdition(db, 1000);
    const a = recordAttempt(db, {
      edition: 1,
      attemptId: hash(1),
      player: ALICE,
      damage: 499,
      turns: 30,
      survived: false,
    });
    expect(a.edition.currentHp).toBe(501);
    expect(a.edition.phase).toBe(1);

    const b = recordAttempt(db, {
      edition: 1,
      attemptId: hash(2),
      player: ALICE,
      damage: 1,
      turns: 1,
      survived: false,
    });
    expect(b.edition.currentHp).toBe(500);
    expect(b.edition.phase).toBe(2);
  });
});

describe("contributors", () => {
  beforeEach(() => {
    openNextEdition(db, 10_000);
    const attempts: [number, `0x${string}`, number][] = [
      [1, ALICE, 300],
      [2, BOB, 500],
      [3, ALICE, 400],
      [4, BOB, 100],
    ];
    for (const [n, player, damage] of attempts) {
      recordAttempt(db, {
        edition: 1,
        attemptId: hash(n),
        player,
        damage,
        turns: 30,
        survived: false,
      });
    }
  });

  it("totals per player, heaviest first", () => {
    const rows = listContributors(db, 1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ player: ALICE, damage: 700, attempts: 2 });
    expect(rows[1]).toMatchObject({ player: BOB, damage: 600, attempts: 2 });
  });

  it("counts a single player's attempts", () => {
    expect(countPlayerAttempts(db, 1, ALICE)).toBe(2);
    expect(countPlayerAttempts(db, 1, BOB)).toBe(2);
    expect(countPlayerAttempts(db, 2, ALICE)).toBe(0);
  });

  it("normalises player case, so one wallet is one contributor", () => {
    recordAttempt(db, {
      edition: 1,
      attemptId: hash(5),
      player: ("0x" + ALICE.slice(2).toUpperCase()) as `0x${string}`,
      damage: 100,
      turns: 30,
      survived: false,
    });
    const rows = listContributors(db, 1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ player: ALICE, damage: 800, attempts: 3 });
  });

  it("keeps editions separate", () => {
    correctCurrentHp(db, 1, 0);
    openNextEdition(db, 500);
    recordAttempt(db, {
      edition: 2,
      attemptId: hash(6),
      player: BOB,
      damage: 50,
      turns: 5,
      survived: true,
    });
    expect(listContributors(db, 1)).toHaveLength(2);
    expect(listContributors(db, 2)).toEqual([
      { player: BOB, damage: 50, attempts: 1, killingBlow: false },
    ]);
  });
});

describe("correctCurrentHp", () => {
  beforeEach(() => openNextEdition(db, 1000));

  it("sets the pool and re-derives the phase", () => {
    const e = correctCurrentHp(db, 1, 400);
    expect(e.currentHp).toBe(400);
    expect(e.phase).toBe(2);
  });

  it("leaves contribution rows alone, so the mismatch is visible", () => {
    recordAttempt(db, {
      edition: 1,
      attemptId: hash(1),
      player: ALICE,
      damage: 200,
      turns: 30,
      survived: false,
    });
    correctCurrentHp(db, 1, 900);
    const recorded = listContributions(db, 1).reduce((s, r) => s + r.damage, 0);
    const takenOffPool = 1000 - getCurrentEdition(db)!.currentHp;
    expect(recorded).toBe(200);
    expect(takenOffPool).toBe(100);
  });

  it("fells an edition set to 0, and un-fells one raised back above it", () => {
    const dead = correctCurrentHp(db, 1, 0);
    expect(dead.felledAt).not.toBeNull();
    const revived = correctCurrentHp(db, 1, 50);
    expect(revived.felledAt).toBeNull();
  });

  it("refuses a value above the edition total or below zero", () => {
    expect(() => correctCurrentHp(db, 1, 1001)).toThrow(/exceeds/);
    expect(() => correctCurrentHp(db, 1, -1)).toThrow(/non-negative/);
  });
});

describe("earned attempts", () => {
  const REALM = "0x0000000000000000000000000000000000000001" as `0x${string}`;

  it("grants one attempt per clear, idempotently on the token id", () => {
    expect(grantAttempt(db, { grantKey: "tok-1", player: ALICE, realm: REALM })).toBe(true);
    // A replayed clear re-presents the same token id and must grant nothing.
    expect(grantAttempt(db, { grantKey: "tok-1", player: ALICE, realm: REALM })).toBe(false);
    expect(attemptBalance(db, ALICE)).toBe(1);
  });

  it("keeps balances per player", () => {
    grantAttempt(db, { grantKey: "a", player: ALICE, realm: REALM });
    grantAttempt(db, { grantKey: "b", player: ALICE, realm: REALM });
    grantAttempt(db, { grantKey: "c", player: BOB, realm: REALM });
    expect(attemptBalance(db, ALICE)).toBe(2);
    expect(attemptBalance(db, BOB)).toBe(1);
  });

  it("normalises player case, so one wallet is one balance", () => {
    grantAttempt(db, { grantKey: "a", player: ALICE, realm: REALM });
    const upper = ("0x" + ALICE.slice(2).toUpperCase()) as `0x${string}`;
    grantAttempt(db, { grantKey: "b", player: upper, realm: REALM });
    expect(attemptBalance(db, upper)).toBe(2);
  });

  describe("openAttempt", () => {
    beforeEach(() => {
      openNextEdition(db, 10_000);
      grantAttempt(db, { grantKey: "tok-1", player: ALICE, realm: REALM });
    });

    it("spends a grant and issues an unpredictable id and seed", () => {
      const a = openAttempt(db, { edition: 1, player: ALICE, turnLimit: 30 });
      expect(a.attemptId).toMatch(/^0x[0-9a-f]{64}$/);
      expect(a.rngSeed).toMatch(/^0x[0-9a-f]{64}$/);
      // Two independent randoms — the public id must not reveal the seed.
      expect(a.rngSeed).not.toBe(a.attemptId);
      expect(a.turnLimit).toBe(30);
      expect(attemptBalance(db, ALICE)).toBe(0);
    });

    it("hands the fight the pool and the edition total separately", () => {
      const a = openAttempt(db, { edition: 1, player: ALICE, turnLimit: 30 });
      expect(a.editionHp).toBe(10_000);
      expect(a.startHp).toBe(10_000);

      grantAttempt(db, { grantKey: "tok-2", player: ALICE, realm: REALM });
      advanceAttempt(db, {
        edition: 1,
        attemptId: a.attemptId,
        player: ALICE,
        cumulativeDamage: 2_500,
        turns: 30,
        survived: false,
      });
      const b = openAttempt(db, { edition: 1, player: ALICE, turnLimit: 30 });
      expect(b.startHp).toBe(7_500);
      expect(b.editionHp).toBe(10_000);
    });

    it("refuses when the player has nothing to spend", () => {
      openAttempt(db, { edition: 1, player: ALICE, turnLimit: 30 });
      expect(() =>
        openAttempt(db, { edition: 1, player: ALICE, turnLimit: 30 }),
      ).toThrow(/no unspent attempts/);
      expect(() =>
        openAttempt(db, { edition: 1, player: BOB, turnLimit: 30 }),
      ).toThrow(/no unspent attempts/);
    });

    it("records which attempt consumed which grant", () => {
      const a = openAttempt(db, { edition: 1, player: ALICE, turnLimit: 30 });
      const grants = listGrants(db, ALICE);
      expect(grants).toHaveLength(1);
      expect(grants[0]!.spentOn).toBe(a.attemptId);
    });

    it("spends the oldest grant first", () => {
      // `tok-1` came from the beforeEach at the current time, so the newcomer
      // needs a later stamp to be unambiguously second in line.
      grantAttempt(db, { grantKey: "tok-later", player: ALICE, realm: REALM }, 9_000_000_000);
      const a = openAttempt(db, { edition: 1, player: ALICE, turnLimit: 30 });
      const spent = listGrants(db, ALICE).find((g) => g.spentOn === a.attemptId);
      expect(spent?.grantKey).toBe("tok-1");
    });

    it("spends same-second grants in insertion order rather than arbitrarily", () => {
      // Whole-second timestamps make ties routine, not exotic.
      grantAttempt(db, { grantKey: "same-a", player: BOB, realm: REALM }, 5_000);
      grantAttempt(db, { grantKey: "same-b", player: BOB, realm: REALM }, 5_000);
      const first = openAttempt(db, { edition: 1, player: BOB, turnLimit: 30 });
      const second = openAttempt(db, { edition: 1, player: BOB, turnLimit: 30 });
      const grants = listGrants(db, BOB);
      expect(grants.find((g) => g.grantKey === "same-a")!.spentOn).toBe(first.attemptId);
      expect(grants.find((g) => g.grantKey === "same-b")!.spentOn).toBe(second.attemptId);
    });

    it("creates the attempt as a zero-damage contribution carrying its rules", () => {
      const a = openAttempt(db, { edition: 1, player: ALICE, turnLimit: 17 });
      const row = getContribution(db, a.attemptId)!;
      expect(row).toMatchObject({
        damage: 0,
        damageClaimed: 0,
        turns: 0,
        turnLimit: 17,
        rngSeed: a.rngSeed,
        killingBlow: false,
      });
      // The pool has not moved just because an attempt opened.
      expect(getCurrentEdition(db)?.currentHp).toBe(10_000);
    });

    it("lets the issued attempt then report damage", () => {
      const a = openAttempt(db, { edition: 1, player: ALICE, turnLimit: 30 });
      const res = advanceAttempt(db, {
        edition: 1,
        attemptId: a.attemptId,
        player: ALICE,
        cumulativeDamage: 400,
        turns: 12,
        survived: false,
      });
      expect(res.applied).toBe(400);
      expect(getCurrentEdition(db)?.currentHp).toBe(9_600);
      // Still one row — the attempt was already there.
      expect(listContributions(db, 1)).toHaveLength(1);
    });

    it("does not burn a grant when the edition is felled", () => {
      correctCurrentHp(db, 1, 0);
      expect(() =>
        openAttempt(db, { edition: 1, player: ALICE, turnLimit: 30 }),
      ).toThrow(/was felled/);
      // The transaction rolled back, so the grant survives for the next edition.
      expect(attemptBalance(db, ALICE)).toBe(1);
    });

    it("rejects a non-positive turn limit", () => {
      expect(() =>
        openAttempt(db, { edition: 1, player: ALICE, turnLimit: 0 }),
      ).toThrow(/positive integer/);
    });
  });
});

describe("the unlock counter", () => {
  // The plan is explicit that this is the part that has to be right in
  // production, because the gate itself can be forced open with an env var
  // but a miscounted tally is silent.
  it("starts zeroed rather than absent, so callers never branch on no-row", () => {
    expect(getRaidUnlock(db)).toEqual({
      t5Clears: 0,
      firstT5At: null,
      updatedAt: null,
    });
  });

  it("counts each clear exactly once", () => {
    for (let i = 1; i <= 5; i++) {
      expect(bumpT5Clears(db).t5Clears).toBe(i);
    }
    expect(getRaidUnlock(db).t5Clears).toBe(5);
  });

  it("stamps the first clear's time and then leaves it alone", () => {
    const first = bumpT5Clears(db, 1_000);
    expect(first.firstT5At).toBe(1_000);
    const later = bumpT5Clears(db, 9_999);
    expect(later.firstT5At).toBe(1_000);
    expect(later.updatedAt).toBe(9_999);
  });

  it("stays a single row no matter how many clears land", () => {
    for (let i = 0; i < 10; i++) bumpT5Clears(db);
    const rows = db
      .prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM raid_unlock")
      .get();
    expect(rows?.n).toBe(1);
  });

  it("survives the migration running again", () => {
    bumpT5Clears(db);
    migrateRaidTables(db);
    expect(getRaidUnlock(db).t5Clears).toBe(1);
  });

  it("is independent of editions — the gate predates the first one", () => {
    bumpT5Clears(db);
    expect(getCurrentEdition(db)).toBeUndefined();
    expect(getRaidUnlock(db).t5Clears).toBe(1);
  });
});

describe("getCurrentEdition", () => {
  it("is undefined before the first edition", () => {
    expect(getCurrentEdition(db)).toBeUndefined();
  });
});
