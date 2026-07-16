"use client";

/**
 * CodexWidget — the Protocol Codex as floating chrome.
 *
 * A fixed bottom-right pill (progress count) that opens a floating checklist
 * popover. Mounted ONCE in app/providers.tsx so the codex — and its
 * completion toasts (`useCodexToasts`) — travel with the player across every
 * route instead of hiding at the bottom of the hub page.
 *
 * Portal + z-[35]: above the sticky header (z-30), below drawers/dialogs/
 * overlays (z-40+) so modals correctly cover it. The toast stack (z-[90])
 * stays top-right; this stays bottom-right — they never collide.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useAccount } from "wagmi";
import { Rule, Stamp } from "@/components/ui";
import { useCodexStatus } from "@/lib/codex/use-codex";
import { useCodexToasts } from "@/lib/codex/use-codex-toasts";
import { fadeRise, withReducedMotion } from "@/lib/ui/motion";
import { CodexStepList } from "./CodexStepList";

// Lift the widget clear of the fixed demo-banner strip when it's enabled
// (NEXT_PUBLIC_* is inlined at build time, so this is a static branch).
const DEMO_BANNER = process.env.NEXT_PUBLIC_DEMO_BANNER === "true";
const BUTTON_BOTTOM = DEMO_BANNER ? "bottom-10" : "bottom-4";
const PANEL_BOTTOM = DEMO_BANNER ? "bottom-[5.5rem]" : "bottom-16";

export function CodexWidget() {
  const { address } = useAccount();
  const { status, isLoading } = useCodexStatus(address);
  useCodexToasts(address, status, isLoading);

  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();

  // Portal target only exists client-side; gate the first render.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Escape closes the popover (no focus trap — it's a popover, not a modal).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <>
      {open && (
        // Invisible click-catcher: any click outside the popover closes it.
        <div
          aria-hidden
          className="fixed inset-0 z-[34]"
          onClick={() => setOpen(false)}
        />
      )}
      <AnimatePresence>
        {open && (
          <motion.section
            key="codex-popover"
            variants={withReducedMotion(fadeRise, reduced)}
            initial="hidden"
            animate="visible"
            exit="hidden"
            aria-label="Protocol codex"
            className={`fixed right-4 ${PANEL_BOTTOM} z-[35] flex max-h-[70dvh] w-[min(26rem,calc(100vw-2rem))] flex-col gap-3 overflow-y-auto rounded-xl border border-[var(--border-2)] bg-[var(--color-preset-bg)] p-5 shadow-[0_16px_48px_-12px_var(--glow)]`}
          >
            <header className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <Stamp tone="accent">The Codex</Stamp>
                <span
                  className="font-mono text-sm tabular-nums opacity-70"
                  aria-label={`Codex progress: ${status.completed} of ${status.total}`}
                >
                  {isLoading ? "…" : `${status.completed}/${status.total}`}
                </span>
              </div>
              <Rule />
              <p className="text-xs leading-relaxed opacity-70">
                One journey, the whole protocol — each step exercises a
                different guarantee of the Seed Protocol, and the referenced
                white-paper section is what your action proves on-chain.
              </p>
            </header>
            <CodexStepList status={status} onAction={() => setOpen(false)} />
          </motion.section>
        )}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Toggle the Protocol codex"
        className={`fixed right-4 ${BUTTON_BOTTOM} z-[35] flex items-center gap-2 rounded-full border border-[var(--border-2)] bg-[var(--color-preset-bg)] px-4 py-2 font-mono text-xs uppercase tracking-widest shadow-[0_0_16px_-6px_var(--glow)] transition-opacity hover:opacity-100`}
        style={{ opacity: open ? 1 : 0.85 }}
      >
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
        <span style={{ color: "var(--color-preset-accent)" }}>
          Codex {isLoading ? "…" : `${status.completed}/${status.total}`}
        </span>
      </button>
    </>,
    document.body,
  );
}
