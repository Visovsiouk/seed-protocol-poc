"use client";

/**
 * CreatureSigil — the thing you are facing, drawn.
 *
 * Renders a generated `CreatureSpec` as inline SVG with four motion layers:
 * an idle breathe, an element aura, a hit flinch re-keyed off the caller's
 * damage nonce, and a one-shot bloom when a warden turns. Geometry comes from
 * `lib/art/creature.ts`; every colour resolves through `lib/art/palette.ts`.
 *
 * Sizing is the load-bearing decision. The sigil is an SVG with a `0 0 100
 * 100` viewBox and `preserveAspectRatio`, dropped into a `min-h-0 flex-1`
 * box — so it takes whatever vertical space the stage has left over and
 * scales to fit. A cramped room shrinks it; a short intro lets it grow.
 * **Overflow is structurally impossible**, which is what keeps the stage's
 * fixed-height zero-jump guarantee intact without maintaining a pixel budget
 * as copy and type change around it.
 *
 * SVG transform note: Framer writes `transform` into `style`, and an SVG `<g>`
 * needs `transformBox: fill-box` + `transformOrigin: center` for a relative
 * origin to resolve. Without it a 1.8% breathe scale pivots on the SVG origin
 * and the creature slides off its feet on every breath.
 */

import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { Shape } from "@/lib/art/archetypes";
import type { CreatureSpec } from "@/lib/art/creature";
import {
  RESIST_INK,
  WEAK_INK,
  auraInk,
  echoInk,
  entityInk,
} from "@/lib/art/palette";

/** Origin fix for every animated SVG group. See the header note. */
const SVG_ORIGIN = {
  transformBox: "fill-box",
  transformOrigin: "center",
} as const;

/** Slow idle breathe. Keyframe array — mount only when motion is allowed. */
const breathe: Variants = {
  rest: { scale: 1 },
  live: {
    scale: [1, 1.018, 1],
    transition: { duration: 4.2, ease: "easeInOut", repeat: Infinity },
  },
};

/** Element aura swelling behind the silhouette. Keyframe array. */
const auraPulse: Variants = {
  rest: { opacity: 0.5, scale: 1 },
  live: {
    opacity: [0.38, 0.62, 0.38],
    scale: [1, 1.06, 1],
    transition: { duration: 3.4, ease: "easeInOut", repeat: Infinity },
  },
};

/** One-shot recoil when struck — re-keyed on the caller's hit nonce. */
const flinch: Variants = {
  rest: { x: 0, scale: 1 },
  hit: {
    x: [0, -3.5, 2.5, -1.5, 0],
    scale: [1, 0.965, 1.01, 1],
    transition: { duration: 0.42, ease: "easeOut" },
  },
};

/** The warden turning — a hard bloom as the second phase takes hold. */
const turn: Variants = {
  rest: { opacity: 1, scale: 1 },
  bloom: {
    opacity: [0.35, 1, 1],
    scale: [1.14, 0.97, 1],
    transition: { duration: 1.1, ease: "easeOut", times: [0, 0.55, 1] },
  },
};

function draw(shape: Shape, key: string, ink: string) {
  if (shape.kind === "circle") {
    return (
      <circle
        key={key}
        cx={shape.cx}
        cy={shape.cy}
        r={shape.r}
        fill={shape.filled ? ink : "none"}
        stroke={ink}
        strokeWidth={shape.filled ? 0 : 2}
      />
    );
  }
  return (
    <path
      key={key}
      d={shape.d}
      fill={shape.filled ? ink : "none"}
      stroke={ink}
      strokeWidth={shape.weight ?? 2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

type Props = {
  spec: CreatureSpec;
  /** Drives hue and aura. `null`/`"none"` falls back to inherited ink. */
  element?: string | null;
  /** Bumped by the caller on every HP loss; re-keys the flinch. */
  hitNonce?: number;
  /** True once a boss has turned — plays the bloom and thickens the ink. */
  turned?: boolean;
  /** Accessible description; the stage already names the enemy in text. */
  label?: string;
  className?: string;
};

export function CreatureSigil({
  spec,
  element,
  hitNonce = 0,
  turned = false,
  label,
  className,
}: Props) {
  const reduced = useReducedMotion();
  const ink = entityInk(element);
  const aura = auraInk(element, 50);

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {/* Aura sits behind everything and never carries geometry meaning. */}
      {spec.aura &&
        (reduced ? (
          <circle cx={spec.aura.cx} cy={spec.aura.cy} r={spec.aura.r} fill={aura} opacity={0.5} />
        ) : (
          <motion.circle
            cx={spec.aura.cx}
            cy={spec.aura.cy}
            r={spec.aura.r}
            fill={aura}
            style={SVG_ORIGIN}
            variants={auraPulse}
            initial="rest"
            animate="live"
          />
        ))}

      {/* flinch (outermost) → turn bloom → breathe → the drawn creature. */}
      <motion.g
        key={`hit:${hitNonce}`}
        style={SVG_ORIGIN}
        variants={reduced ? undefined : flinch}
        initial="rest"
        animate={reduced || hitNonce === 0 ? "rest" : "hit"}
      >
        <motion.g
          key={`phase:${turned ? "2" : "1"}`}
          style={SVG_ORIGIN}
          variants={reduced ? undefined : turn}
          initial={reduced || !turned ? false : "rest"}
          animate={reduced || !turned ? "rest" : "bloom"}
        >
          <motion.g
            style={SVG_ORIGIN}
            variants={reduced ? undefined : breathe}
            initial="rest"
            animate={reduced ? "rest" : "live"}
          >
            <g strokeLinecap="round" strokeLinejoin="round">
              {spec.body.map((s, n) => draw(s, `b${n}`, ink))}
              {spec.plates.map((s, n) => draw(s, `p${n}`, ink))}
              {spec.crown.map((s, n) => draw(s, `c${n}`, ink))}
              {spec.eyes.map((s, n) => draw(s, `e${n}`, turned ? WEAK_INK : ink))}
              {/* Weakness reads as damage, resistance as protection —
                  independent of the creature's own element. */}
              {spec.marks.map((s, n) =>
                draw(s, `m${n}`, n === 0 && spec.marks.length > 1 ? WEAK_INK : RESIST_INK),
              )}
            </g>
          </motion.g>
        </motion.g>
      </motion.g>
    </svg>
  );
}

/**
 * The backdrop echo — the same creature at stage scale, faint, behind the
 * text. Purely atmospheric: stroke-only, low alpha, `aria-hidden`, and
 * absolutely positioned so it contributes no layout whatsoever. This is what
 * gives the stage presence without spending any of the 352px budget.
 */
export function CreatureEcho({
  spec,
  element,
}: {
  spec: CreatureSpec;
  element?: string | null;
}) {
  // Carries most of the stage's presence, because it is the only layer that
  // can be large: the foreground sigil is capped by the 352px budget it has
  // to share with prose, a name, a health bar and chips. `meet` (not `slice`)
  // so the whole creature shows at stage height — `slice` crops a wide stage
  // to the middle band and decapitates it.
  const ink = echoInk(element, 30);
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      className="pointer-events-none absolute inset-0 -z-10 h-full w-full"
    >
      <g strokeLinecap="round" strokeLinejoin="round">
        {spec.body.map((s, n) => draw(s, `eb${n}`, ink))}
        {spec.crown.map((s, n) => draw(s, `ec${n}`, ink))}
      </g>
    </svg>
  );
}
