/**
 * Deterministic seeding for the procedural art layer.
 *
 * Every generated visual — a creature silhouette, an item glyph, a player
 * crest — is a pure function of a string key. Same key, same art, on every
 * machine and every render. That is what lets art cover entities that don't
 * exist yet: a realm somebody deploys next month gets a stable, plausible
 * look for free, with nothing to author and nothing to ship.
 *
 * Why keccak256 and not a cheap xmur3/FNV mixer: `createRng` validates a
 * 32-byte hex seed and we already ship `keccak256` to the client via viem, so
 * this reuses the one hash discipline the codebase already has rather than
 * inventing a second. Cost is irrelevant because it runs once per key per
 * session (see the cache below), never per render.
 *
 * SSR safety: nothing here reads `Math.random`, `Date.now`, or the DOM, so a
 * server render and the client hydration produce identical geometry.
 */

import { keccak256, stringToHex } from "viem";
import { createRng, type Rng } from "@/lib/engine/rng";

/**
 * An `Rng` is stateful — two callers sharing one instance get different draws.
 * So this cache is NOT about reusing a generator across call sites; it only
 * avoids re-hashing a key we've seen before. Generators call `artRng` once,
 * drain it, and memoize the resulting *spec*. Never hand an `Rng` from here
 * to two different consumers.
 */
const rngCache = new Map<string, `0x${string}`>();

/** Seeded RNG for an art key, e.g. `"creature:fantasy:goblin"`. */
export function artRng(key: string): Rng {
  let seed = rngCache.get(key);
  if (seed === undefined) {
    seed = keccak256(stringToHex(key));
    rngCache.set(key, seed);
  }
  return createRng(seed);
}

/**
 * Memoize a generator on its cache key.
 *
 * The key must contain every input that affects output, and nothing else.
 * Live combat state (current HP, boss phase) must never reach a generator —
 * it drives animation on the component instead. That rule is what makes art
 * stable per species, and `lib/art/*.test.ts` asserts it.
 */
export function memoize<T>(
  cache: Map<string, T>,
  key: string,
  build: () => T,
): T {
  let hit = cache.get(key);
  if (hit === undefined) {
    hit = build();
    cache.set(key, hit);
  }
  return hit;
}

// ─── geometry helpers ─────────────────────────────────────────────────────────
// All art is authored in a 0..100 square field and rendered through a
// `viewBox="0 0 100 100"`, so an SVG scales to whatever box the layout can
// spare without any pixel budget to maintain. `FIELD` is that extent and
// `MID` its axis of symmetry — creatures mirror across it so output reads as
// a face rather than noise.

export const FIELD = 100;
export const MID = 50;

/** Round to 2dp so path strings stay short and snapshot-stable. */
export function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Clamp into the field so no silhouette can escape the viewBox. */
export function clampField(n: number): number {
  return Math.min(FIELD, Math.max(0, n));
}

/** Linear map of `t` in [0,1] onto [lo,hi]. */
export function lerp(lo: number, hi: number, t: number): number {
  return lo + (hi - lo) * t;
}

/**
 * Normalize a stat onto [0,1] for driving geometry. Values outside the
 * expected band clamp rather than extrapolate, so a player realm shipping an
 * 800-HP boss produces a chunky-but-sane creature instead of one that bursts
 * out of the field.
 */
export function norm(value: number, lo: number, hi: number): number {
  if (hi <= lo) return 0;
  return Math.min(1, Math.max(0, (value - lo) / (hi - lo)));
}

/** Point on a circle, in field coordinates. Angle in radians, 0 = up. */
export function polar(
  cx: number,
  cy: number,
  radius: number,
  angle: number,
): readonly [number, number] {
  return [
    r2(cx + Math.sin(angle) * radius),
    r2(cy - Math.cos(angle) * radius),
  ];
}
