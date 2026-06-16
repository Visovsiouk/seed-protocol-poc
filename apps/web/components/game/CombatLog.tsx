"use client";

/**
 * Combat ticker — the rolling blow-by-blow feed.
 *
 * Used to be a 256px parchment box that sat mostly empty; now it's a slim
 * band that shows only the most recent beats, newest at the bottom, older
 * lines fading out above. Damage reads rose, heals green, drama gold — the
 * emphasis the engine already tags on each line.
 *
 * Trial/room setup no longer lives here (it moved onto `<EncounterStage/>`),
 * so this is purely the action feed: what just happened, in the player's
 * own monospace field-record voice.
 */

import type { NarrationLine } from "@/lib/engine/types";
import { motion } from "framer-motion";

const VISIBLE = 3;

const EMPHASIS_STYLES: Record<NonNullable<NarrationLine["emphasis"]>, string> = {
  info: "opacity-80",
  damage: "text-[var(--color-danger)]",
  heal: "text-[var(--color-ok)]",
  drama: "text-[var(--color-warn)] font-medium",
};

export function CombatLog({ lines }: { lines: readonly NarrationLine[] }) {
  // Stable identity per line so React keeps existing rows mounted (they hold
  // their place) and only the newest row enters — keeps the band from
  // re-animating wholesale on every step.
  const tail = lines.slice(-VISIBLE).map((line, i) => ({
    line,
    key: lines.length - Math.min(lines.length, VISIBLE) + i,
  }));

  // Fixed-height, bottom-anchored band: the box never grows or shrinks as
  // lines come and go (overflow clips the oldest), so the layout below it
  // stays rock-steady. Newest sits at the bottom; older rows quiet down.
  return (
    <div
      aria-live="polite"
      aria-label="Combat log"
      className="flex h-[4.5rem] flex-col justify-end gap-0.5 overflow-hidden px-1 font-[family-name:var(--font-mono)] text-sm leading-relaxed"
    >
      {tail.length === 0 ? (
        <p className="opacity-70">The room is silent. Your move.</p>
      ) : (
        tail.map(({ line, key }, i) => {
          // Older lines (higher up) sit quieter so the eye lands on the newest.
          const depth = tail.length - 1 - i;
          const fade = depth === 0 ? 1 : depth === 1 ? 0.65 : 0.4;
          const isNewest = depth === 0;
          return (
            <motion.p
              key={key}
              initial={isNewest ? { opacity: 0 } : false}
              animate={{ opacity: fade }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className={line.emphasis ? EMPHASIS_STYLES[line.emphasis] : undefined}
              style={line.emphasis ? undefined : { opacity: fade }}
            >
              {line.text}
            </motion.p>
          );
        })
      )}
    </div>
  );
}
