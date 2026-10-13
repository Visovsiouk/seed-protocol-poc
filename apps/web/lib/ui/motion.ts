/**
 * Shared motion vocabulary.
 *
 * framer-motion presets for the orchestrated sequences. Durations/easing
 * mirror the CSS motion tokens in globals.css so JS and CSS motion stay in
 * lockstep. Motion is reserved for the three teaching beats — value-flow,
 * realm-warp, extraction/bank — plus the ledger-entry stagger; everything
 * else stays calm.
 *
 * Reduced motion: consumers call framer-motion's `useReducedMotion()` and
 * pass the result to `withReducedMotion(variants, reduced)`, which collapses
 * any preset to an instant cross-fade. The CSS ambient layer is disabled
 * independently via the `prefers-reduced-motion` block in globals.css.
 */

import type { Transition, Variants } from "framer-motion";

// Durations in seconds (CSS tokens are in ms): --dur-fast/--dur/--dur-slow.
export const DUR = { fast: 0.14, base: 0.24, slow: 0.52 } as const;

// Matches --ease-out: cubic-bezier(0.22, 1, 0.36, 1).
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export const transition: Transition = { duration: DUR.base, ease: EASE_OUT };
export const transitionSlow: Transition = { duration: DUR.slow, ease: EASE_OUT };

/** Ledger entries / panels rising into place — the default reveal. */
export const fadeRise: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition },
};

/** Stagger container for a column of ledger entries (spawn feed, activity). */
export const ledgerStagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

/** Realm-warp cross-fade — source preset dissolves into target (claim 3). */
export const warpCrossfade: Variants = {
  enter: { opacity: 0, scale: 1.02 },
  center: { opacity: 1, scale: 1, transition: transitionSlow },
  exit: { opacity: 0, scale: 0.98, transition },
};

/** Escrow item flying into the wallet on bank; inverse plays on death. */
export const escrowFly: Variants = {
  rest: { opacity: 1, x: 0, y: 0, scale: 1 },
  bank: { opacity: 0, x: 24, y: -16, scale: 0.85, transition },
  lost: { opacity: 0, scale: 0.9, filter: "blur(4px)", transition: transitionSlow },
};

// ── Cinematic vocabulary (story beats) ────────────────────────────────────
// Used by `CinematicBeatPlayer` and the warden/loot reveals. Scalar-opacity
// variants flatten correctly through `withReducedMotion`; the keyframe-array
// ones (holdPulse/faceGhost/lootGlow/impactStrike) do NOT — guard those with an explicit
// `!reduced` check on the `animate` prop, the way EncounterStage/AssetCard do.

/** Per-line dramatic rise — a body line lifting into place. Lives inside a
 *  `lineStagger` container so a beat reveals one line at a time. */
export const lineReveal: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: transitionSlow },
};

/** Slow stagger container for the dramatic per-line reveal (~0.5s apart). */
export const lineStagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.5, delayChildren: 0.12 } },
};

/** A black layer blooming over the frame for a scene cut, then clearing. */
export const fadeToBlack: Variants = {
  clear: { opacity: 0 },
  black: { opacity: 1, transition: transitionSlow },
};

/** Cross-fade a stacked backdrop wash layer in. Opacity only — never
 *  interpolate `background` strings (Framer can't tween gradient stops). */
export const washShift: Variants = {
  out: { opacity: 0 },
  in: { opacity: 1, transition: transitionSlow },
};

/** Slow breathing emphasis on a held line. Keyframe array — `!reduced` only. */
export const holdPulse: Variants = {
  rest: { opacity: 1 },
  pulse: {
    opacity: [1, 0.7, 1],
    transition: { duration: 2.4, ease: "easeInOut", repeat: Infinity },
  },
};

/** Momentary kept-reader face bloom — swells, then settles to a faint trace.
 *  Keyframe array — `!reduced` only. */
export const faceGhost: Variants = {
  hidden: { opacity: 0 },
  bloom: {
    opacity: [0, 0.16, 0.05],
    transition: { duration: 2.8, ease: "easeOut", times: [0, 0.4, 1] },
  },
};

/**
 * One-shot impact mark: snaps in, blooms outward, and clears itself.
 *
 * It ends at `opacity: 0` on purpose, so the caller needs no removal timer and
 * no `AnimatePresence` — re-keying the element on a hit counter replays the
 * whole thing. Keyframe array, so `!reduced` only; there is no resting state
 * to fall back to, which is why reduced-motion callers skip the mark entirely
 * rather than flattening it to a static one that would never leave.
 */
export const impactStrike: Variants = {
  struck: {
    opacity: [0, 1, 0.85, 0],
    scale: [0.82, 1.04, 1.1, 1.16],
    transition: { duration: 0.42, ease: "easeOut", times: [0, 0.15, 0.4, 1] },
  },
};

/** Dramatic high-tier loot card entrance — rises and settles. Pair with a
 *  caller-owned one-shot glow keyframe (guarded by `!reduced`). */
export const lootReveal: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: transitionSlow },
};

/**
 * Collapse any preset to an instant fade when the user prefers reduced
 * motion. Pass the boolean from framer-motion's `useReducedMotion()`.
 */
export function withReducedMotion(variants: Variants, reduced: boolean | null): Variants {
  if (!reduced) return variants;
  const flat: Variants = {};
  for (const key of Object.keys(variants)) {
    const state = variants[key];
    const opacity =
      state && typeof state === "object" && "opacity" in state ? state.opacity : 1;
    flat[key] = { opacity, transition: { duration: 0 } };
  }
  return flat;
}
