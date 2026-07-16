"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Full-screen defeat overlay (permadeath). Death used to be a quiet line
 * appended to the combat log under a live HUD — easy to miss. This portals
 * a dimmed, danger-tinted modal over the whole viewport so a fall is
 * unmissable: the run is over, the unbanked escrow is forfeit, and the only
 * way on is back to the base. Not dismissable by click-outside or Escape —
 * the player must acknowledge the death via the return CTA, which walks them
 * back to the hideout (where the realm is still there to re-enter, on a fresh
 * descent). Mirrors the boss-clear return so both run-end states land home.
 */
export function DefeatOverlay({
  escrowLost,
  depth,
  turn,
  onLeave,
}: {
  escrowLost: number;
  depth?: number;
  turn?: number;
  onLeave: () => void;
}) {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const leaveRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);
  // Pull focus to the return CTA so the death is announced and keyboard
  // users land on the only action.
  useEffect(() => {
    if (mounted) leaveRef.current?.focus();
  }, [mounted]);

  if (!mounted) return null;

  return createPortal(
    <motion.div
      role="alertdialog"
      aria-modal="true"
      aria-label="You have fallen"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 backdrop-blur-sm bg-[color-mix(in_oklab,var(--color-danger)_18%,#000_82%)]"
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.div
        className="w-full max-w-md rounded-xl border p-7 flex flex-col gap-4 bg-[var(--color-preset-bg)]"
        style={{
          borderColor:
            "color-mix(in oklab, var(--color-danger) 55%, transparent)",
          boxShadow:
            "0 0 0 1px color-mix(in oklab, var(--color-danger) 25%, transparent), 0 24px 80px -12px color-mix(in oklab, var(--color-danger) 45%, transparent)",
        }}
        initial={reduced ? false : { opacity: 0, scale: 0.92, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      >
        <p
          className="text-[11px] font-mono uppercase tracking-[0.4em] opacity-70"
          style={{ color: "var(--color-danger)" }}
        >
          You are bound
        </p>
        <h2
          className="text-3xl font-semibold leading-tight"
          style={{ color: "var(--color-danger)" }}
        >
          The world sets you into itself.
        </h2>
        {depth !== undefined && (
          <p className="text-xs uppercase tracking-widest opacity-70">
            Fell at depth {depth}
            {/*
              `turn` is the turn count of the FINAL fight (engine resets it
              each room), not a run total. Label it as such so a deep death
              on the first turn of a fresh fight doesn't misread as an
              instant, turn-1 run.
            */}
            {turn !== undefined && turn > 0
              ? ` · turn ${turn} of the fight there`
              : ""}
          </p>
        )}
        <p className="text-sm opacity-90 leading-relaxed">
          You reached for a name and the world bound you where you fell — one
          more aspirant set into the door to hold it against whoever comes next.
          That is what a warden is: someone who came this far and could not carry
          themselves out. No name is carved and the realm chain stays unchanged;
          your owned, equipped gear is untouched, but
          {escrowLost > 0 ? (
            <>
              {" "}the{" "}
              <strong style={{ color: "var(--color-danger)" }}>
                {escrowLost} unminted finding
                {escrowLost === 1 ? "" : "s"}
              </strong>{" "}
              you carried down go into the dark with you. Carry yourself out next
              time.
            </>
          ) : (
            <> you carried nothing down to lose. Carry yourself out next time.</>
          )}
        </p>
        <button
          ref={leaveRef}
          type="button"
          onClick={onLeave}
          className="mt-1 w-full rounded-lg px-4 py-3 text-sm font-semibold text-[var(--color-preset-bg)] transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ background: "var(--color-danger)" }}
        >
          Back to the base →
        </button>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
