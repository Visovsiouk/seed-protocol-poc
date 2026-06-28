"use client";

/**
 * Extraction selection overlay. When the player chooses
 * to Extract & bank, they no longer auto-mint every carried finding — this
 * modal lets them pick which findings to bank (mint) and which to discard
 * (drop, never minted). It portals a focused, dimmed modal over the
 * viewport so the choice is deliberate, the same beat the defeat overlay
 * uses for a fall.
 *
 * Each carried `EscrowEntry` is previewed as the exact `AssetCard` the
 * engine produces post-mint (`lootRollToMockCard`), so the picker reads in
 * the same visual language as the inventory drawer and the escrow tray.
 * Clicking a card toggles it between Mint and Discard. Confirm hands the
 * kept indices back up to `extract({ keep })`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import type { EscrowEntry, Preset } from "@/lib/engine/types";
import { lootRollToMockCard } from "@/lib/engine/runtime";
import { AssetCard } from "@/components/inventory/AssetCard";
import { Stamp } from "@/components/ui";
import { KbdHint } from "@/components/game/ChoiceRow";
import { useEnterToActivate } from "@/lib/ui/useEnterToActivate";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

type Props = {
  escrow: readonly EscrowEntry[];
  /** Preset whose vocabulary labels the element / archetype fields. */
  preset: Preset;
  /** Realm the kept findings would mint under. */
  realm: `0x${string}`;
  /** Human-readable realm name (shown on the AssetCard subline). */
  realmName: string;
  /** Disable the controls while the bank is settling. */
  busy?: boolean;
  /** Bank the findings at these escrow indices; discard the rest. */
  onConfirm: (keep: number[]) => void;
  /** Back out to the Descend / Extract decision without banking. */
  onCancel: () => void;
  /**
   * Whether to offer the Back affordance. The Extract path can back out to
   * the Descend / Extract decision; a boss clear cannot (the room can't be
   * fled and the run is already won), so the picker hides Back for it.
   */
  allowCancel?: boolean;
};

export function ExtractSelection({
  escrow,
  preset,
  realm,
  realmName,
  busy = false,
  onConfirm,
  onCancel,
  allowCancel = true,
}: Props) {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // Focus trap + Escape + restore, mirroring <Dialog/>. We focus the panel
  // itself (tabIndex -1) rather than a button so a held Enter has no native
  // target to fire — Enter→Bank goes solely through the gated hook above.
  useEffect(() => {
    if (!mounted) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (!allowCancel || busy) return;
        e.preventDefault();
        onCancel();
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
  }, [mounted, allowCancel, busy, onCancel]);

  // Default: bank everything. The player opts findings *out*, which is the
  // safer default — a stray confirm banks the whole run rather than losing it.
  const [kept, setKept] = useState<Set<number>>(
    () => new Set(escrow.map((_, i) => i)),
  );

  // Highest tier first (newest leading within a tier). Each entry keeps its
  // *original* escrow index `i` — `kept`/`toggle`/`onConfirm` all key off
  // that, so display order is decoupled from the index identity.
  const cards = useMemo(
    () =>
      escrow
        .map((entry, i) => ({
          card: lootRollToMockCard(entry.loot, preset, realm, realmName),
          i,
        }))
        .sort((a, b) => b.card.tier - a.card.tier || b.i - a.i),
    [escrow, preset, realm, realmName],
  );

  function toggle(i: number) {
    if (busy) return;
    setKept((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function confirm() {
    if (busy) return;
    onConfirm([...kept].sort((a, b) => a - b));
  }

  // Enter banks (the modal's forward action). Gated by the shared activation
  // gate so the held Enter that opened this modal (from the Extract choice)
  // doesn't instantly bank. Space still toggles the focused card/button.
  useEnterToActivate({ onActivate: confirm, enabled: !busy, sig: "extract" });

  const keepCount = kept.size;
  const discardCount = escrow.length - keepCount;
  const allKept = keepCount === escrow.length;

  if (!mounted) return null;

  return createPortal(
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Choose findings to bank"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 backdrop-blur-sm bg-[color-mix(in_oklab,var(--color-preset-accent)_10%,#000_82%)]"
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.div
        ref={panelRef}
        tabIndex={-1}
        className="flex max-h-[min(90vh,44rem)] w-full max-w-2xl flex-col gap-4 rounded-xl border p-6 bg-[var(--color-preset-bg)] focus:outline-none"
        style={{
          borderColor:
            "color-mix(in oklab, var(--color-preset-accent) 45%, transparent)",
          boxShadow:
            "0 0 0 1px color-mix(in oklab, var(--color-preset-accent) 22%, transparent), 0 24px 80px -12px color-mix(in oklab, var(--color-preset-accent) 40%, transparent)",
        }}
        initial={reduced ? false : { opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <header className="flex flex-col gap-2">
          <Stamp tone="accent">Bank your findings</Stamp>
          <h2 className="text-xl font-semibold leading-tight">
            What surfaces with you?
          </h2>
          <p className="text-sm opacity-80 leading-relaxed">
            Tap a finding to keep or drop it. Kept findings mint to your wallet
            under{" "}
            <span className="font-medium opacity-100">{realmName}</span> when
            you confirm. Dropped findings are gone — they never touch the chain.
          </p>
        </header>

        <div className="flex items-center gap-2 text-xs tabular-nums">
          <button
            type="button"
            disabled={busy || allKept}
            onClick={() => setKept(new Set(escrow.map((_, i) => i)))}
            className="rounded-md border px-2.5 py-1 transition disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90"
            style={{ borderColor: "var(--border-1)" }}
          >
            Keep all
          </button>
          <button
            type="button"
            disabled={busy || keepCount === 0}
            onClick={() => setKept(new Set())}
            className="rounded-md border px-2.5 py-1 transition disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90"
            style={{ borderColor: "var(--border-1)" }}
          >
            Drop all
          </button>
          <span className="ml-auto opacity-70">
            <span className="text-[var(--color-ok)]">{keepCount} keep</span>
            {discardCount > 0 && (
              <>
                {" · "}
                <span className="text-[var(--color-danger)]">
                  {discardCount} drop
                </span>
              </>
            )}
          </span>
        </div>

        <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] content-start gap-3 overflow-y-auto pr-1">
          {cards.map(({ card, i }) => {
            const isKept = kept.has(i);
            return (
              <li
                key={`${card.tokenId.toString()}-${i}`}
                className="flex flex-col gap-1.5"
              >
                {/*
                  `flex-1` + `[&>button]:h-full` makes every card stretch to
                  the tallest in its row, so the Mint/Drop toggles below line
                  up on one baseline regardless of how many stat chips a card
                  carries.
                */}
                <div
                  className="flex-1 transition-opacity [&>button]:h-full"
                  style={{ opacity: isKept ? 1 : 0.55 }}
                >
                  <AssetCard card={card} onClick={() => toggle(i)} />
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => toggle(i)}
                  aria-pressed={isKept}
                  className="flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition disabled:cursor-not-allowed"
                  style={{
                    background: isKept
                      ? "color-mix(in oklab, var(--color-ok) 18%, transparent)"
                      : "color-mix(in oklab, var(--color-danger) 18%, transparent)",
                    color: isKept
                      ? "var(--color-ok)"
                      : "var(--color-danger)",
                    border: `1px solid ${
                      isKept
                        ? "color-mix(in oklab, var(--color-ok) 50%, transparent)"
                        : "color-mix(in oklab, var(--color-danger) 50%, transparent)"
                    }`,
                  }}
                >
                  {isKept ? "✓ Will mint" : "✕ Discarded"}
                </button>
              </li>
            );
          })}
        </ul>

        <footer className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <span className="mr-auto">
            <KbdHint multi={false} />
          </span>
          {allowCancel && (
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="rounded-lg px-5 py-3 text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border-1)",
                color: "var(--color-preset-fg)",
              }}
            >
              Back
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm([...kept].sort((a, b) => a - b))}
            className="rounded-lg px-5 py-3 text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
            style={{
              background: "var(--color-preset-accent)",
              color: "var(--color-preset-bg)",
            }}
          >
            {busy
              ? "Banking…"
              : keepCount > 0
                ? `Bank ${keepCount} finding${keepCount === 1 ? "" : "s"}`
                : "Surface empty-handed"}
          </button>
        </footer>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
