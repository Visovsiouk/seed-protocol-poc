"use client";

import Link from "next/link";
import type { RealmDisplay } from "@/lib/contracts/realm-display";
import type { PlayerRealmMeta } from "@/lib/reads/hooks";
import { shortAddress } from "@/lib/utils";
import { trialRealmName } from "@/lib/contracts/realm-trial";
import { realmPageFallback } from "@/lib/story/page-bank";
import {
  PresetBadge,
  StatusPill,
  REALM_CARD_CLASS,
  REALM_CARD_THEME_STYLE,
} from "./shared";

export function CreatorCard({
  card,
  meta,
  onSelect,
  cellRef,
  tabIndex,
}: {
  card: Extract<RealmDisplay, { kind: "creator" }>;
  /** Sqlite metadata when the realm was registered via /create
   *. Absent for legacy realms — those still render with
   *  the trial-mode copy and an address-based title. */
  meta?: PlayerRealmMeta;
  /** When provided, stage a loadout instead of navigating to play. */
  onSelect?: () => void;
  /** Roving-focus wiring from the grid (RealmGrid). */
  cellRef?: (el: HTMLElement | null) => void;
  tabIndex?: number;
}) {
  const isRegistered = !!meta;
  // Lowercased so the stand-in label matches the one staging and the play
  // route derive from the same address.
  const title =
    meta?.name ??
    trialRealmName(card.address.toLowerCase() as `0x${string}`);
  // The page's own opening line. A model wrote one for some realms; for the
  // rest the bank is deterministic per address, so every registered page has
  // words to introduce itself with and they never change between renders.
  const pageText = meta
    ? (meta.lore?.pageText ??
      realmPageFallback({
        realm: card.address,
        name: title,
        preset: meta.preset,
        bossId: meta.bossId,
      }).pageText)
    : null;
  // Preset-themed palette when registered, neutral dashed border for
  // trial-mode (legacy) realms so the visual hierarchy still tells
  // them apart at a glance.
  // A custom accent is scoped to this card via an inline CSS-var override;
  // because the link carries `data-preset`, the genre block resolves the
  // rest of the palette and the override just recolours the accent.
  const accentOverride = meta?.accent
    ? ({ "--color-preset-accent": meta.accent } as React.CSSProperties)
    : undefined;
  const style: React.CSSProperties = isRegistered
    ? {
        ...REALM_CARD_THEME_STYLE,
        ...accentOverride,
      }
    : {
        background: "var(--surface-1)",
        border: "1px dashed var(--border-2)",
      };

  const inner = (
    <>
      <header className="flex items-baseline justify-between gap-2">
        <h3
          className={
            isRegistered
              ? "text-lg font-semibold"
              : "text-base font-semibold font-mono"
          }
        >
          {title}
        </h3>
        {isRegistered ? (
          <PresetBadge preset={meta.preset} />
        ) : (
          <StatusPill
            label={card.active ? "Active" : "Inactive"}
            tone={card.active ? "ok" : "muted"}
          />
        )}
      </header>
      {isRegistered ? (
        <>
          {/* The page in its own words. A stranger's realm used to arrive as
              `preset · boss · tier · owner`, which tells you what it is and
              nothing about what it is like. Generated prose when the author's
              page has some, otherwise the deterministic bank — either way the
              page introduces itself before the metadata does. */}
          <p className="text-sm italic leading-relaxed opacity-80 line-clamp-3">
            {pageText}
          </p>
          <p className="text-[11px] leading-relaxed opacity-65">
            Written by{" "}
            <span className="font-mono">{shortAddress(card.owner)}</span>, who
            had one signet and spent it here. T{meta.maxTier} ·{" "}
            {meta.distinctClearers === 0
              ? "no hands down it yet"
              : `${meta.distinctClearers} ${meta.distinctClearers === 1 ? "hand" : "hands"} down it`}
            {meta.nextTierAt !== null && ` · ${meta.nextTierAt} for more`}
          </p>
        </>
      ) : (
        <p className="text-sm opacity-75 leading-relaxed">
          A page somebody added before the registry kept charters. Owner{" "}
          <span className="font-mono">{shortAddress(card.owner)}</span>. Runs in
          trial mode until the realm is registered via<code> /create</code>.
        </p>
      )}
      <footer className="mt-auto flex items-center justify-between gap-2 pt-2">
        <p className="text-[11px] opacity-65 font-mono">
          Block {card.createdAt.toString()}
        </p>
        <span
          className="text-xs uppercase tracking-widest"
          style={{
            color: isRegistered
              ? "var(--color-preset-accent)"
              : "var(--color-preset-fg)",
            opacity: isRegistered ? 1 : 0.55,
          }}
        >
          {isRegistered ? "Enter →" : "Trial →"}
        </span>
      </footer>
    </>
  );

  if (onSelect) {
    return (
      <button
        ref={cellRef as React.Ref<HTMLButtonElement>}
        tabIndex={tabIndex}
        type="button"
        onClick={onSelect}
        data-realm={card.address}
        data-preset={meta?.preset}
        className={REALM_CARD_CLASS}
        style={style}
      >
        {inner}
      </button>
    );
  }
  return (
    <Link
      ref={cellRef as React.Ref<HTMLAnchorElement>}
      tabIndex={tabIndex}
      href={`/play/realm/${card.address}`}
      data-realm={card.address}
      data-preset={meta?.preset}
      className={REALM_CARD_CLASS}
      style={style}
    >
      {inner}
    </Link>
  );
}
