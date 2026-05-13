/**
 * Deterministic seeded RNG for the engine. Same seed → same sequence,
 * across machines and tabs and process restarts.
 *
 * Implementation is **sfc32** (Simple Fast Counter) — 128-bit state, no
 * BigInt math, ~2^128 period, passes PractRand far beyond what a single
 * playthrough draws. Picked over xoshiro128++ because it's a hair faster
 * in V8 and the surface needed here (`next`/`nextInt`/`rollDie`) is tiny.
 *
 * Seed loading: fold the 32-byte seed through splitmix32 byte by byte
 * into a single uint32 `h`, then cascade `h` through four more mix32
 * rounds to seed the four sfc32 lanes. Any single-byte change in the
 * seed avalanches into every lane — important because production seeds
 * are keccak256 (already well-spread), but unit tests use integer seeds
 * like `0x00...01` whose informational difference is one byte. Cascade
 * seeding gives those tests proper distributional behavior.
 *
 * The seed itself is the 32-byte hex string committed at encounter start:
 * `keccak256(playerAddr ‖ blockhash ‖ encounterId)`.
 */

export type Rng = {
  /** Uniform [0, 1). */
  next: () => number;
  /** Uniform integer in [0, max). Throws when max <= 0. */
  nextInt: (max: number) => number;
  /** Standard die roll: integer in [1, sides]. */
  rollDie: (sides: number) => number;
  /** Returns true with probability p, where p is in [0, 1]. */
  chance: (p: number) => boolean;
  /** Picks a uniformly-random element of arr. Throws when arr is empty. */
  pick: <T>(arr: readonly T[]) => T;
};

const HEX = /^0x[0-9a-fA-F]{64}$/;

/** Splitmix32 mixer — bijective uint32 → uint32 avalanche. */
function mix32(x: number): number {
  x = (x + 0x9e3779b9) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return (x ^ (x >>> 15)) >>> 0;
}

/**
 * Build an `Rng` from a 32-byte hex seed. Cheap — call once per encounter.
 *
 * Throws on malformed input rather than silently degrading to a zero seed:
 * a misseeded RNG would mean every player gets identical loot for that
 * encounter, which is the kind of bug we'd rather crash on.
 */
export function createRng(seed: `0x${string}`): Rng {
  if (!HEX.test(seed)) {
    throw new Error(`createRng: expected 32-byte hex seed, got ${seed}`);
  }
  const hex = seed.slice(2);

  // Fold all 8 uint32 lanes of the seed into a single rolling hash `h`,
  // mixing on each absorption so byte-position-7 changes affect everything.
  let h = 0;
  for (let i = 0; i < 8; i++) {
    h = (h ^ parseInt(hex.slice(i * 8, i * 8 + 8), 16)) >>> 0;
    h = mix32(h);
  }
  // Cascade `h` into four sfc32 lanes via successive mix32 steps.
  let a = mix32(h ^ 0x6a09e667);
  let b = mix32(a ^ 0xbb67ae85);
  let c = mix32(b ^ 0x3c6ef372);
  let d = mix32(c ^ 0xa54ff53a);

  const next = (): number => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };

  const nextInt = (max: number): number => {
    if (max <= 0 || !Number.isFinite(max)) {
      throw new Error(`nextInt: max must be a positive finite number, got ${max}`);
    }
    return Math.floor(next() * max);
  };

  const rollDie = (sides: number): number => {
    if (!Number.isInteger(sides) || sides < 1) {
      throw new Error(`rollDie: sides must be a positive integer, got ${sides}`);
    }
    return nextInt(sides) + 1;
  };

  const chance = (p: number): boolean => {
    return next() < p;
  };

  const pick = <T>(arr: readonly T[]): T => {
    if (arr.length === 0) throw new Error("pick: cannot pick from empty array");
    return arr[nextInt(arr.length)]!;
  };

  return { next, nextInt, rollDie, chance, pick };
}
