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
  correctCurrentHp,
  countPlayerAttempts,
  getContribution,
  getCurrentEdition,
  listContributions,
  listContributors,
  migrateRaidTables,
  openNextEdition,
  phaseFor,
  recordAttempt,
} from "./raid-store";

const ALICE = "0x00000000000000000000000000000000000000a1" as `0x${string}`;
const BOB = "0x00000000000000000000000000000000000000b2" as `0x${string}`;

/** Distinct, deterministic entry tx hashes. */
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
      entryTxHash: hash(1),
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

  it("subtracts once when the same entry tx hash is submitted twice", () => {
    const input = {
      edition: 1,
      entryTxHash: hash(7),
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
      entryTxHash: hash(8),
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

  it("is case-insensitive on the hash, since a retry may re-checksum it", () => {
    recordAttempt(db, {
      edition: 1,
      entryTxHash: hash(9),
      player: ALICE,
      damage: 50,
      turns: 5,
      survived: true,
    });
    const upper = ("0x" + hash(9).slice(2).toUpperCase()) as `0x${string}`;
    const again = recordAttempt(db, {
      edition: 1,
      entryTxHash: upper,
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
      entryTxHash: hash(1),
      player: ALICE,
      damage: 400,
      turns: 30,
      survived: false,
    });
    // Overkill: 300 claimed into a pool with 100 left.
    const kill = recordAttempt(db, {
      edition: 1,
      entryTxHash: hash(2),
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
      entryTxHash: hash(1),
      player: ALICE,
      damage: 100,
      turns: 9,
      survived: true,
    });
    expect(() =>
      recordAttempt(db, {
        edition: 1,
        entryTxHash: hash(2),
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
      entryTxHash: hash(3),
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
        entryTxHash: hash(4),
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
        entryTxHash: hash(5),
        player: ALICE,
        damage: 10,
        turns: 1,
        survived: true,
      }),
    ).toThrow(/no such edition/);
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
        entryTxHash: hash(i),
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
      entryTxHash: hash(1),
      player: ALICE,
      damage: 499,
      turns: 30,
      survived: false,
    });
    expect(a.edition.currentHp).toBe(501);
    expect(a.edition.phase).toBe(1);

    const b = recordAttempt(db, {
      edition: 1,
      entryTxHash: hash(2),
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
        entryTxHash: hash(n),
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
      entryTxHash: hash(5),
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
      entryTxHash: hash(6),
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
      entryTxHash: hash(1),
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

describe("getCurrentEdition", () => {
  it("is undefined before the first edition", () => {
    expect(getCurrentEdition(db)).toBeUndefined();
  });
});
