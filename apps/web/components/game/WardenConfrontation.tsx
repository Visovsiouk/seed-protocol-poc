"use client";

/**
 * `<WardenConfrontation/>` — the brief felt beat when you come face to face
 * with a kept reader. It fires at two moments in a boss fight:
 *
 *   - **boss-start** — the warden's name rises at display scale and a held
 *     kept-reader line (who they were before the realm wore them, from
 *     `lib/story/wardens.ts`) breathes under it. The caller simultaneously
 *     pulses the stage's `ghostReveal` so the face suggestion blooms behind
 *     the name. This is the dramatic-irony beat: you are looking at what you
 *     become if you fall, and you don't yet feel it.
 *   - **phase2** — the warden turns. We REUSE `<BossPhaseBanner/>` for the
 *     "Phase 2" flourish rather than duplicating it, and hold the warden's
 *     `turn` line beneath — the reader surfacing through the ruin for a breath.
 *
 * It lives in the existing focal-slot overlay band: absolutely positioned,
 * `pointer-events-none`, so combat input underneath stays fully live (no new
 * document keydown, no focus trap). It owns only an auto-retire timer that
 * calls `onDone` to clear the parent's confrontation state.
 *
 * Reduced motion: the name and line appear instantly, the breathing hold is
 * disabled, and the stage ghost is suppressed by the caller — the beat still
 * reads, it just doesn't move.
 */

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { wardenLore } from "@/lib/story/wardens";
import { holdPulse, lineReveal, withReducedMotion } from "@/lib/ui/motion";
import { BossPhaseBanner } from "./BossPhaseBanner";

export type ConfrontationMoment = "boss-start" | "phase2";

/**
 * How long each beat dwells before it retires itself. Boss-start lingers a
 * touch longer (name + who-they-were has more to read); the phase turn is a
 * sharper spike. Both are short enough that a mashing player isn't held back —
 * the overlay never blocks input, it only floats over the live stage.
 */
const DWELL_MS: Record<ConfrontationMoment, number> = {
  "boss-start": 5200,
  phase2: 4600,
};

export function WardenConfrontation({
  moment,
  name,
  bossId,
  onDone,
}: {
  moment: ConfrontationMoment;
  /** Display name of the warden (the live monster name). */
  name: string;
  /** Boss id for the kept-reader lore lookup (falls back to a generic beat). */
  bossId: string;
  /** Clear the parent's confrontation state once the beat has had its dwell. */
  onDone: () => void;
}) {
  const reduced = useReducedMotion();
  const lore = wardenLore(bossId);
  const line = moment === "boss-start" ? lore.intro : lore.turn;

  // Auto-retire after the dwell. Keyed on moment+name so a phase turn that
  // lands while a boss-start beat is still up restarts the timer for the new
  // beat instead of inheriting the old one's remaining time.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  useEffect(() => {
    const t = window.setTimeout(() => onDoneRef.current(), DWELL_MS[moment]);
    return () => window.clearTimeout(t);
  }, [moment, name]);

  return (
    <div className="flex w-full max-w-xl flex-col items-center gap-3 text-center">
      {moment === "phase2" ? (
        // The flourish is the existing banner — don't duplicate it.
        <BossPhaseBanner show bossName={name} />
      ) : (
        <motion.h2
          className="font-[family-name:var(--font-display)] text-3xl font-bold leading-none drop-shadow-[0_2px_14px_rgba(0,0,0,0.75)] sm:text-4xl"
          variants={withReducedMotion(lineReveal, reduced)}
          initial="hidden"
          animate="visible"
        >
          {name}
        </motion.h2>
      )}

      <motion.p
        className="max-w-prose text-sm italic leading-relaxed text-[var(--color-preset-fg)] opacity-90 drop-shadow-[0_1px_10px_rgba(0,0,0,0.75)]"
        // Keyframe-array variant → guard with !reduced (withReducedMotion only
        // flattens scalar opacity, not the breathing array).
        variants={reduced ? undefined : holdPulse}
        initial={reduced ? false : "rest"}
        animate={reduced ? false : "pulse"}
      >
        {line}
      </motion.p>
    </div>
  );
}
