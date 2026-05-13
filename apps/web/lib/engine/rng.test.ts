import { describe, expect, it } from "vitest";
import { createRng } from "./rng";

const SEED_A =
  "0x1111111111111111111111111111111111111111111111111111111111111111";
const SEED_B =
  "0x2222222222222222222222222222222222222222222222222222222222222222";
const SEED_ZERO =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

describe("createRng", () => {
  it("rejects malformed seeds", () => {
    expect(() => createRng("0xnotahex" as `0x${string}`)).toThrow();
    expect(() => createRng("0x1234" as `0x${string}`)).toThrow();
    expect(() => createRng("1111111111111111111111111111111111111111111111111111111111111111" as `0x${string}`)).toThrow();
  });

  it("produces a deterministic sequence for the same seed", () => {
    const a = createRng(SEED_A);
    const b = createRng(SEED_A);
    const seqA = Array.from({ length: 32 }, () => a.next());
    const seqB = Array.from({ length: 32 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences for different seeds", () => {
    const a = createRng(SEED_A);
    const b = createRng(SEED_B);
    const seqA = Array.from({ length: 16 }, () => a.next());
    const seqB = Array.from({ length: 16 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it("handles the all-zero seed without locking to zero", () => {
    const rng = createRng(SEED_ZERO);
    const samples = Array.from({ length: 64 }, () => rng.next());
    // sfc32 with the zero-state guard should still produce varied output.
    const uniques = new Set(samples).size;
    expect(uniques).toBeGreaterThan(32);
  });

  describe("next", () => {
    it("stays in [0, 1)", () => {
      const rng = createRng(SEED_A);
      for (let i = 0; i < 1000; i++) {
        const v = rng.next();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    });

    it("has a roughly uniform mean across 10k draws", () => {
      const rng = createRng(SEED_A);
      let sum = 0;
      const N = 10_000;
      for (let i = 0; i < N; i++) sum += rng.next();
      const mean = sum / N;
      // 4σ window around 0.5 for uniform[0,1) with N=10k.
      expect(mean).toBeGreaterThan(0.485);
      expect(mean).toBeLessThan(0.515);
    });
  });

  describe("nextInt", () => {
    it("stays in [0, max)", () => {
      const rng = createRng(SEED_A);
      for (let i = 0; i < 1000; i++) {
        const v = rng.nextInt(7);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(7);
        expect(Number.isInteger(v)).toBe(true);
      }
    });

    it("rejects non-positive max", () => {
      const rng = createRng(SEED_A);
      expect(() => rng.nextInt(0)).toThrow();
      expect(() => rng.nextInt(-1)).toThrow();
      expect(() => rng.nextInt(Number.POSITIVE_INFINITY)).toThrow();
    });
  });

  describe("rollDie", () => {
    it("rolls in [1, sides] for a d6", () => {
      const rng = createRng(SEED_A);
      const counts = new Array<number>(7).fill(0);
      for (let i = 0; i < 6000; i++) counts[rng.rollDie(6)]!++;
      expect(counts[0]).toBe(0); // never zero
      for (let face = 1; face <= 6; face++) {
        expect(counts[face]).toBeGreaterThan(800); // ~1000 ± noise
        expect(counts[face]).toBeLessThan(1200);
      }
    });

    it("rejects non-integer / sub-one sides", () => {
      const rng = createRng(SEED_A);
      expect(() => rng.rollDie(0)).toThrow();
      expect(() => rng.rollDie(1.5)).toThrow();
    });
  });

  describe("chance", () => {
    it("approximates the target probability", () => {
      const rng = createRng(SEED_A);
      let hits = 0;
      for (let i = 0; i < 10_000; i++) if (rng.chance(0.3)) hits++;
      // 4σ window around 3000 for binomial(10000, 0.3) ≈ σ=46.
      expect(hits).toBeGreaterThan(2800);
      expect(hits).toBeLessThan(3200);
    });

    it("is never true at p=0 and always true at p=1", () => {
      const rng = createRng(SEED_A);
      for (let i = 0; i < 100; i++) {
        expect(rng.chance(0)).toBe(false);
        expect(rng.chance(1)).toBe(true);
      }
    });
  });

  describe("pick", () => {
    it("returns an element of the array", () => {
      const rng = createRng(SEED_A);
      const arr = ["a", "b", "c", "d"] as const;
      for (let i = 0; i < 100; i++) {
        expect(arr).toContain(rng.pick(arr));
      }
    });

    it("throws on empty array", () => {
      const rng = createRng(SEED_A);
      expect(() => rng.pick([])).toThrow();
    });

    it("covers all elements over enough samples", () => {
      const rng = createRng(SEED_A);
      const arr = ["a", "b", "c", "d"] as const;
      const seen = new Set<string>();
      for (let i = 0; i < 200; i++) seen.add(rng.pick(arr));
      expect(seen.size).toBe(arr.length);
    });
  });

  describe("fuzz", () => {
    it("never throws or NaNs over 1000 distinct seeds", () => {
      for (let i = 0; i < 1000; i++) {
        const hex = i.toString(16).padStart(64, "0");
        const rng = createRng(`0x${hex}` as `0x${string}`);
        for (let j = 0; j < 32; j++) {
          const v = rng.next();
          expect(Number.isFinite(v)).toBe(true);
        }
      }
    });
  });
});
