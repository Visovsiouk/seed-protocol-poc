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
import type { BeatVoice, BeatWash, CinematicBeat } from "@/lib/story/types";
import { MarginLine } from "@/components/story/voices";
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
  /**
   * True while a `gate: "interaction"` beat is still waiting on the player's
   * act. `advance` is inert and Enter is disarmed until `satisfyGate` runs, so
   * a frame should render the act's affordance instead of the CTA.
   */
  gated: boolean;
  /**
   * Record that the gated act was performed. Idempotent, and a no-op on an
   * ungated beat. Does not advance — the player still chooses to move on,
   * which keeps the act and the page turn as two separate decisions.
   */
  satisfyGate: () => void;
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

  // Interaction gate. Re-armed per beat exactly like `advancingRef`, so a
  // satisfied gate on one beat can't carry into the next.
  const [gateMet, setGateMet] = useState(false);
  useEffect(() => {
    setGateMet(false);
  }, [index]);

  const gated = beat.gate === "interaction" && !gateMet;

  const satisfyGate = useCallback(() => setGateMet(true), []);

  const advance = useCallback(() => {
    // Checked ahead of the idempotency latch so a blocked call doesn't burn
    // it — the player must still be able to advance once the gate is met.
    if (gated) return;
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
  }, [beat, gated, isLast, reduced, onComplete]);

  // Keep a live ref so the dwell timer always calls the current `advance`.
  const advanceRef = useRef(advance);
  advanceRef.current = advance;

  // Enter fires the forward action. Re-keyed per beat so a held Enter that
  // advanced the previous beat must be released before it can fire again.
  //
  // `enabled` is the hook's own parameter and only controls listener
  // *registration* — the `useActivationArmed(sig)` state machine underneath
  // is untouched, so the held-Enter disarm still applies across the gate
  // opening and closing. That's why this is the safe way to suspend Enter
  // rather than swapping the callback for a no-op.
  useEnterToActivate({
    onActivate: advance,
    enabled: !gated,
    sig: `${sigPrefix}:${index}`,
  });

  // Auto-advance dwell. Never starts while an activation key is held; under
  // reduced motion it's disabled entirely (CTA remains the manual path).
  useEffect(() => {
    if (reduced) return;
    // A gated beat must never advance itself — the whole point is that the
    // player performs the act. The effect re-runs when the gate opens.
    if (gated) return;
    const dwellMs = beat.timing?.dwellMs;
    if (!dwellMs) return;

    let cancelled = false;
    let dwellTimer: number | undefined;
    let releaseOff: (() => void) | undefined;

    // Approximate when the staggered lines finish revealing, so the dwell is
    // measured from the moment the page is fully readable rather than from
    // mount. The 500 matches `lineStagger`'s `staggerChildren`.
    const revealMs = beat.timing?.lineStagger ? beat.body.length * 500 + 700 : 700;

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
  }, [index, reduced, gated, beat]);

  const staggered = !reduced && !!beat.timing?.lineStagger;
  const voice = beat.voice ?? "book";

  const body = (
    <motion.div
      key={index}
      className="flex flex-col gap-3"
      variants={staggered ? lineStagger : undefined}
      initial={staggered ? "hidden" : false}
      animate={staggered ? "visible" : false}
    >
      {beat.body.map((line, i) => {
        const held = !reduced && beat.timing?.hold?.line === i;

        return (
          <motion.div key={i} variants={staggered ? lineReveal : undefined}>
            <motion.div
              variants={held ? holdPulse : undefined}
              initial={held ? "rest" : false}
              animate={held ? "pulse" : false}
            >
              <VoiceLine voice={voice}>{line}</VoiceLine>
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
        gated,
        satisfyGate,
      })}

      <FadeToBlack active={fading} reduced={!!reduced} />
    </div>
  );
}

/**
 * One body line, in the beat's voice.
 *
 * The Book keeps the kit's `Body` (mono italic, hanging em-dash) — that tic
 * is its signature, and it's exactly why the margin voice can't share the
 * component. See `components/story/voices.tsx`.
 */
function VoiceLine({ voice, children }: { voice: BeatVoice; children: ReactNode }) {
  if (voice === "margin") return <MarginLine>{children}</MarginLine>;
  return <Body>{children}</Body>;
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
