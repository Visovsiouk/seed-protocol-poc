"use client";

/**
 * MusicNudge — the "there is music, want it?" callout.
 *
 * Music ships off, which solves the problem of ambushing people with
 * sound but creates a quieter one: nobody discovers it. A speaker icon
 * alone doesn't communicate "this game has a score" — it reads as a
 * mute button for sounds you're already hearing. So: a prompt anchored
 * to the dock, so the pill it's pointing at is unmistakable, offering to
 * turn music on in one click.
 *
 * This is the only thing that gets a card. There was briefly a second
 * one explaining that the browser was holding playback until the page
 * was clicked — true, and useless: by the time anyone finished reading
 * it they'd have clicked something and fixed it without knowing why.
 * A message about a condition that resolves itself is just noise.
 *
 * ## Why the offer isn't once-and-forever
 *
 * It used to be, keyed on a localStorage flag that was also set whenever
 * music went on by *any* route. That made the only discoverable entry
 * point disappear permanently the first time it was used — turn music
 * on, turn it back off later, and the speaker pill was the sole
 * remaining way in, which is the icon problem all over again.
 *
 * It's now scoped to the page load: dismiss it and it's gone until you
 * reload. Someone who wants music still sees it once, because
 * `musicEnabled` persists and the offer never shows while music is on —
 * it only returns for someone it hasn't convinced.
 *
 * Deliberately not a toast. Toasts stack top-right, auto-retire, and are
 * for things that just happened; this is an offer attached to a specific
 * control, and it should wait as long as it takes to be noticed.
 *
 * ## Modals win
 *
 * The offer waits while a dialog is up — see `lib/ui/use-dialog-open.ts`,
 * which this used to own privately and now shares with `BookNudge`.
 */

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useAudio } from "@/lib/audio/AudioProvider";
import { useDialogOpen } from "@/lib/ui/use-dialog-open";
import { fadeRise, withReducedMotion } from "@/lib/ui/motion";

/**
 * Delay before the offer appears. Long enough that it doesn't collide
 * with first paint or the player's first few clicks — an offer that
 * lands while someone is still orienting gets dismissed reflexively.
 */
const APPEAR_AFTER_MS = 4000;

/**
 * Set once the offer has been answered, either way.
 *
 * Module scope rather than storage, which is what makes the dismissal
 * last exactly one page load. It also has to live outside the component:
 * `CornerDock` unmounts this on panel open, so component state would
 * forget the dismissal every time a panel was opened and closed.
 */
let answered = false;

export function MusicNudge({ bottomClass }: { bottomClass: string }) {
  const { settings, setMusicEnabled, supported } = useAudio();
  const reduced = useReducedMotion();
  const dialogOpen = useDialogOpen();
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Music on by any route (including the panel itself) retires the
    // offer — it has served its purpose for this page load.
    if (settings.musicEnabled) answered = true;

    // Hold while a modal is up, and restart the wait once it closes —
    // the player has something more pressing in front of them.
    if (!supported || dialogOpen || answered) {
      setShow(false);
      return;
    }
    const id = setTimeout(() => setShow(true), APPEAR_AFTER_MS);
    return () => clearTimeout(id);
  }, [supported, dialogOpen, settings.musicEnabled]);

  if (!show) return null;

  const dismiss = () => {
    answered = true;
    setShow(false);
  };

  return (
    <motion.div
      variants={withReducedMotion(fadeRise, reduced)}
      initial="hidden"
      animate="visible"
      role="status"
      className={`fixed right-4 ${bottomClass} z-[35] flex w-[min(17rem,calc(100vw-2rem))] flex-col gap-2 rounded-xl border border-[var(--border-2)] bg-[var(--color-preset-bg)] p-4 shadow-[0_16px_48px_-12px_var(--glow)]`}
    >
      <span
        className="font-mono text-[11px] uppercase tracking-[0.2em]"
        style={{ color: "var(--color-preset-accent)" }}
      >
        This world has a score
      </span>
      <p className="text-xs leading-relaxed opacity-75">
        Each realm carries its own piece, and they hand over to each other as
        you cross between worlds. It&apos;s off until you say so.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMusicEnabled(true)}
          className="rounded-md px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] transition-[filter] hover:brightness-110"
          style={{
            background: "var(--color-preset-accent)",
            color: "var(--color-preset-bg)",
          }}
        >
          Play music
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-md px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.15em] opacity-60 transition-opacity hover:opacity-100"
        >
          Not now
        </button>
      </div>
    </motion.div>
  );
}
