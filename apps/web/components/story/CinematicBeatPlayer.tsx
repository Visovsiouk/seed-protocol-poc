"use client";

/**
 * `<CinematicBeatPlayer/>` — the shared, gate-correct engine that turns a
 * sequence of `CinematicBeat`s into a *felt* reveal: per-line dramatic
 * stagger, a held emphasis line, an auto-advancing dwell, a fade-to-black
 * cut between beats, and a per-beat backdrop wash. The layout/chrome of each
 * frame is supplied by the caller via `renderFrame`, so the same engine
 * drives the parchment cold-open Book today and any future cinematic surface.
 *
 * Activation-gate correctness is the load-bearing part (see
 * `lib/ui/activation-gate.ts`): the forward action routes through
 * `useEnterToActivate` with a per-beat `sig`, `advance` is idempotent per
 * index (a held Enter or a double-fire can't blow through two beats), and the
 * auto-advance dwell never *starts* while an activation key is physically held
 * — the exact held-Enter cascade the gate exists to stop.
 *
 * Reduced motion: every line appears at once, the dwell auto-advance is
 * disabled, fade-to-black is skipped, and the CTA is always present as the
 * manual forward path.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Body } from "@/components/ui";
import type { BeatWash, CinematicBeat } from "@/lib/story/types";
import {
  DUR,
  fadeToBlack,
  holdPulse,
  lineReveal,
  lineStagger,
  washShift,
  withReducedMotion,
} from "@/lib/ui/motion";
import {
  isActivationKeyHeld,
  onActivationRelease,
} from "@/lib/ui/activation-gate";
import { useEnterToActivate } from "@/lib/ui/useEnterToActivate";

/** Backdrop tint per wash kind. Mixed against preset tokens so it themes. */
const WASH_TINT: Record<BeatWash, string> = {
  accent: "var(--color-preset-accent)",
  danger: "var(--color-danger)",
  void: "color-mix(in oklab, var(--color-preset-fg) 38%, #060814)",
  warm: "color-mix(in oklab, #ffb27a 62%, var(--color-preset-accent))",
};

export type RenderFrameArgs = {
  beat: CinematicBeat;
  index: number;
  total: number;
  isLast: boolean;
  /** The animated body block (staggered lines + footnote). Drop into layout. */
  children: ReactNode;
  /** The single forward action — wire to the CTA button's onClick. */
  advance: () => void;
};

export function CinematicBeatPlayer({
  beats,
  onComplete,
  renderFrame,
  sigPrefix = "beat",
}: {
  beats: readonly CinematicBeat[];
  /** Fired when the player advances past the final beat. */
  onComplete: () => void;
  renderFrame: (args: RenderFrameArgs) => ReactNode;
  /** Namespacing for the per-beat activation `sig` (avoids cross-surface collisions). */
  sigPrefix?: string;
}) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);

  const beat = beats[index]!;
  const isLast = index === beats.length - 1;

  // `advance` is idempotent per index: once a transition off `index` is in
  // flight, further calls are no-ops until the next beat mounts. This makes a
  // held Enter or a dwell/CTA double-fire safe.
  const advancingRef = useRef(false);
  useEffect(() => {
    // New beat mounted — re-arm.
    advancingRef.current = false;
  }, [index]);

  const advance = useCallback(() => {
    if (advancingRef.current) return;
    advancingRef.current = true;

    const go = () => {
      if (isLast) onComplete();
      else setIndex((i) => i + 1);
    };

    if (!reduced && beat.timing?.fadeOutToBlack) {
      setFading(true);
      window.setTimeout(() => {
        setFading(false);
        go();
      }, DUR.slow * 1000);
    } else {
      go();
    }
  }, [beat, isLast, reduced, onComplete]);

  // Keep a live ref so the dwell timer always calls the current `advance`.
  const advanceRef = useRef(advance);
  advanceRef.current = advance;

  // Enter fires the forward action. Re-keyed per beat so a held Enter that
  // advanced the previous beat must be released before it can fire again.
  useEnterToActivate({ onActivate: advance, sig: `${sigPrefix}:${index}` });

  // Auto-advance dwell. Never starts while an activation key is held; under
  // reduced motion it's disabled entirely (CTA remains the manual path).
  useEffect(() => {
    if (reduced) return;
    const dwellMs = beat.timing?.dwellMs;
    if (!dwellMs) return;

    let cancelled = false;
    let dwellTimer: number | undefined;
    let releaseOff: (() => void) | undefined;

    // Approximate when the staggered lines finish revealing, so the dwell is
    // measured from the moment the page is fully readable.
    const revealMs = beat.timing?.lineStagger
      ? beat.body.length * 500 + 700
      : 700;

    const armDwell = () => {
      if (cancelled) return;
      if (isActivationKeyHeld()) {
        // A key is down (likely held in from the prior screen). Wait for the
        // release before arming, so the dwell can't compound a held Enter.
        releaseOff = onActivationRelease(() => {
          releaseOff?.();
          releaseOff = undefined;
          armDwell();
        });
        return;
      }
      dwellTimer = window.setTimeout(() => advanceRef.current(), dwellMs);
    };

    const startTimer = window.setTimeout(armDwell, revealMs);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      if (dwellTimer) window.clearTimeout(dwellTimer);
      releaseOff?.();
    };
  }, [index, reduced, beat]);

  const body = (
    <motion.div
      key={index}
      className="flex flex-col gap-3"
      variants={
        reduced || !beat.timing?.lineStagger
          ? undefined
          : lineStagger
      }
      initial={reduced || !beat.timing?.lineStagger ? false : "hidden"}
      animate={reduced || !beat.timing?.lineStagger ? false : "visible"}
    >
      {beat.body.map((line, i) => {
        const held = !reduced && beat.timing?.hold?.line === i;
        return (
          <motion.div
            key={i}
            variants={
              reduced || !beat.timing?.lineStagger ? undefined : lineReveal
            }
          >
            <motion.div
              variants={held ? holdPulse : undefined}
              initial={held ? "rest" : false}
              animate={held ? "pulse" : false}
            >
              <Body>{line}</Body>
            </motion.div>
          </motion.div>
        );
      })}
    </motion.div>
  );

  return (
    <div className="relative isolate">
      <AnimatePresence>
        {beat.wash && (
          <motion.div
            key={`wash:${index}:${beat.wash}`}
            aria-hidden
            className="pointer-events-none absolute -inset-x-12 -inset-y-10 -z-10"
            style={{
              background: `radial-gradient(58% 52% at 50% 42%, ${
                WASH_TINT[beat.wash]
              }, transparent 72%)`,
              opacity: 0.2,
            }}
            variants={withReducedMotion(washShift, reduced)}
            initial="out"
            animate="in"
            exit="out"
          />
        )}
      </AnimatePresence>

      {renderFrame({
        beat,
        index,
        total: beats.length,
        isLast,
        children: body,
        advance,
      })}

      <FadeToBlack active={fading} reduced={!!reduced} />
    </div>
  );
}

/** Full-viewport black cut, portaled so it covers the frame and chrome. */
function FadeToBlack({ active, reduced }: { active: boolean; reduced: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || reduced) return null;

  return createPortal(
    <AnimatePresence>
      {active && (
        <motion.div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[80] bg-black"
          variants={fadeToBlack}
          initial="clear"
          animate="black"
          exit="clear"
        />
      )}
    </AnimatePresence>,
    document.body,
  );
}
