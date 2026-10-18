"use client";

/**
 * MusicNudge — the one-time "there is music, want it?" callout.
 *
 * Music ships off, which solves the problem of ambushing people with
 * sound but creates a quieter one: nobody discovers it. A speaker icon
 * alone doesn't communicate "this game has a score" — it reads as a
 * mute button for sounds you're already hearing.
 *
 * So: a single prompt, anchored to the dock so the pill it's pointing at
 * is unmistakable, offering to turn music on in one click. Dismissed (or
 * accepted) once and never shown again.
 *
 * Deliberately not a toast. Toasts stack top-right, auto-retire, and are
 * for things that just happened; this is an offer attached to a specific
 * control, and it should wait as long as it takes to be noticed.
 */

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useAudio } from "@/lib/audio/AudioProvider";
import { fadeRise, withReducedMotion } from "@/lib/ui/motion";

const STORAGE_KEY = "seed-protocol-poc:audio-nudge";

/**
 * Delay before the offer appears. Long enough that it doesn't collide
 * with first paint or the player's first few clicks — an offer that
 * lands while someone is still orienting gets dismissed reflexively.
 */
const APPEAR_AFTER_MS = 6000;

function alreadySeen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Storage disabled — worst case the offer returns next visit.
  }
}

export function MusicNudge({ bottomClass }: { bottomClass: string }) {
  const { settings, setMusicEnabled, supported } = useAudio();
  const reduced = useReducedMotion();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!supported || settings.musicEnabled || alreadySeen()) return;
    const id = setTimeout(() => setShow(true), APPEAR_AFTER_MS);
    return () => clearTimeout(id);
  }, [supported, settings.musicEnabled]);

  // Turning music on by any route (including the panel itself) retires
  // the offer — it has served its purpose.
  useEffect(() => {
    if (settings.musicEnabled) {
      markSeen();
      setShow(false);
    }
  }, [settings.musicEnabled]);

  if (!show) return null;

  const dismiss = () => {
    markSeen();
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
