"use client";

/**
 * CornerDock — the player's floating bottom-right chrome.
 *
 * Owns two pills side-by-side (Inventory + Codex) and a single popover slot.
 * Co-locating them keeps the pills packed together with no fragile pixel
 * offsets, and a single `open` state makes the two panels mutually exclusive
 * (opening one closes the other) so their popovers never overlap.
 *
 * Mounted ONCE in app/providers.tsx so the dock — and the codex completion
 * toasts (`useCodexToasts`) it keeps running regardless of what's open —
 * travel with the player across every route.
 *
 * Portal + z-[35]: above the sticky header (z-30), below drawers/dialogs/
 * overlays (z-40+) so modals correctly cover it. The toast stack (z-[90])
 * stays top-right; this stays bottom-right — they never collide.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useAccount } from "wagmi";
import { CodexPanel } from "@/components/codex/CodexPanel";
import { InventoryPanel } from "@/components/inventory/InventoryPanel";
import { BookPanel } from "@/components/story/BookPanel";
import { hasConsumedColdOpen } from "@/components/story/ColdOpenBook";
import { AudioPanel } from "./AudioPanel";
import { MusicNudge } from "./MusicNudge";
import { useCodexStatus } from "@/lib/codex/use-codex";
import { useCodexToasts } from "@/lib/codex/use-codex-toasts";
import { useAudio } from "@/lib/audio/AudioProvider";
import { useTutorialProgress } from "@/lib/reads/hooks";
import { useFoundMargins } from "@/lib/story/use-margins";
import { fadeRise, withReducedMotion } from "@/lib/ui/motion";

// Lift the dock clear of the AppShell footer (49px), and of the fixed
// demo-banner strip too when it's enabled — the banner adds 24px of footer
// padding on top of that. (NEXT_PUBLIC_* is inlined at build time, so this
// is a static branch.)
const DEMO_BANNER = process.env.NEXT_PUBLIC_DEMO_BANNER === "true";
const BUTTON_BOTTOM = DEMO_BANNER ? "bottom-[5.5rem]" : "bottom-16";
const PANEL_BOTTOM = DEMO_BANNER ? "bottom-[8.5rem]" : "bottom-28";

type Panel = "codex" | "inventory" | "audio" | "book";

const PANEL_LABEL: Record<Panel, string> = {
  codex: "Protocol codex",
  inventory: "Inventory",
  audio: "Sound settings",
  book: "The Book",
};

/** See the `onUpdate` on the panel below — its presence is the point. */
const noop = () => {};

/** Shared pill styling — a rounded, glowing tab keyed to the preset accent. */
const PILL_CLASS =
  "flex items-center gap-2 rounded-full border border-[var(--border-2)] bg-[var(--color-preset-bg)] px-4 py-2 font-mono text-xs uppercase tracking-widest shadow-[0_0_16px_-6px_var(--glow)] transition-opacity hover:opacity-100";

function Diamond() {
  return (
    <span
      aria-hidden
      style={{
        width: 8,
        height: 8,
        transform: "rotate(45deg)",
        background: "var(--color-preset-accent)",
        boxShadow: "0 0 8px var(--color-preset-accent)",
      }}
    />
  );
}

/**
 * Speaker glyph, with a slash when muted. Hand-rolled to match
 * `Diamond` above — the dock draws its own marks rather than pulling an
 * icon set in for two shapes.
 */
function Speaker({ muted }: { muted: boolean }) {
  return (
    <svg
      aria-hidden
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="var(--color-preset-accent)"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 5.2h1.8L7.4 3v8L4.8 8.8H3z" fill="var(--color-preset-accent)" />
      {muted ? (
        <path d="M9.6 5.2l3 3.6M12.6 5.2l-3 3.6" />
      ) : (
        <>
          <path d="M9.6 5.1a2.6 2.6 0 0 1 0 3.8" />
          <path d="M11.3 3.6a5 5 0 0 1 0 6.8" />
        </>
      )}
    </svg>
  );
}

/**
 * A closed book, seen spine-on. Hand-rolled to match `Diamond` and `Speaker`
 * — the dock draws its own marks rather than pulling in an icon set.
 */
function BookGlyph() {
  return (
    <svg
      aria-hidden
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="var(--color-preset-accent)"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.6 2.2h5.2a2 2 0 0 1 2 2v7.6H4.6a2 2 0 0 1-2-2z" />
      <path d="M2.6 9.4h7.2" />
      {/* The ribbon: a bookmark, which is what he leaves behind. */}
      <path d="M11.4 2.6v6.2l-1.2-1-1.2 1V2.6z" fill="var(--color-preset-accent)" />
    </svg>
  );
}

export function CornerDock() {
  const { address } = useAccount();
  const { settings, supported } = useAudio();
  const { status, isLoading } = useCodexStatus(address);
  useCodexToasts(address, status, isLoading);
  // Same React Query key `useCodexStatus` already warms, so this is a cache
  // read rather than a second fan-out.
  const { data: progress } = useTutorialProgress(address);

  const [open, setOpen] = useState<Panel | null>(null);
  const reduced = useReducedMotion();

  // Portal target only exists client-side; gate the first render.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // The Book exists for the player only once they've been handed it — i.e.
  // once they've walked the opening (or are already past it on a returning
  // visit). Reading localStorage is safe here because the whole dock returns
  // `null` until `mounted`, so this never runs during SSR.
  const signed = mounted && (hasConsumedColdOpen() || (progress?.starterClears ?? 0) > 0);
  const margins = useFoundMargins(address, open === "book");

  // Escape closes whichever panel is open (popovers, not modals — no focus trap).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!mounted) return null;

  const toggle = (panel: Panel) =>
    setOpen((cur) => (cur === panel ? null : panel));

  return createPortal(
    <>
      {open && (
        // Invisible click-catcher: any click outside the popover closes it.
        <div
          aria-hidden
          className="fixed inset-0 z-[34]"
          onClick={() => setOpen(null)}
        />
      )}
      {/* The one-time offer to turn music on. Shares the panel's slot, so
          it's suppressed while a panel is open rather than stacking. */}
      {!open && <MusicNudge bottomClass={PANEL_BOTTOM} />}
      <AnimatePresence>
        {open && (
          <motion.section
            key={`dock-${open}`}
            variants={withReducedMotion(fadeRise, reduced)}
            initial="hidden"
            animate="visible"
            exit="exit"
            // Keeps the fade on the main thread, which is the fix for a
            // blink on close. framer hands an accelerated opacity
            // animation to the Web Animations API and leaves the inline
            // style alone while it runs; on exit it then drops the WAAPI
            // animation a frame before it commits the final value, so
            // the panel repaints at the inline `opacity: 1` left over
            // from its entrance — one frame at full brightness, right as
            // it should be disappearing. `onUpdate` is what framer's
            // `AcceleratedAnimation.supports()` checks to opt out, and
            // it writes every frame inline instead. The cost is a tween
            // on one small element.
            onUpdate={noop}
            aria-label={PANEL_LABEL[open]}
            className={`fixed right-4 ${PANEL_BOTTOM} z-[35] flex max-h-[70dvh] w-[min(26rem,calc(100vw-2rem))] flex-col gap-3 overflow-y-auto rounded-xl border border-[var(--border-2)] bg-[var(--color-preset-bg)] p-5 shadow-[0_16px_48px_-12px_var(--glow)]`}
          >
            {open === "codex" ? (
              <CodexPanel
                status={status}
                isLoading={isLoading}
                onAction={() => setOpen(null)}
              />
            ) : open === "inventory" ? (
              <InventoryPanel />
            ) : open === "book" ? (
              <BookPanel margins={margins} signed={signed} />
            ) : (
              <AudioPanel />
            )}
          </motion.section>
        )}
      </AnimatePresence>
      {/* flex-row-reverse keeps the Codex pill anchored rightmost (unchanged
          position) with the Inventory pill tucked to its left. */}
      <div
        className={`fixed right-4 ${BUTTON_BOTTOM} z-[35] flex flex-row-reverse items-center gap-2`}
      >
        <button
          type="button"
          onClick={() => toggle("codex")}
          aria-expanded={open === "codex"}
          aria-label="Toggle the Protocol codex"
          className={PILL_CLASS}
          style={{ opacity: open === "codex" ? 1 : 0.85 }}
        >
          <Diamond />
          <span style={{ color: "var(--color-preset-accent)" }}>
            Codex {isLoading ? "…" : `${status.completed}/${status.total}`}
          </span>
        </button>
        <button
          type="button"
          onClick={() => toggle("inventory")}
          aria-expanded={open === "inventory"}
          aria-label="Toggle your inventory"
          className={PILL_CLASS}
          style={{ opacity: open === "inventory" ? 1 : 0.85 }}
        >
          <Diamond />
          <span style={{ color: "var(--color-preset-accent)" }}>Inventory</span>
        </button>
        {/* Icon-only, for the same reason as the speaker: the row is already
            at its width budget with two labelled pills. The stamp count is
            the one number worth surfacing without opening anything, so it
            rides as a badge and only once there's something to count.

            Hidden until the player has actually been handed the book — on a
            first visit the opening is still running, and a dock pill for an
            artifact they haven't picked up yet would spoil its arrival. */}
        {signed && (
          <button
            type="button"
            onClick={() => toggle("book")}
            aria-expanded={open === "book"}
            aria-label={
              progress?.starterClears
                ? `Open the Book (${progress.starterClears} of 3 stamped)`
                : "Open the Book"
            }
            className={`${PILL_CLASS} !px-3`}
            style={{ opacity: open === "book" ? 1 : 0.85 }}
          >
            <BookGlyph />
            {(progress?.starterClears ?? 0) > 0 && (
              <span
                aria-hidden
                className="font-mono text-[10px] tabular-nums"
                style={{ color: "var(--color-preset-accent)" }}
              >
                {progress?.starterClears}/3
              </span>
            )}
          </button>
        )}
        {supported && (
          <button
            type="button"
            onClick={() => toggle("audio")}
            aria-expanded={open === "audio"}
            aria-label={
              settings.muted
                ? "Sound settings (muted)"
                : settings.musicEnabled
                  ? "Sound settings"
                  : "Sound settings (music off)"
            }
            className={`${PILL_CLASS} !px-3`}
            style={{ opacity: open === "audio" ? 1 : 0.85 }}
          >
            {/* Slashed while muted *or* while music is off, so the icon
                answers "why is it quiet?" at a glance either way. */}
            <Speaker muted={settings.muted || !settings.musicEnabled} />
          </button>
        )}
      </div>
    </>,
    document.body,
  );
}
