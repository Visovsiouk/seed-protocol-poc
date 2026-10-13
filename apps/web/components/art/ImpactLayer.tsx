"use client";

/**
 * ImpactLayer — the blow landing on the enemy.
 *
 * Absolutely positioned over the creature sigil, so a hit reads as striking
 * *the thing you are facing* rather than decorating the panel. Being absolute
 * means it costs nothing from the stage's fixed height — the 22rem slot's
 * zero-jump guarantee is untouched.
 *
 * It fires off the same `hitNonce` the HP bar's shake and the creature's
 * flinch already use, so all three land on one beat from one observation of
 * the HP drop. No second watcher, no timers: `impactStrike` ends at zero
 * opacity, so re-keying on the nonce is the entire lifecycle.
 *
 * The mark's shape comes from the equipped weapon's lane — a dagger flicks, a
 * cannon blooms — and its hue from the weapon's element, which is exactly the
 * pair that decides the damage multiplier. So the flourish is also a readout:
 * the colour that flashes is the colour being checked against the monster's
 * weakness.
 *
 * SVG transform note, same as `CreatureSigil`: Framer writes `transform` into
 * `style`, and an SVG `<g>` needs `transformBox: fill-box` +
 * `transformOrigin: center` for a relative origin to resolve. The bloom scales
 * from the mark's own centre only because of those two lines.
 */

import { motion, useReducedMotion } from "framer-motion";
import type { Shape } from "@/lib/art/archetypes";
import { impactSpec } from "@/lib/art/impact";
import { auraInk, entityInk } from "@/lib/art/palette";
import { impactStrike } from "@/lib/ui/motion";

/** Origin fix for the animated group. See the header note. */
const SVG_ORIGIN = {
  transformBox: "fill-box",
  transformOrigin: "center",
} as const;

/**
 * Stroke width for the glow pass under a mark of the given weight.
 *
 * A flat addition is wrong at both ends of the range the gestures span. On a
 * dagger's 1.8-weight flick, +3.5 makes the halo nearly three times the line
 * it is meant to be lighting, and the mark reads as a smudge; on an axe's 5.5
 * cleave, a purely proportional halo would smear ~13 units across the field.
 * So: proportional for thin strokes, capped flat for thick ones.
 */
const HALO = 3.5;
const HALO_MAX_RATIO = 2.4;

function haloWeight(weight: number): number {
  return Math.min(weight + HALO, weight * HALO_MAX_RATIO);
}

function mark(shape: Shape, key: string, ink: string, glow: boolean) {
  const weight = shape.kind === "circle" ? 2 : (shape.weight ?? 2);
  const strokeWidth = glow ? haloWeight(weight) : weight;
  if (shape.kind === "circle") {
    return (
      <circle
        key={key}
        cx={shape.cx}
        cy={shape.cy}
        r={shape.r}
        fill="none"
        stroke={ink}
        strokeWidth={strokeWidth}
      />
    );
  }
  return (
    <path
      key={key}
      d={shape.d}
      fill="none"
      stroke={ink}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

export function ImpactLayer({
  lane,
  element,
  hitNonce,
  className,
}: {
  /**
   * The equipped weapon's archetype lane (1 heavy … 5 exotic); `0` for
   * unarmed. Resolved by the caller, because picking the right vocabulary for
   * a carried item is a cross-realm question and this component shouldn't
   * have an opinion about realms.
   */
  lane: number;
  /** Equipped weapon's element. Absent/`"none"` → inherits the realm ink. */
  element?: string | null;
  /** Monotonic count of hits landed. `0` means none yet — nothing renders. */
  hitNonce: number;
  className?: string;
}) {
  const reduced = useReducedMotion();

  // Two reasons to draw nothing, and they are different reasons.
  //
  // `hitNonce === 0` is the mount state, including every server render: the
  // player has not swung, so there is no blow to show. Gating here is also
  // what keeps the varying spec hydration-safe — SSR and the first client
  // render agree on "no impact", and the nonce only moves inside an effect.
  //
  // Reduced motion skips it because the mark is pure motion: it has no
  // resting state, so there is nothing to flatten it to. A static slash would
  // simply never leave the screen. The damage number still reports the hit.
  if (hitNonce <= 0 || reduced) return null;

  const spec = impactSpec(lane, hitNonce);
  const ink = entityInk(element);
  const glow = auraInk(element, 55);
  const ring: Shape | null =
    spec.ring === null ? null : { kind: "circle", ...spec.ring };

  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className ?? ""}`}
      focusable="false"
    >
      <motion.g
        // Re-keying on the nonce remounts the group, which replays the
        // one-shot from the start even if the previous hit is still fading.
        key={hitNonce}
        style={SVG_ORIGIN}
        variants={impactStrike}
        initial={false}
        animate="struck"
      >
        {/* Glow pass first: the same geometry, fatter and translucent, so the
            mark has heat under it instead of reading as a wireframe. */}
        {spec.strokes.map((s, i) => mark(s, `g${i}`, glow, true))}
        {ring && mark(ring, "gring", glow, true)}

        {spec.strokes.map((s, i) => mark(s, `s${i}`, ink, false))}
        {ring && mark(ring, "ring", ink, false)}
      </motion.g>
    </svg>
  );
}
