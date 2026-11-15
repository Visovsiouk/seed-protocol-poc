/**
 * Tests for the S1 raid damage harness.
 *
 * Two jobs, and the second is the reason S1 says "keep the harness in the
 * repo as a test or a script, not a throwaway":
 *
 *   1. The harness measures what it claims to — determinism, checkpoint
 *      monotonicity, outcome accounting, the quantile helper, and the fact
 *      that `grindSeeds` really derives seeds the way production does
 *      (`deriveRunSeed` over a swept nonce) rather than fabricating hex,
 *      which is what makes the sample representative at all.
 *
 *   2. **Drift detection.** The committed `EXPECTED` block below pins the
 *      measured distribution at a small, fast sample size. Any change to
 *      `combat.ts`, `catalog.ts`, `tier.ts`, `boss.ts` or `rng.ts` moves
 *      these numbers and fails here — which is the signal to re-run
 *      `scripts/colophon-damage.ts` and re-read the turn limit and HP
 *      total off the new distribution. The assertion is a *bare equality*,
 *      not a tolerance band: a tolerance would quietly absorb exactly the
 *      balance changes this is here to catch. Update the block deliberately
 *      when you change combat, and say so in the commit.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe as suite, expect, it } from "vitest";
import {
  bestOf,
  COLOPHON_PROFILES,
  describe,
  grindSeeds,
  HARD_TURN_CAP,
  INERT_BOSS_EFFECTS,
  LIVE_BOSS_EFFECTS,
  measureCell,
  quantile,
  simulateAttempt,
  sizeEdition,
  STRATEGIES,
  T5_LOADOUTS,
  tailGrowth,
  TURN_CHECKPOINTS,
  type Cell,
} from "./raid-damage";
import { deriveRunSeed } from "../../lib/engine/run-seed";

const PLAYER = "0x00000000000000000000000000000000000000a1" as `0x${string}`;
const BLOCKHASH =
  "0x00000000000000000000000000000000000000000000000000000000000000b1" as `0x${string}`;
const EDITION_HP = 1_000_000;

/** Small enough to keep `pnpm test` quick, large enough to be stable. */
const N = 300;

function cellFor(
  profile: keyof typeof COLOPHON_PROFILES,
  loadout: keyof typeof T5_LOADOUTS,
  strategy: (typeof STRATEGIES)[number],
  n = N,
): Cell {
  return measureCell({
    profile: COLOPHON_PROFILES[profile],
    loadout: T5_LOADOUTS[loadout],
    strategy,
    seeds: grindSeeds({ player: PLAYER, blockhash: BLOCKHASH, count: n }),
    editionHp: EDITION_HP,
    startHp: EDITION_HP,
  });
}

suite("grindSeeds", () => {
  it("is the production derivation over a swept nonce, not fabricated hex", () => {
    const seeds = grindSeeds({
      player: PLAYER,
      blockhash: BLOCKHASH,
      nonceStart: 7n,
      count: 3,
    });
    expect(seeds).toEqual([
      deriveRunSeed({ player: PLAYER, blockhash: BLOCKHASH, nonce: 7n }),
      deriveRunSeed({ player: PLAYER, blockhash: BLOCKHASH, nonce: 8n }),
      deriveRunSeed({ player: PLAYER, blockhash: BLOCKHASH, nonce: 9n }),
    ]);
  });

  it("produces distinct seeds — a collapsed sweep would fake a narrow spread", () => {
    const seeds = grindSeeds({
      player: PLAYER,
      blockhash: BLOCKHASH,
      count: 2000,
    });
    expect(new Set(seeds).size).toBe(2000);
  });
});

suite("simulateAttempt", () => {
  const args = {
    rngSeed: deriveRunSeed({ player: PLAYER, blockhash: BLOCKHASH, nonce: 1n }),
    boss: COLOPHON_PROFILES.lethal.boss,
    loadout: T5_LOADOUTS.offense,
    strategy: "attack" as const,
    editionHp: EDITION_HP,
    startHp: EDITION_HP,
  };

  it("is deterministic in the seed", () => {
    expect(simulateAttempt(args)).toEqual(simulateAttempt(args));
  });

  it("gives a different result for a different seed", () => {
    const other = simulateAttempt({
      ...args,
      rngSeed: deriveRunSeed({
        player: PLAYER,
        blockhash: BLOCKHASH,
        nonce: 2n,
      }),
    });
    expect(other.damage).not.toBe(simulateAttempt(args).damage);
  });

  it("reports cumulative damage that never decreases across checkpoints", () => {
    // Monotonicity is the property the whole turn-limit table rests on: a
    // longer limit can never bank less. Boss regen pushing the pool back up
    // is the thing that could break it, hence the clamp in the simulator.
    for (let nonce = 0n; nonce < 50n; nonce++) {
      const a = simulateAttempt({
        ...args,
        rngSeed: deriveRunSeed({
          player: PLAYER,
          blockhash: BLOCKHASH,
          nonce,
        }),
      });
      for (let i = 1; i < a.damageAt.length; i++) {
        expect(a.damageAt[i]!).toBeGreaterThanOrEqual(a.damageAt[i - 1]!);
      }
      expect(a.damage).toBe(a.damageAt[a.damageAt.length - 1]);
    }
  });

  it("holds final damage at every checkpoint past the attempt's end", () => {
    const a = simulateAttempt(args);
    expect(a.outcome).toBe("died");
    const pastEnd = TURN_CHECKPOINTS.map((cp, i) => [cp, a.damageAt[i]!] as const)
      .filter(([cp]) => cp >= a.turns)
      .map(([, dmg]) => dmg);
    expect(pastEnd.length).toBeGreaterThan(1);
    for (const d of pastEnd) expect(d).toBe(a.damage);
  });

  it("never exceeds the hard cap, and says so when the cap is what stopped it", () => {
    // The stalemate case: the player's damage_reduction 4 eats a d6 boss
    // swing whole, and the pool is bottomless, so neither side can end the
    // fight. Without a turn limit this is a real shape the raid can reach —
    // the loop guard is what stops it being an infinite loop here, and the
    // `capped` outcome is what stops it being mistaken for a death.
    const a = simulateAttempt({
      ...args,
      boss: COLOPHON_PROFILES.roster.boss,
      loadout: T5_LOADOUTS.tank,
    });
    expect(a.turns).toBe(HARD_TURN_CAP);
    expect(a.outcome).toBe("capped");
  });

  it("opens in phase 2 when the pool starts at or below half the edition", () => {
    // Phase 2 grants the player a permanent +2 to-hit, so an attempt opened
    // at the threshold must out-damage the same seed opened at full pool.
    const seeds = grindSeeds({
      player: PLAYER,
      blockhash: BLOCKHASH,
      count: 120,
    });
    let phase2Better = 0;
    for (const rngSeed of seeds) {
      const p1 = simulateAttempt({ ...args, rngSeed, startHp: EDITION_HP });
      const p2 = simulateAttempt({
        ...args,
        rngSeed,
        startHp: Math.floor(EDITION_HP / 2),
      });
      if (p2.damageAt[1]! > p1.damageAt[1]!) phase2Better++;
    }
    expect(phase2Better).toBeGreaterThan(seeds.length / 2);
  });
});

suite("quantile", () => {
  it("is nearest-rank, so every reported figure is a real observation", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(quantile(xs, 0.5)).toBe(5);
    expect(quantile(xs, 0.9)).toBe(9);
    expect(quantile(xs, 1)).toBe(10);
    // Below 1/n still lands on a real element rather than extrapolating.
    expect(quantile(xs, 0.0001)).toBe(1);
  });

  it("handles an empty sample without throwing", () => {
    expect(quantile([], 0.99)).toBe(0);
    expect(describe([])).toMatchObject({ n: 0, median: 0, max: 0 });
  });
});

suite("measureCell", () => {
  it("accounts for every seed exactly once", () => {
    const cell = cellFor("lethal", "offense", "attack");
    const total =
      cell.outcomes.died + cell.outcomes.capped + cell.outcomes.felled;
    expect(total).toBe(N);
    expect(cell.perSeedDamage).toHaveLength(N);
    expect(cell.byCheckpoint).toHaveLength(TURN_CHECKPOINTS.length);
  });

  it("never records a felled pool — the harness measures against a bottomless one", () => {
    // If this ever fires, `EDITION_HP` is too small and every distribution
    // is truncated by the boss dying rather than by the player or the limit.
    for (const profile of ["roster", "lethal", "stonewall", "hard"] as const) {
      for (const loadout of ["bare", "offense", "tank"] as const) {
        const cell = cellFor(profile, loadout, "attack", 60);
        expect(cell.outcomes.felled).toBe(0);
      }
    }
  });

  it("reports rounds survived, which is what the turn limit is chosen from", () => {
    // The turn limit wants to sit at or above median survival, so this
    // figure is load-bearing: if it stopped tracking actual attempt length
    // the limit would be picked off a fiction. Tie it back to the damage
    // checkpoints — a cell whose attempts outlive a checkpoint must still
    // be gaining damage at it, and one that does not must have flatlined.
    const cell = cellFor("lethal", "offense", "attack");
    const i20 = TURN_CHECKPOINTS.indexOf(20);
    const i50 = TURN_CHECKPOINTS.indexOf(50);
    expect(cell.turnsSurvived.median).toBeGreaterThan(20);
    expect(cell.turnsSurvived.max).toBeLessThan(HARD_TURN_CAP);
    // Still fighting at 20 rounds → damage still climbing past it.
    expect(cell.byCheckpoint[i50]!.median).toBeGreaterThan(
      cell.byCheckpoint[i20]!.median,
    );
    // Everyone is dead by 50 → nothing more is banked after it.
    expect(cell.byCheckpoint[i50]!.median).toBe(cell.unbounded.median);
  });

  it("resolves the Secondary action from the loadout's armor", () => {
    expect(cellFor("lethal", "bare", "attack", 10).secondary).toBe("Focus");
    expect(cellFor("lethal", "offense", "attack", 10).secondary).toBe("Focus");
    expect(cellFor("lethal", "tank", "attack", 10).secondary).toBe("Dodge");
  });
});

suite("bestOf", () => {
  it("takes the per-seed max, so optimal play never reads below either strategy", () => {
    const cells = STRATEGIES.map((s) => cellFor("lethal", "offense", s));
    const best = bestOf(cells);
    for (const cell of cells) {
      expect(best.unbounded.median).toBeGreaterThanOrEqual(
        cell.unbounded.median,
      );
      expect(best.unbounded.max).toBeGreaterThanOrEqual(cell.unbounded.max);
    }
  });

  it("is empty for no cells rather than throwing", () => {
    expect(bestOf([]).unbounded.n).toBe(0);
  });
});

suite("sizeEdition", () => {
  const seeds = grindSeeds({
    player: PLAYER,
    blockhash: BLOCKHASH,
    count: N,
  });

  function size(attempts: number, turnLimit = 30) {
    return sizeEdition({
      profile: COLOPHON_PROFILES.stonewall,
      loadout: T5_LOADOUTS.offense,
      strategy: "attack",
      seeds,
      turnLimit,
      attempts,
      poolHp: EDITION_HP,
    });
  }

  it("round-trips: the HP it returns is consumed in the attempts asked for", () => {
    const s = size(30);
    expect(s.phase1Attempts + s.phase2Attempts).toBeCloseTo(30, 1);
    // Both halves do real work — otherwise the blend is pointless.
    expect(s.phase1Attempts).toBeGreaterThan(0);
    expect(s.phase2Attempts).toBeGreaterThan(0);
  });

  it("scales linearly in the attempt count", () => {
    expect(size(60).totalHp).toBeCloseTo(size(30).totalHp * 2, -1);
  });

  it("lands between the two flat phase estimates, never outside", () => {
    const s = size(30);
    const lo = Math.min(s.phase1Median, s.phase2Median) * 30;
    const hi = Math.max(s.phase1Median, s.phase2Median) * 30;
    expect(s.totalHp).toBeGreaterThanOrEqual(lo);
    expect(s.totalHp).toBeLessThanOrEqual(hi);
  });

  it("sizes a longer turn limit higher, since each attempt banks more", () => {
    expect(size(30, 50).totalHp).toBeGreaterThan(size(30, 10).totalHp);
  });

  it("reports the bar movement as one phase-1 attempt over the whole pool", () => {
    const s = size(30);
    expect(s.pctPerAttempt).toBeCloseTo((s.phase1Median / s.totalHp) * 100, 6);
  });

  it("refuses to size a fight the median attempt cannot win", () => {
    // `alternate` opens on the Secondary, so a one-round limit means the
    // player never swings and every attempt deals exactly 0. No HP total
    // makes that edition fall, so this must not return a number.
    expect(() =>
      sizeEdition({
        profile: COLOPHON_PROFILES.stonewall,
        loadout: T5_LOADOUTS.tank,
        strategy: "alternate",
        seeds,
        turnLimit: 1,
        attempts: 30,
        poolHp: EDITION_HP,
      }),
    ).toThrow(/cannot size/);
  });
});

suite("tailGrowth", () => {
  it("reports a non-decreasing max and skips sizes beyond the sample", () => {
    const cell = cellFor("lethal", "offense", "attack");
    const rows = tailGrowth(cell.perSeedDamage, [10, 100, N, N * 10]);
    expect(rows.map((r) => r.size)).toEqual([10, 100, N]);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.max).toBeGreaterThanOrEqual(rows[i - 1]!.max);
    }
  });
});

suite("profile set", () => {
  it("varies only over levers the engine actually reads", () => {
    // Guards against the trap this harness fell into first time around:
    // two profiles differing solely in dead baked effects measured
    // byte-identically, which looks like a harness bug and is not one.
    const profiles = Object.values(COLOPHON_PROFILES);
    const signatures = profiles.map((p) =>
      JSON.stringify([
        p.boss.ac,
        p.boss.attackDie,
        p.boss.phase2AttackDie,
        p.boss.bakedEffects.filter((e) =>
          (LIVE_BOSS_EFFECTS as readonly string[]).includes(e),
        ),
      ]),
    );
    expect(new Set(signatures).size).toBe(profiles.length);
  });

  it("measures distinct damage distributions", () => {
    const medians = (
      ["roster", "lethal", "stonewall", "hard"] as const
    ).map((p) => cellFor(p, "offense", "attack", 150).unbounded.median);
    expect(new Set(medians).size).toBe(medians.length);
  });

  it("declares bleed inert, matching the engine's monster-side call sites", () => {
    // If a `bleed` reader ever lands on the monster side this goes stale
    // silently, and `stonewall`/`roster` stop meaning what their rationales
    // say. Assert against the engine rather than against a second list.
    const combat = readFileSync(
      resolve(__dirname, "../../lib/engine/combat.ts"),
      "utf-8",
    );
    const read = new Set(
      [...combat.matchAll(/getMonsterEffectValue\(\s*s\w*\s*,\s*"(\w+)"/g)].map(
        (m) => m[1]!,
      ),
    );
    for (const name of LIVE_BOSS_EFFECTS) expect(read).toContain(name);
    for (const name of INERT_BOSS_EFFECTS) expect(read).not.toContain(name);
  });
});

suite("measured distribution (drift detector)", () => {
  /**
   * Pinned at N = 300 ground nonces, `attack` strategy, phase 1.
   * Regenerate with `pnpm exec tsx scripts/colophon-damage.ts` and update
   * deliberately — see this file's docblock.
   */
  const EXPECTED: Record<string, { median: number; max: number }> = {
    "roster/bare": { median: 427, max: 883 },
    "roster/offense": { median: 1506, max: 2754 },
    "lethal/bare": { median: 180, max: 312 },
    "lethal/offense": { median: 616, max: 1134 },
    "stonewall/bare": { median: 193, max: 306 },
    "stonewall/offense": { median: 346, max: 477 },
    "hard/bare": { median: 153, max: 299 },
    "hard/offense": { median: 494, max: 1185 },
  };

  for (const key of Object.keys(EXPECTED)) {
    const [profile, loadout] = key.split("/") as [
      keyof typeof COLOPHON_PROFILES,
      keyof typeof T5_LOADOUTS,
    ];
    it(`${key} damage distribution is unchanged`, () => {
      const cell = cellFor(profile, loadout, "attack");
      expect({
        median: cell.unbounded.median,
        max: cell.unbounded.max,
      }).toEqual(EXPECTED[key]);
    });
  }
});
