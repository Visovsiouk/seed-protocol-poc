import { describe, expect, it, vi } from "vitest";
import {
  FIELD,
  artRng,
  clampField,
  lerp,
  memoize,
  norm,
  polar,
  r2,
} from "./seed";

describe("artRng", () => {
  it("is deterministic for a key", () => {
    const a = Array.from({ length: 64 }, () => artRng("k").next());
    const b = Array.from({ length: 64 }, () => artRng("k").next());
    // Each call returns a FRESH generator from the same seed, so the first
    // draw of every instance is identical — that is the property generators
    // rely on, since each one drains its own instance.
    expect(new Set(a).size).toBe(1);
    expect(a[0]).toBe(b[0]);
  });

  it("decorrelates keys that differ by one character", () => {
    const draws = ["creature:fantasy:goblin", "creature:fantasy:goblio"].map(
      (k) => Array.from({ length: 8 }, () => artRng(k).nextInt(1_000_000)),
    );
    expect(draws[0]).not.toEqual(draws[1]);
  });

  it("produces a full sequence that repeats across instances", () => {
    const drain = () => {
      const rng = artRng("seq");
      return Array.from({ length: 32 }, () => rng.next());
    };
    expect(drain()).toEqual(drain());
  });

  it("never calls Math.random or Date.now", () => {
    const random = vi
      .spyOn(Math, "random")
      .mockImplementation(() => {
        throw new Error("Math.random on the render path");
      });
    const now = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("Date.now on the render path");
    });
    try {
      const rng = artRng("no-nondeterminism");
      expect(() => {
        rng.next();
        rng.nextInt(10);
        rng.rollDie(6);
        rng.chance(0.5);
        rng.pick([1, 2, 3]);
      }).not.toThrow();
    } finally {
      random.mockRestore();
      now.mockRestore();
    }
  });
});

describe("memoize", () => {
  it("builds once per key", () => {
    const cache = new Map<string, number>();
    const build = vi.fn(() => 7);
    expect(memoize(cache, "a", build)).toBe(7);
    expect(memoize(cache, "a", build)).toBe(7);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("keys independently", () => {
    const cache = new Map<string, string>();
    expect(memoize(cache, "a", () => "A")).toBe("A");
    expect(memoize(cache, "b", () => "B")).toBe("B");
  });
});

describe("geometry helpers", () => {
  it("rounds to 2dp", () => {
    expect(r2(1 / 3)).toBe(0.33);
    expect(r2(99.999)).toBe(100);
  });

  it("clamps into the field", () => {
    expect(clampField(-20)).toBe(0);
    expect(clampField(420)).toBe(FIELD);
    expect(clampField(37.5)).toBe(37.5);
  });

  it("lerps and normalizes", () => {
    expect(lerp(10, 20, 0.5)).toBe(15);
    expect(norm(15, 10, 20)).toBe(0.5);
  });

  it("clamps norm rather than extrapolating", () => {
    // A player realm shipping an 800-HP boss must produce a chunky-but-sane
    // creature, not one that bursts out of the viewBox.
    expect(norm(800, 6, 42)).toBe(1);
    expect(norm(-5, 6, 42)).toBe(0);
  });

  it("guards a degenerate band", () => {
    expect(norm(5, 10, 10)).toBe(0);
  });

  it("puts polar(0) straight up", () => {
    expect(polar(50, 50, 10, 0)).toEqual([50, 40]);
    expect(polar(50, 50, 10, Math.PI)).toEqual([50, 60]);
  });
});
