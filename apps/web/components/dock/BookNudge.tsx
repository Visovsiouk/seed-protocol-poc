"use client";

/**
 * BookNudge — "you are carrying the book" said once, out loud.
 *
 * The cold open is about opening a book, falling into it, and signing a card
 * in your own hand. Then the player wakes on the Base and the book becomes a
 * 14-pixel glyph in the bottom-right corner, next to the speaker. `CornerDock`
 * argued no first-time affordance was needed because "the player already knows
 * they have it" — which was a reasonable-sounding guess and wrong: someone
 * cleared a whole page without knowing the Book existed.
 *
 * Deliberately the same shape as `MusicNudge`, down to the dock anchor and the
 * two-button answer, because that pattern is already proven in this app: a
 * callout attached to the control it is pointing at, which waits as long as it
 * takes to be noticed instead of auto-retiring like a toast.
 *
 * ## Why this one *is* once-and-forever
 *
 * `MusicNudge`'s dismissal lasts a single page load, on purpose: its pill is a
 * poor entry point, so permanently hiding the only discoverable way in would
 * recreate the problem it exists to solve. The Book is the opposite case — it
 * now has two good entry points (the pill, and the card on the Base), so a
 * second telling would be nagging. The flag is in storage and the offer never
 * returns.
 *
 * The flag is also *not* the cold-open flag. Walking the opening and being
 * told where the book went are different facts, and conflating them would mean
 * every player already past the opening — which is exactly the player who
 * reported not knowing — silently never gets told.
 */

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { emitDockOpen } from "@/lib/ui/dock-bus";
import { useDialogOpen } from "@/lib/ui/use-dialog-open";
import { fadeRise, withReducedMotion } from "@/lib/ui/motion";

const STORAGE_KEY = "seed-protocol-poc:book-handed.v1";

/**
 * Shorter than the music offer's 4s. That one is an unrelated aside and should
 * wait for the player to settle; this is the end of the beat they just walked,
 * and it lands while the fall is still the thing on their mind.
 */
const APPEAR_AFTER_MS = 1800;

/**
 * True once the player has been shown where the book went.
 *
 * Safe during SSR (returns true, so nothing is scheduled), and treats a
 * throwing `localStorage` as "already told" rather than nudging on every load
 * in private mode — an un-dismissable callout is worse than a missed one.
 */
export function hasBeenHandedBook(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

function markHandedBook(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Private mode — the module flag below still retires it for this load.
  }
}

/**
 * Module scope, like `MusicNudge`'s: `CornerDock` unmounts this whenever a
 * panel opens, so component state would forget the dismissal. Belt and braces
 * next to the storage flag, and the only defence when storage throws.
 */
let answered = false;

export function BookNudge({
  bottomClass,
  onAnswered,
}: {
  bottomClass: string;
  /**
   * Fired when the offer retires, either way. The dock shares one slot between
   * this and `MusicNudge`, so it needs to know when the slot is free.
   */
  onAnswered: () => void;
}) {
  const reduced = useReducedMotion();
  const dialogOpen = useDialogOpen();
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Hold while a modal is up and restart the wait once it closes — the
    // player has something more pressing in front of them.
    if (dialogOpen || answered) {
      setShow(false);
      return;
    }
    const id = setTimeout(() => setShow(true), APPEAR_AFTER_MS);
    return () => clearTimeout(id);
  }, [dialogOpen]);

  if (!show) return null;

  const retire = () => {
    answered = true;
    markHandedBook();
    setShow(false);
    onAnswered();
  };

  return (
    <motion.div
      variants={withReducedMotion(fadeRise, reduced)}
      initial="hidden"
      animate="visible"
      role="status"
      className={`fixed right-4 ${bottomClass} z-[35] flex w-[min(18rem,calc(100vw-2rem))] flex-col gap-2 rounded-xl border border-[var(--border-2)] bg-[var(--color-preset-bg)] p-4 shadow-[0_16px_48px_-12px_var(--glow)]`}
    >
      <span
        className="font-mono text-[11px] uppercase tracking-[0.2em]"
        style={{ color: "var(--color-preset-accent)" }}
      >
        You came back up with it
      </span>
      <p className="text-xs leading-relaxed opacity-75">
        The book is in your hands, and the card is still in its back pocket.
        It&apos;s down here whenever you want it — the stamps you earn, the
        notes other borrowers left, and what each page has become.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            // Open it *and* retire the offer: the player has now seen both
            // the book and the pill it came out of.
            emitDockOpen("book");
            retire();
          }}
          className="rounded-md px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] transition-[filter] hover:brightness-110"
          style={{
            background: "var(--color-preset-accent)",
            color: "var(--color-preset-bg)",
          }}
        >
          Open the book
        </button>
        <button
          type="button"
          onClick={retire}
          className="rounded-md px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.15em] opacity-60 transition-opacity hover:opacity-100"
        >
          Later
        </button>
      </div>
    </motion.div>
  );
}
