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
import { useCodexStatus } from "@/lib/codex/use-codex";
import { useCodexToasts } from "@/lib/codex/use-codex-toasts";
import { fadeRise, withReducedMotion } from "@/lib/ui/motion";

// Lift the dock clear of the AppShell footer (49px), and of the fixed
// demo-banner strip too when it's enabled — the banner adds 24px of footer
// padding on top of that. (NEXT_PUBLIC_* is inlined at build time, so this
// is a static branch.)
const DEMO_BANNER = process.env.NEXT_PUBLIC_DEMO_BANNER === "true";
const BUTTON_BOTTOM = DEMO_BANNER ? "bottom-[5.5rem]" : "bottom-16";
const PANEL_BOTTOM = DEMO_BANNER ? "bottom-[8.5rem]" : "bottom-28";

type Panel = "codex" | "inventory";

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

export function CornerDock() {
  const { address } = useAccount();
  const { status, isLoading } = useCodexStatus(address);
  useCodexToasts(address, status, isLoading);

  const [open, setOpen] = useState<Panel | null>(null);
  const reduced = useReducedMotion();

  // Portal target only exists client-side; gate the first render.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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
      <AnimatePresence>
        {open && (
          <motion.section
            key={`dock-${open}`}
            variants={withReducedMotion(fadeRise, reduced)}
            initial="hidden"
            animate="visible"
            exit="hidden"
            aria-label={open === "codex" ? "Protocol codex" : "Inventory"}
            className={`fixed right-4 ${PANEL_BOTTOM} z-[35] flex max-h-[70dvh] w-[min(26rem,calc(100vw-2rem))] flex-col gap-3 overflow-y-auto rounded-xl border border-[var(--border-2)] bg-[var(--color-preset-bg)] p-5 shadow-[0_16px_48px_-12px_var(--glow)]`}
          >
            {open === "codex" ? (
              <CodexPanel
                status={status}
                isLoading={isLoading}
                onAction={() => setOpen(null)}
              />
            ) : (
              <InventoryPanel />
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
      </div>
    </>,
    document.body,
  );
}
