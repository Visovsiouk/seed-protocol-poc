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
