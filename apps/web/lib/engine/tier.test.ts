import { describe, expect, it } from "vitest";
import { createRng } from "./rng";
import { _tierTablesForTests, rollEffectCount, rollTier, tierStats } from "./tier";
import type { Tier } from "./types";

const SEED =
  "0x1111111111111111111111111111111111111111111111111111111111111111";

describe("tierStats", () => {
  it("returns the weapon table verbatim", () => {
    expect(tierStats(1, "weapon")).toEqual({ damageDie: 4, attackBonus: 0, damageBonus: 0 });
    expect(tierStats(2, "weapon")).toEqual({ damageDie: 6, attackBonus: 1, damageBonus: 1 });
    expect(tierStats(3, "weapon")).toEqual({ damageDie: 8, attackBonus: 2, damageBonus: 2 });
    expect(tierStats(4, "weapon")).toEqual({ damageDie: 10, attackBonus: 3, damageBonus: 3 });
    expect(tierStats(5, "weapon")).toEqual({ damageDie: 12, attackBonus: 4, damageBonus: 4 });
  });

  it("damageBonus and attackBonus scale together across tiers", () => {
    for (let t = 1 as Tier; t <= 5; t = (t + 1) as Tier) {
      const stats = tierStats(t, "weapon");
      expect(stats.attackBonus).toBe(t - 1);
      expect(stats.damageBonus).toBe(t - 1);
    }
  });

  it("returns the armor table verbatim", () => {
    expect(tierStats(1, "armor")).toEqual({ acBonus: 1, hpBonus: 5 });
    expect(tierStats(2, "armor")).toEqual({ acBonus: 2, hpBonus: 10 });
    expect(tierStats(3, "armor")).toEqual({ acBonus: 3, hpBonus: 20 });
    expect(tierStats(4, "armor")).toEqual({ acBonus: 4, hpBonus: 35 });
    expect(tierStats(5, "armor")).toEqual({ acBonus: 5, hpBonus: 50 });
  });

  it("returns an empty bag for the accessory slot (not implemented yet)", () => {
    expect(tierStats(3, "accessory")).toEqual({});
  });

  it("returns a fresh object each call (caller cannot mutate the table)", () => {
    const a = tierStats(3, "weapon");
    const b = tierStats(3, "weapon");
    expect(a).not.toBe(b);
    a.attackBonus = 999;
    expect(tierStats(3, "weapon").attackBonus).toBe(2);
  });
});

describe("rollTier", () => {
  it("trivial → only T1 or T2", () => {
    // HP-carry rebalance: T1 was re-introduced to `trivial` so depth-1
    // drops feel like real loot churn (most drops are sidegrades from
    // the d6/+1 starter). See tier.ts for the rationale.
    const rng = createRng(SEED);
    for (let i = 0; i < 500; i++) {
      const t = rollTier(rng, "trivial");
      expect([1, 2]).toContain(t);
    }
  });

  it("standard → only T2/T3/T4", () => {
    // Rebalance: T1 was removed from `standard` to stop post-depth-1
    // rooms dropping stat-identical-to-starter mints. See tier.ts.
    const rng = createRng(SEED);
    for (let i = 0; i < 500; i++) {
      const t = rollTier(rng, "standard");
      expect([2, 3, 4]).toContain(t);
    }
  });

  it("deep → only T2/T3/T4/T5, never T1", () => {
    // Delve: the pre-boss "deep" band is richer than
    // standard — it opens T5 and never drops T1 junk.
    const rng = createRng(SEED);
    const seen = new Set<Tier>();
    for (let i = 0; i < 5000; i++) {
      const t = rollTier(rng, "deep");
      expect(t).not.toBe(1);
      seen.add(t);
    }
    expect(seen.has(5)).toBe(true);
  });

  it("deep distribution roughly matches the deep table (20/45/30/5)", () => {
    const rng = createRng(SEED);
    const N = 20_000;
    const counts: Record<Tier, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (let i = 0; i < N; i++) counts[rollTier(rng, "deep")]++;
    expect(counts[1] / N).toBe(0);
    expect(counts[2] / N).toBeGreaterThan(0.16);
    expect(counts[2] / N).toBeLessThan(0.24);
    expect(counts[3] / N).toBeGreaterThan(0.41);
    expect(counts[3] / N).toBeLessThan(0.49);
    expect(counts[4] / N).toBeGreaterThan(0.26);
    expect(counts[4] / N).toBeLessThan(0.34);
    expect(counts[5] / N).toBeGreaterThan(0.02);
    expect(counts[5] / N).toBeLessThan(0.08);
  });

  it("deep collapses to all-T2 under a starter-realm maxTier=2 cap", () => {
    // The push-deeper carrot is gated by the realm cap: starter realms
    // (cap T2) see no benefit from the deep band, so deep loot is a
    // reason to play *player-built* (higher-cap) realms. See tier.ts.
    const rng = createRng(SEED);
    for (let i = 0; i < 500; i++) {
      expect(rollTier(rng, "deep", 2)).toBe(2);
    }
  });

  it("boss → never T1 or T2, can be T5", () => {
    // Rebalance: boss drops are guaranteed-premium — T3 floor.
    const rng = createRng(SEED);
    const seen = new Set<Tier>();
    for (let i = 0; i < 5000; i++) {
      const t = rollTier(rng, "boss");
      expect(t).not.toBe(1);
      expect(t).not.toBe(2);
      seen.add(t);
    }
    expect(seen.has(5)).toBe(true);
  });

  it("trivial distribution is roughly 70% T1 / 30% T2", () => {
    // HP-carry rebalance: T1 carries 70% weight at trivial depth so
    // most first drops are sidegrades; T2 lands the rest.
    const rng = createRng(SEED);
    const N = 10_000;
    const counts: Record<Tier, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (let i = 0; i < N; i++) counts[rollTier(rng, "trivial")]++;
    expect(counts[1] / N).toBeGreaterThan(0.66);
    expect(counts[1] / N).toBeLessThan(0.74);
    expect(counts[2] / N).toBeGreaterThan(0.26);
    expect(counts[2] / N).toBeLessThan(0.34);
    expect(counts[3] / N).toBe(0);
  });

  it("standard distribution roughly matches the rebalanced table", () => {
    // Rebalance: 60% T2 / 30% T3 / 10% T4. With starter-realm
    // maxTier=2, the renormaliser collapses this to 100% T2 — i.e.
    // every post-depth-1 drop is a real upgrade.
    const rng = createRng(SEED);
    const N = 10_000;
    const counts: Record<Tier, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (let i = 0; i < N; i++) counts[rollTier(rng, "standard")]++;
    expect(counts[1] / N).toBe(0);
    expect(counts[2] / N).toBeGreaterThan(0.56);
    expect(counts[2] / N).toBeLessThan(0.64);
    expect(counts[3] / N).toBeGreaterThan(0.26);
    expect(counts[3] / N).toBeLessThan(0.34);
    expect(counts[4] / N).toBeGreaterThan(0.06);
    expect(counts[4] / N).toBeLessThan(0.14);
  });

  it("boss distribution roughly matches the rebalanced table", () => {
    // Rebalance: 40% T3 / 45% T4 / 15% T5.
    const rng = createRng(SEED);
    const N = 20_000;
    const counts: Record<Tier, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (let i = 0; i < N; i++) counts[rollTier(rng, "boss")]++;
    expect(counts[1] / N).toBe(0);
    expect(counts[2] / N).toBe(0);
    expect(counts[3] / N).toBeGreaterThan(0.36);
    expect(counts[3] / N).toBeLessThan(0.44);
    expect(counts[4] / N).toBeGreaterThan(0.41);
    expect(counts[4] / N).toBeLessThan(0.49);
    expect(counts[5] / N).toBeGreaterThan(0.11);
    expect(counts[5] / N).toBeLessThan(0.19);
  });

  it("is deterministic across rng instances", () => {
    const a = createRng(SEED);
    const b = createRng(SEED);
    for (let i = 0; i < 200; i++) {
      expect(rollTier(a, "boss")).toEqual(rollTier(b, "boss"));
    }
  });
});

describe("tier table integrity", () => {
  it("every difficulty distribution sums to 100", () => {
    for (const [_, dist] of Object.entries(_tierTablesForTests.TIER_DISTRIBUTION)) {
      const sum = dist.reduce((acc, [, w]) => acc + w, 0);
      expect(sum).toBe(100);
    }
  });

  it("every effect-count distribution sums to 100", () => {
    for (const [_, dist] of Object.entries(
      _tierTablesForTests.EFFECT_COUNT_DISTRIBUTION,
    )) {
      const sum = dist.reduce((acc, [, w]) => acc + w, 0);
      expect(sum).toBe(100);
    }
  });
});

describe("rollEffectCount", () => {
  it("T1 always returns 0", () => {
    const rng = createRng(SEED);
    for (let i = 0; i < 500; i++) {
      expect(rollEffectCount(rng, 1)).toBe(0);
    }
  });

  it("T2 returns 0 or 1, roughly 85/15", () => {
    const rng = createRng(SEED);
    const N = 10_000;
    let zero = 0;
    let one = 0;
    for (let i = 0; i < N; i++) {
      const c = rollEffectCount(rng, 2);
      if (c === 0) zero++;
      else if (c === 1) one++;
      else throw new Error(`T2 produced unexpected count ${c}`);
    }
    expect(zero / N).toBeGreaterThan(0.81);
    expect(zero / N).toBeLessThan(0.89);
    expect(one / N).toBeGreaterThan(0.11);
    expect(one / N).toBeLessThan(0.19);
  });

  it("T5 never returns 0", () => {
    const rng = createRng(SEED);
    for (let i = 0; i < 500; i++) {
      const c = rollEffectCount(rng, 5);
      expect(c).toBeGreaterThanOrEqual(1);
      expect(c).toBeLessThanOrEqual(3);
    }
  });

  it("T5 distribution roughly 60/35/5", () => {
    const rng = createRng(SEED);
    const N = 10_000;
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
    for (let i = 0; i < N; i++) counts[rollEffectCount(rng, 5)]!++;
    expect(counts[1]! / N).toBeGreaterThan(0.55);
    expect(counts[1]! / N).toBeLessThan(0.65);
    expect(counts[2]! / N).toBeGreaterThan(0.30);
    expect(counts[2]! / N).toBeLessThan(0.40);
    expect(counts[3]! / N).toBeGreaterThan(0.02);
    expect(counts[3]! / N).toBeLessThan(0.08);
  });

  it("is deterministic across rng instances", () => {
    const a = createRng(SEED);
    const b = createRng(SEED);
    for (let i = 0; i < 200; i++) {
      expect(rollEffectCount(a, 4)).toEqual(rollEffectCount(b, 4));
    }
  });
});
