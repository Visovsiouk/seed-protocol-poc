"use client";

/**
 * MusicNudge — the dock's callout for when the score isn't playing.
 *
 * Two reasons it might not be, and a card for each.
 *
 * ## "offer" — music is off
 *
 * Music ships off, which solves the problem of ambushing people with
 * sound but creates a quieter one: nobody discovers it. A speaker icon
 * alone doesn't communicate "this game has a score" — it reads as a
 * mute button for sounds you're already hearing. So: a prompt anchored
 * to the dock, so the pill it's pointing at is unmistakable, offering to
 * turn music on in one click.
 *
 * The offer used to be once-and-forever, keyed on a localStorage flag
 * that was also set whenever music went on by *any* route. That made the
 * only discoverable entry point disappear permanently the first time it
 * was used — turn music on, turn it back off later, and the speaker pill
 * was the sole remaining way in, which is the icon problem all over
 * again. It's now scoped to the page load: dismiss it and it's gone
 * until you reload. Someone who wants music still sees it once, because
 * `musicEnabled` persists and the offer never shows while music is on —
 * it only returns for someone it hasn't convinced.
 *
 * ## "blocked" — music is on, but the browser won't start the clock
 *
 * `AudioProvider` asks for playback on load when music is already opted
 * in, and plenty of browsers refuse without an interaction first. That
 * leaves someone who deliberately turned music on sitting in silence,
 * which looks exactly like the setting not working — the complaint that
 * put this card here. Any click anywhere fixes it, so the card says so
 * and retires itself the moment the clock starts.
 *
 * Deliberately not a toast. Toasts stack top-right, auto-retire, and are
 * for things that just happened; these are offers attached to a specific
 * control, and they should wait as long as it takes to be noticed.
 *
 * ## Modals win
 *
 * Either card waits while a dialog is up. The dock sits *below* dialogs
 * by design (z-[35] against z-40+) so a modal covers it, which is right
 * for the pills and wrong for a callout: it ends up behind a blurred
 * scrim, where it can be neither read nor clicked. On the landing page
 * that's the permanent state until you connect — the offer was being
 * drawn, and buried, every time.
 */

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useAudio } from "@/lib/audio/AudioProvider";
import { fadeRise, withReducedMotion } from "@/lib/ui/motion";

/**
 * Delay before the offer appears. Long enough that it doesn't collide
 * with first paint or the player's first few clicks — an offer that
 * lands while someone is still orienting gets dismissed reflexively.
 */
const APPEAR_AFTER_MS = 4000;

/**
 * Grace period before admitting the browser blocked playback. Shorter,
 * because this one is answering a question the player is already asking
 * ("I turned music on, why is it quiet?"), but not zero: a browser that
 * *does* allow autoplay resolves `resume()` a moment after mount, and
 * the card shouldn't flash on its way to being right.
 */
const BLOCKED_AFTER_MS = 1800;

/**
 * Set once the offer has been answered, either way.
 *
 * Module scope rather than storage, which is what makes the dismissal
 * last exactly one page load. It also has to live outside the component:
 * `CornerDock` unmounts this on panel open, so component state would
 * forget the dismissal every time a panel was opened and closed.
 */
let answered = false;

type Mode = "none" | "offer" | "blocked";

/** Covers all five full-screen overlays in the app. */
const DIALOG_SELECTOR = '[role="dialog"], [role="alertdialog"]';

/**
 * True while any modal is mounted.
 *
 * Watched in the DOM rather than plumbed through context because the
 * dialogs share no owner — the connect wizard, the inventory drawer, the
 * extract picker and the defeat overlay each portal themselves to the
 * body independently. What they do share is the ARIA role they already
 * set, so that's the hook.
 */
function useDialogOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const check = () => {
      const found = document.querySelector(DIALOG_SELECTOR) !== null;
      // Return the same value when nothing changed: React bails out of
      // the re-render, which matters because this fires on every DOM
      // mutation anywhere in the app.
      setOpen((prev) => (prev === found ? prev : found));
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return open;
}

export function MusicNudge({ bottomClass }: { bottomClass: string }) {
  const { settings, setMusicEnabled, supported, unlocked } = useAudio();
  const reduced = useReducedMotion();
  const dialogOpen = useDialogOpen();
  const [mode, setMode] = useState<Mode>("none");

  useEffect(() => {
    if (!supported) return;

    // Hold while a modal is up, and restart the wait once it closes —
    // the player has something more pressing in front of them.
    if (dialogOpen) {
      setMode("none");
      return;
    }

    if (settings.musicEnabled) {
      // Asked for and sounding: nothing to say, and the offer has served
      // its purpose for the rest of this page load.
      if (unlocked) {
        answered = true;
        setMode("none");
        return;
      }
      const id = setTimeout(() => setMode("blocked"), BLOCKED_AFTER_MS);
      return () => clearTimeout(id);
    }

    if (answered) {
      setMode("none");
      return;
    }
    const id = setTimeout(() => setMode("offer"), APPEAR_AFTER_MS);
    return () => clearTimeout(id);
  }, [supported, dialogOpen, settings.musicEnabled, unlocked]);

  if (mode === "none") return null;

  const dismiss = () => {
    answered = true;
    setMode("none");
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
        {mode === "blocked" ? "The score is ready" : "This world has a score"}
      </span>
      {mode === "blocked" ? (
        <p className="text-xs leading-relaxed opacity-75">
          Your browser won&apos;t let sound start until you touch the page.
          One click — anywhere — and the music picks up.
        </p>
      ) : (
        <p className="text-xs leading-relaxed opacity-75">
          Each realm carries its own piece, and they hand over to each other as
          you cross between worlds. It&apos;s off until you say so.
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          // Already-on is not a no-op here: the call carries a trusted
          // gesture into `resume()`, which is the whole point of the
          // "blocked" card.
          onClick={() => setMusicEnabled(true)}
          className="rounded-md px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] transition-[filter] hover:brightness-110"
          style={{
            background: "var(--color-preset-accent)",
            color: "var(--color-preset-bg)",
          }}
        >
          {mode === "blocked" ? "Start the music" : "Play music"}
        </button>
        {mode === "offer" && (
          <button
            type="button"
            onClick={dismiss}
            className="rounded-md px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.15em] opacity-60 transition-opacity hover:opacity-100"
          >
            Not now
          </button>
        )}
      </div>
    </motion.div>
  );
}
