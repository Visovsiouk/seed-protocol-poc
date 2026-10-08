"use client";

/**
 * CreatureSigil — the thing you are facing, drawn.
 *
 * Renders a generated `CreatureSpec` as inline SVG with four motion layers:
 * an idle breathe, an element aura, a hit flinch replayed off the caller's
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

import { useEffect } from "react";
import {
  motion,
  useAnimationControls,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import type { Shape } from "@/lib/art/archetypes";
import type { CreatureSpec } from "@/lib/art/creature";
import { compileSprite, type Sprite } from "@/lib/art/pixels";
import { RESIST_INK, WEAK_INK, auraInk, entityInk } from "@/lib/art/palette";

/** Side of the sigil's square coordinate field. Matches the root `viewBox`. */
const FIELD = 100;

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

/**
 * One-shot recoil when struck, replayed imperatively on each new hit nonce.
 *
 * Driven by controls rather than by re-keying the group: a changing `key`
 * remounts the whole subtree, which also restarts the idle breathe and
 * re-fires the warden's once-only `turn` bloom on every blow.
 */
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

/**
 * The authored sprite, scaled from its own 32-unit grid into the sigil's
 * 100-unit field. Scaling here rather than switching the root `viewBox` keeps
 * the aura, the motion wrappers and the echo working off one coordinate space,
 * so a sprite drops in without touching any of the layout reasoning above.
 */
function SpriteBody({ sprite }: { sprite: Sprite }) {
  const layers = compileSprite(sprite);
  const scale = FIELD / sprite.w;
  return (
    <g transform={`scale(${scale})`} shapeRendering="crispEdges">
      {layers.map((layer) => (
        <path key={layer.fill} d={layer.d} fill={layer.fill} />
      ))}
    </g>
  );
}

type Props = {
  spec: CreatureSpec;
  /**
   * Authored pixel art for this creature. When present it replaces the
   * generated silhouette; the generated `spec` is still read for the aura, so
   * element glow and the backdrop echo behave identically either way.
   */
  sprite?: Sprite | null;
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
  sprite,
  element,
  hitNonce = 0,
  turned = false,
  label,
  className,
}: Props) {
  const reduced = useReducedMotion();
  const ink = entityInk(element);
  const aura = auraInk(element, 50);

  // Replay the recoil on each new hit without remounting the subtree, so the
  // breathe keeps its phase and the `turn` bloom stays the one-shot it claims
  // to be. `start` restarts the keyframes even if the previous blow is still
  // fading, and they begin and end at rest, so back-to-back hits are safe.
  const flinchControls = useAnimationControls();
  useEffect(() => {
    if (reduced || hitNonce <= 0) return;
    void flinchControls.start("hit");
  }, [hitNonce, reduced, flinchControls]);

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
        style={SVG_ORIGIN}
        variants={reduced ? undefined : flinch}
        initial="rest"
        animate={flinchControls}
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
            {sprite ? (
              <SpriteBody sprite={sprite} />
            ) : (
              <g strokeLinecap="round" strokeLinejoin="round">
                {spec.body.map((s, n) => draw(s, `b${n}`, ink))}
                {spec.plates.map((s, n) => draw(s, `p${n}`, ink))}
                {spec.crown.map((s, n) => draw(s, `c${n}`, ink))}
                {spec.eyes.map((s, n) => draw(s, `e${n}`, turned ? WEAK_INK : ink))}
                {/* Weakness reads as damage, resistance as protection —
                    independent of the creature's own element. The role comes
                    off the mark itself: both are optional, so a lone mark can
                    be either and position cannot tell us which. */}
                {spec.marks.map((m, n) =>
                  draw(m.shape, `m${n}`, m.role === "weak" ? WEAK_INK : RESIST_INK),
                )}
              </g>
            )}
          </motion.g>
        </motion.g>
      </motion.g>
    </svg>
  );
}

/*
 * The backdrop echo lived here: a large faint copy of the generated silhouette
 * behind the stage text, for atmosphere the foreground sigil was too small to
 * provide. It was removed when creatures became authored sprites — the echo
 * drew from the *generated* spec, so once a sprite replaced the foreground the
 * two no longer agreed and a different creature showed through from behind.
 *
 * Reinstating it would mean deriving a large silhouette from the sprite grid
 * instead, which is possible but is a new thing rather than this one.
 */
