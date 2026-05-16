import { describe, expect, it } from "vitest";
import { createRng } from "./rng";
import { _tierTablesForTests, rollTier, tierStats } from "./tier";
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
  it("trivial → only T1/T2", () => {
    const rng = createRng(SEED);
    for (let i = 0; i < 500; i++) {
      const t = rollTier(rng, "trivial");
      expect([1, 2]).toContain(t);
    }
  });

  it("standard → only T1/T2/T3", () => {
    const rng = createRng(SEED);
    for (let i = 0; i < 500; i++) {
      const t = rollTier(rng, "standard");
      expect([1, 2, 3]).toContain(t);
    }
  });

  it("boss → never T1, can be T5", () => {
    const rng = createRng(SEED);
    const seen = new Set<Tier>();
    for (let i = 0; i < 5000; i++) {
      const t = rollTier(rng, "boss");
      expect(t).not.toBe(1);
      seen.add(t);
    }
    expect(seen.has(5)).toBe(true);
  });

  it("trivial distribution roughly matches the tier table", () => {
    const rng = createRng(SEED);
    const N = 10_000;
    const counts: Record<Tier, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (let i = 0; i < N; i++) counts[rollTier(rng, "trivial")]++;
    // 90% / 10% — generous bands so we don't flake on seed drift.
    expect(counts[1] / N).toBeGreaterThan(0.86);
    expect(counts[1] / N).toBeLessThan(0.94);
    expect(counts[2] / N).toBeGreaterThan(0.06);
    expect(counts[2] / N).toBeLessThan(0.14);
  });

  it("standard distribution roughly matches the tier table", () => {
    const rng = createRng(SEED);
    const N = 10_000;
    const counts: Record<Tier, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (let i = 0; i < N; i++) counts[rollTier(rng, "standard")]++;
    // 50% / 35% / 15%.
    expect(counts[1] / N).toBeGreaterThan(0.46);
    expect(counts[1] / N).toBeLessThan(0.54);
    expect(counts[2] / N).toBeGreaterThan(0.31);
    expect(counts[2] / N).toBeLessThan(0.39);
    expect(counts[3] / N).toBeGreaterThan(0.11);
    expect(counts[3] / N).toBeLessThan(0.19);
  });

  it("boss distribution roughly matches the tier table", () => {
    const rng = createRng(SEED);
    const N = 20_000;
    const counts: Record<Tier, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (let i = 0; i < N; i++) counts[rollTier(rng, "boss")]++;
    // 0% / 30% / 50% / 18% / 2%.
    expect(counts[1] / N).toBe(0);
    expect(counts[2] / N).toBeGreaterThan(0.26);
    expect(counts[2] / N).toBeLessThan(0.34);
    expect(counts[3] / N).toBeGreaterThan(0.46);
    expect(counts[3] / N).toBeLessThan(0.54);
    expect(counts[4] / N).toBeGreaterThan(0.14);
    expect(counts[4] / N).toBeLessThan(0.22);
    // 2% is small enough to be noisy — just confirm we see it.
    expect(counts[5]).toBeGreaterThan(0);
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
});
