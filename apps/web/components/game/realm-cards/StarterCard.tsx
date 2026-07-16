"use client";

import Link from "next/link";
import type { RealmDisplay } from "@/lib/contracts/realm-display";
import { isPlayable, type RealmLockState } from "@/lib/story/progression";
import { Body, Stamp } from "@/components/ui";
import {
  PresetBadge,
  StatusPill,
  REALM_CARD_CLASS,
  REALM_CARD_THEME_STYLE,
} from "./shared";

export function StarterCard({
  card,
  lockState,
  onSelect,
  cellRef,
  tabIndex,
}: {
  card: Extract<RealmDisplay, { kind: "starter" }>;
  lockState: RealmLockState;
  /**
   * When provided, the card stages a loadout (calls `onSelect`) instead
   * of navigating straight to `/play/[preset]`. The hub wires this; other
   * mounts (tests) omit it and keep the link behaviour.
   */
  onSelect?: () => void;
  /** Roving-focus wiring from the grid (RealmGrid). */
  cellRef?: (el: HTMLElement | null) => void;
  tabIndex?: number;
}) {
  const chainReady = card.deployed && card.ready;
  const playable = isPlayable(lockState);
  const cleared = lockState === "cleared";

  const status: { label: string; tone: "ok" | "warn" | "muted" } =
    lockState === "locked-pre-prev"
      ? { label: "Sealed", tone: "muted" }
      : cleared
        ? { label: "Cleared", tone: "ok" }
        : !card.deployed
          ? { label: "Not yet seeded", tone: "muted" }
          : !card.onchain
            ? { label: "Pending registration", tone: "warn" }
            : !card.onchain.active
              ? { label: "Inactive", tone: "warn" }
              : lockState === "genesis-locked"
                ? { label: "Genesis · begin here", tone: "ok" }
                : { label: "Ready", tone: "ok" };

  const cta = cleared ? "Re-enter →" : "Enter →";

  const inner = (
    <>
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="font-mono text-lg font-medium tracking-[-0.01em]">
          {card.name}
        </h3>
        <PresetBadge preset={card.preset} />
      </header>
      <Body size="sm">{card.tagline}</Body>
      <footer className="mt-auto flex items-center justify-between gap-2 pt-2">
        <StatusPill label={status.label} tone={status.tone} />
        <span
          className="font-mono text-xs uppercase tracking-[0.22em]"
          style={{ color: "var(--color-preset-accent)" }}
        >
          {cta}
        </span>
      </footer>
    </>
  );

  if (!playable) {
    // A realm the player hasn't reached yet sits in the base as an
    // anonymous seal — no name, no genre, no colour, nothing to give the
    // surprise away. (Starters are only ever !playable pre-arc; once the
    // arc is done all three read as "cleared".)
    return (
      <div
        ref={cellRef as React.Ref<HTMLDivElement>}
        tabIndex={-1}
        aria-disabled="true"
        aria-label="Sealed realm"
        className="flex flex-col gap-3 p-5 rounded-md opacity-60"
        style={{
          background: "var(--surface-1)",
          border: "1px dashed var(--border-2)",
          cursor: "not-allowed",
        }}
      >
        <header className="flex items-baseline justify-between gap-2">
          <Stamp>Sealed</Stamp>
        </header>
        <Body size="sm">
          A way down you haven&apos;t earned the breaking of.
        </Body>
        <footer className="mt-auto flex items-center justify-between gap-2 pt-2">
          <StatusPill label="Sealed" tone="muted" />
          <span className="font-mono text-xs uppercase tracking-[0.22em] opacity-30">
            ?????
          </span>
        </footer>
      </div>
    );
  }

  // Always keep the play link clickable even when the realm isn't yet
  // chain-ready — the play route renders its own "not deployed" notice
  // and the disconnected-mode fallback still drives the in-memory
  // engine, which is the smoke-test surface devs use before seeding.
  void chainReady;
  if (onSelect) {
    return (
      <button
        ref={cellRef as React.Ref<HTMLButtonElement>}
        tabIndex={tabIndex}
        key={card.preset}
        type="button"
        onClick={onSelect}
        data-preset={card.preset}
        className={REALM_CARD_CLASS}
        style={REALM_CARD_THEME_STYLE}
      >
        {inner}
      </button>
    );
  }
  return (
    <Link
      ref={cellRef as React.Ref<HTMLAnchorElement>}
      tabIndex={tabIndex}
      key={card.preset}
      href={`/play/${card.preset}`}
      data-preset={card.preset}
      className={REALM_CARD_CLASS}
      style={REALM_CARD_THEME_STYLE}
    >
      {inner}
    </Link>
  );
}
