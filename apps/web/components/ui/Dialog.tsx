"use client";

/**
 * Dialog — the shared modal primitive.
 *
 * Replaces the two hand-rolled `createPortal` overlays in the Bazaar
 * (`PurchaseReceipt`, `ListDialog`). Provides the backdrop, centred panel,
 * click-outside-to-close, and the same accessibility contract as the
 * inventory drawer: focus moves in on open, Tab/Shift-Tab cycle inside,
 * Escape closes, and focus is restored to the trigger on close.
 *
 * The panel surface is the opaque preset background (not a glass token) so
 * the modal stays legible over the dimmed backdrop regardless of realm.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

const SIZE = {
  md: "max-w-md",
  lg: "max-w-lg",
} as const;

export function Dialog({
  open,
  onClose,
  label,
  size = "md",
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** aria-label for the dialog panel. */
  label: string;
  size?: keyof typeof SIZE;
  /** Extra classes for the panel (e.g. scroll/flex layout). */
  className?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);

  // Portal target only exists client-side; gate the first render.
  useEffect(() => setMounted(true), []);

  // Focus trap + restore + Escape, mirroring <InventoryDrawer/>.
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      restoreRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[color-mix(in_oklab,var(--color-preset-bg)_40%,#000_70%)]"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`w-full ${SIZE[size]} rounded-xl p-6 bg-[var(--color-preset-bg)] border border-[var(--border-1)] ${className ?? ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
