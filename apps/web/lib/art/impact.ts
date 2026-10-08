/**
 * Impact mark generator — what a hit *looks* like.
 *
 * Keyed on the equipped weapon's archetype **lane**, so the mark describes the
 * weapon you actually brought: a dagger flicks, a cannon blooms. Lane (not
 * weapon name) is the right key for the same reason `archetypes.ts` uses it —
 * it is the axis the on-chain enums and the cross-realm adapters agree on, so
 * a fantasy axe and a cyberpunk shotgun both read as heavy without a per-preset
 * table.
 *
 * Geometry only, like every spec here. The element hue is resolved by the
 * renderer through `palette.ts`, which is why nothing below knows about colour.
 *
 * ## Why variation is safe here
 *
 * The other generators are stable by design — a Goblin must always look like a
 * Goblin. An impact is the opposite: replaying one frozen mark on every swing
 * reads as a decal stuck to the screen rather than a hit landing. So this one
 * varies, seeded on a **hit counter** rather than a clock or `Math.random`.
 *
 * That stays SSR-safe because the counter is client-only state that starts at
 * 0 and is bumped inside an effect, and the component renders nothing at 0.
 * A server render and its hydration therefore agree: both draw no impact. The
 * variation only begins once the player has actually swung.
 */

import { type Shape } from "./archetypes";
import { artRng, lerp, memoize, polar, r2 } from "./seed";

/** The shape of a blow. One per weapon lane, plus a fallback. */
export type Gesture =
  | "burst"
  | "cleave"
  | "flick"
  | "slash"
  | "pierce"
  | "bloom";

export type ImpactSpec = {
  readonly gesture: Gesture;
  /** The marks themselves. */
  readonly strokes: readonly Shape[];
  /** Shock ring at the point of contact — absent for pure cutting gestures. */
  readonly ring: { cx: number; cy: number; r: number } | null;
};

/**
 * Lane → gesture, by engine ordinal: 1 heavy, 2 light, 3 mid, 4 ranged,
 * 5 exotic. Index 0 is `"none"` — an unarmed swing still has to show
 * *something*, so it gets a small burst. Any lane past the vocabulary (a
 * player realm shipping a longer weapon list) falls back the same way, which
 * is the no-holes guarantee the rest of the art layer makes.
 */
const GESTURE_BY_LANE: readonly Gesture[] = [
  "burst",
  "cleave",
  "flick",
  "slash",
  "pierce",
  "bloom",
];

export function gestureForLane(lane: number): Gesture {
  return GESTURE_BY_LANE[lane] ?? "burst";
}

/**
 * How many distinct marks each gesture cycles through.
 *
 * Seeding on the raw hit count would make the memo cache grow for the whole
 * run — a few hundred entries by the end of a long delve, each one never
 * looked at again. Eight is already past the point where a human reads the
 * sequence as repeating, so the cycle is capped there and the cache is bounded
 * at lanes × 8.
 */
export const VARIANTS = 8;

/** Fold a monotonic hit counter into the variant cycle. */
export function impactVariant(hitNonce: number): number {
  return ((hitNonce % VARIANTS) + VARIANTS) % VARIANTS;
}

/**
 * Every mark stays within this radius of its own contact point, and the
 * contact point stays inside the band below. Together those bound the whole
 * spec inside the 0..100 field *by construction* rather than by clamping —
 * clamping would silently flatten a converging pierce into a bent one.
 */
const REACH = 32;
const CENTRE_X = [40, 60] as const;
const CENTRE_Y = [36, 52] as const;

const cache = new Map<string, ImpactSpec>();

export function impactSpec(lane: number, variant: number): ImpactSpec {
  const v = impactVariant(variant);
  return memoize(cache, `${lane}|${v}`, () => build(lane, v));
}

function segment(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  weight: number,
): Shape {
  return { kind: "path", d: `M${x1} ${y1} L${x2} ${y2}`, weight };
}

function build(lane: number, variant: number): ImpactSpec {
  const gesture = gestureForLane(lane);
  const rng = artRng(`impact:${lane}:${variant}`);

  // Contact point: drifts around the creature's upper mass so successive hits
  // don't all land on the same pixel.
  const cx = r2(lerp(CENTRE_X[0], CENTRE_X[1], rng.next()));
  const cy = r2(lerp(CENTRE_Y[0], CENTRE_Y[1], rng.next()));
  // Shared base angle. Every gesture orients off this, so the mark reads as
  // one blow from one direction rather than unrelated scratches.
  const base = lerp(0, Math.PI, rng.next());

  const strokes: Shape[] = [];
  let ring: ImpactSpec["ring"] = null;

  if (gesture === "cleave") {
    // One heavy bowed arc, with a thinner echo inside it for follow-through.
    const reach = lerp(24, 30, rng.next());
    const bow = lerp(10, 18, rng.next()) * (rng.chance(0.5) ? 1 : -1);
    for (const [scale, weight] of [
      [1, 5.5],
      [0.72, 2],
    ] as const) {
      const [x1, y1] = polar(cx, cy, reach * scale, base);
      const [x2, y2] = polar(cx, cy, reach * scale, base + Math.PI);
      const [bx, by] = polar(cx, cy, bow * scale, base + Math.PI / 2);
      strokes.push({
        kind: "path",
        d: `M${x1} ${y1} Q${bx} ${by} ${x2} ${y2}`,
        weight,
      });
    }
  } else if (gesture === "flick") {
    // Three quick thin strokes across the blow's axis, the middle one longest
    // so the group reads as one motion.
    //
    // The drift and the fan are not decoration. Stacking three equal parallel
    // strokes at an even spacing produces a "≡" — a hamburger icon, not a cut.
    // Sliding each one along its own direction turns the stack into a
    // cascade, and a few degrees of fan stops them scanning as a ruled grid.
    for (let k = 0; k < 3; k++) {
      const spread = (k - 1) * lerp(6, 9, rng.next());
      const [px, py] = polar(cx, cy, spread, base + Math.PI / 2);
      const drift = (k - 1) * lerp(3, 6.5, rng.next());
      const [qx, qy] = polar(px, py, drift, base);
      const angle = base + lerp(-0.12, 0.12, rng.next());
      const half = (lerp(12, 18, rng.next()) * (k === 1 ? 1.25 : 1)) / 2;
      const [sx, sy] = polar(qx, qy, half, angle);
      const [ex, ey] = polar(qx, qy, half, angle + Math.PI);
      strokes.push(segment(sx, sy, ex, ey, 1.8));
    }
  } else if (gesture === "slash") {
    // A crossed pair — the workhorse cut.
    //
    // Pinned to a diagonal band rather than taking the shared base angle. Two
    // strokes roughly 80° apart are an X *only* if the pair straddles the
    // diagonals; let one of them drift onto the vertical and the mark stops
    // reading as a cut and starts reading as a crosshair. The band keeps both
    // strokes clear of 0°/90°/180° at every variant.
    const lead = lerp(0.55, 0.95, rng.next());
    const sep = lerp(1.25, 1.45, rng.next());
    for (let k = 0; k < 2; k++) {
      const reach = lerp(24, 30, rng.next()) * (k === 0 ? 1 : 0.85);
      const angle = lead + k * sep;
      const [x1, y1] = polar(cx, cy, reach, angle);
      const [x2, y2] = polar(cx, cy, reach, angle + Math.PI);
      strokes.push(segment(x1, y1, x2, y2, k === 0 ? 3.5 : 2.5));
    }
  } else if (gesture === "pierce") {
    // Converging trails driving into a small entry ring — a shot, not a cut.
    const ringR = r2(lerp(5, 8, rng.next()));
    const reach = lerp(24, 31, rng.next());
    for (let k = 0; k < 3; k++) {
      const fan = (k - 1) * lerp(0.16, 0.28, rng.next());
      const [ox, oy] = polar(cx, cy, reach, base + fan);
      // Stop short of the ring so the trails read as arriving at it.
      const [ix, iy] = polar(cx, cy, ringR + 2.5, base + fan);
      strokes.push(segment(ox, oy, ix, iy, k === 1 ? 2.6 : 1.6));
    }
    ring = { cx, cy, r: ringR };
  } else {
    // bloom / burst — radial. Exotic weapons detonate; a bare fist taps.
    const big = gesture === "bloom";
    const count = big ? 5 + rng.nextInt(3) : 4;
    const ringR = r2(big ? lerp(7, 11, rng.next()) : lerp(4, 6, rng.next()));
    for (let k = 0; k < count; k++) {
      const angle = base + (k * 2 * Math.PI) / count;
      const reach = big ? lerp(20, REACH - 2, rng.next()) : lerp(13, 19, rng.next());
      const [ox, oy] = polar(cx, cy, reach, angle);
      const [ix, iy] = polar(cx, cy, ringR + 1.5, angle);
      strokes.push(segment(ix, iy, ox, oy, big ? 2.4 : 1.8));
    }
    ring = { cx, cy, r: ringR };
  }

  return { gesture, strokes, ring };
}

/** Test seam — the memo cache is module-global by design. */
export function __clearImpactCache(): void {
  cache.clear();
}

/** Exported for the containment test; see `REACH`. */
export const __bounds = { REACH, CENTRE_X, CENTRE_Y } as const;
