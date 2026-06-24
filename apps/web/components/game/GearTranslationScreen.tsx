"use client";

/**
 * `<GearTranslationScreen/>` — the "your gear changes shape" beat, now
 * played at realm *entry* instead of after a boss clear. When the player
 * descends into a realm whose genre differs from the gear they carried in,
 * this is the moment the translation actually happens: the same on-chain
 * token, re-rendered against the destination realm's adapter, with the
 * deterministic stat rebalance the contract applies surfaced as a diff.
 *
 * Each equipped slot is rendered twice — native (the realm it came from)
 * and translated (this realm) — via `AssetCard`'s `targetRealm` prop, with
 * an `AdapterStrip` underneath showing the `via adapter` address and the
 * before→after stat deltas. A single "Descend →" button calls `onDescend`,
 * which the play page uses to drop into the run proper.
 *
 * The translation visual (`TranslationPair`/`AdapterStrip`/`WeaponDiff`/
 * `ArmorDiff`) was lifted verbatim from the now-deleted `WarpInterstitial`,
 * which used to play this beat at the exit hand-off between starter realms.
 */

import { motion, useReducedMotion } from "framer-motion";
import type { AssetCard as AssetCardType, Preset } from "@/lib/engine/types";
import { AssetCard } from "@/components/inventory/AssetCard";
import {
  presetForRealm,
  useElementLabel,
  useTranslatedCard,
} from "@/lib/contracts/adapters";
import { getAdapterAddress } from "@/lib/contracts/seeded-adapters";
import { shortAddress } from "@/lib/utils";
import { Body, Button, Rule, Stamp } from "@/components/ui";
import { warpCrossfade, withReducedMotion } from "@/lib/ui/motion";

export function GearTranslationScreen({
  realm,
  preset,
  equipped,
  onDescend,
}: {
  realm: `0x${string}`;
  preset: Preset;
  equipped: { weapon?: AssetCardType; armor?: AssetCardType };
  onDescend: () => void;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.section
      aria-label="Your gear changes shape"
      data-preset={preset}
      variants={withReducedMotion(warpCrossfade, reduced)}
      initial="enter"
      animate="center"
      className="mx-auto w-full max-w-2xl"
    >
      <div className="flex flex-col gap-4 p-5 rounded-md relative overflow-hidden bg-[linear-gradient(135deg,var(--surface-2),var(--surface-1))] border border-dashed border-[var(--color-preset-accent)]">
        <header className="flex items-baseline justify-between gap-3">
          <Stamp>Field record · the things you carried</Stamp>
        </header>
        <Rule />
        <h3 className="font-mono text-lg leading-snug font-medium text-[var(--color-preset-accent)]">
          What you carried changes shape.
        </h3>
        <Body size="sm">
          The same blade, the same coat, the same token in the same wallet —
          the same self, only the dialect changes. The ground beneath you
          speaks differently here, so the protocol translates what you carry.
          Watch.
        </Body>

        <div className="flex flex-col gap-4">
          {equipped.weapon && (
            <TranslationPair
              label="Weapon"
              card={equipped.weapon}
              toRealm={realm}
            />
          )}
          {equipped.armor && (
            <TranslationPair
              label="Armor"
              card={equipped.armor}
              toRealm={realm}
            />
          )}
        </div>

        <Rule tone="muted" />
        <footer className="flex items-center justify-end pt-1">
          <Button intent="primary" size="md" onClick={onDescend}>
            Descend →
          </Button>
        </footer>
      </div>
    </motion.section>
  );
}

function TranslationPair({
  label,
  card,
  toRealm,
}: {
  label: string;
  card: AssetCardType;
  toRealm: `0x${string}`;
}) {
  // Resolve the adapter that will run when this card lands in the
  // destination realm. We render the address as a small "via" strip so
  // the player can see the protocol contract that mediates the swap —
  // it's the on-chain object responsible for the stat diff below.
  const fromPreset = card.realmPreset ?? presetForRealm(card.realm);
  const toPreset = presetForRealm(toRealm);
  const slot = card.slot === "weapon" || card.slot === "armor" ? card.slot : null;
  const adapter =
    fromPreset && toPreset && slot && fromPreset !== toPreset
      ? getAdapterAddress(slot, fromPreset, toPreset)
      : "0x0000000000000000000000000000000000000000";
  const hasAdapter = adapter !== "0x0000000000000000000000000000000000000000";

  // Pull the translated card so we can diff stat-by-stat. Falls back to
  // the native card synchronously (per `useTranslatedCard`'s contract)
  // while the on-chain `view` call is in flight.
  const translation = useTranslatedCard(card, toRealm);
  const translated = translation.data ?? card;

  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-[10px] uppercase opacity-65 tracking-[0.28em]">
        {label}
      </span>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <AssetCard card={card} compact />
        <span
          aria-hidden
          className="hidden sm:block font-mono text-xs uppercase opacity-60 text-center tracking-[0.28em]"
        >
          →
        </span>
        <AssetCard card={card} compact targetRealm={toRealm} />
      </div>
      {hasAdapter && (
        <AdapterStrip
          adapter={adapter}
          card={card}
          translated={translated}
          fromPreset={fromPreset!}
          toPreset={toPreset!}
          translating={translation.isFetching}
        />
      )}
    </div>
  );
}

/**
 * Below the before/after cards: a small "via 0x59b6…857b" strip plus a
 * stat diff line ("D6 → D4 · attack +1 → +2 · fire → incendiary"). This
 * is the dramatized "the adapter is doing something" moment — the
 * player sees the deterministic rebalance the contract applies as part
 * of the cross-realm hop, not just two cards side by side.
 */
function AdapterStrip({
  adapter,
  card,
  translated,
  fromPreset,
  toPreset,
  translating,
}: {
  adapter: `0x${string}`;
  card: AssetCardType;
  translated: AssetCardType;
  fromPreset: Preset;
  toPreset: Preset;
  translating: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md px-3 py-2 text-[11px] bg-[var(--surface-1)] border border-dashed border-[var(--border-2)]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-mono uppercase opacity-65 tracking-[0.22em]">
          via adapter
        </span>
        <code className="font-mono opacity-80" title={adapter}>
          {shortAddress(adapter)}
        </code>
      </div>
      {card.slot === "weapon" ? (
        <WeaponDiff
          card={card}
          translated={translated}
          fromPreset={fromPreset}
          toPreset={toPreset}
          translating={translating}
        />
      ) : card.slot === "armor" ? (
        <ArmorDiff
          card={card}
          translated={translated}
          fromPreset={fromPreset}
          toPreset={toPreset}
          translating={translating}
        />
      ) : null}
    </div>
  );
}

function Delta({
  before,
  after,
  format = (v) => String(v),
}: {
  before: string | number;
  after: string | number;
  format?: (v: string | number) => string;
}) {
  const changed = before !== after;
  return (
    <span
      className="font-mono"
      style={{
        opacity: changed ? 0.95 : 0.45,
        color: changed ? "var(--color-preset-accent)" : undefined,
      }}
    >
      {format(before)} → {format(after)}
    </span>
  );
}

function WeaponDiff({
  card,
  translated,
  fromPreset,
  toPreset,
  translating,
}: {
  card: AssetCardType;
  translated: AssetCardType;
  fromPreset: Preset;
  toPreset: Preset;
  translating: boolean;
}) {
  const fromElement = useElementLabel(card.element ?? "none", fromPreset);
  const toElement = useElementLabel(translated.element ?? "none", toPreset);
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 opacity-90">
      <Delta
        before={card.damageDie ?? 6}
        after={translated.damageDie ?? card.damageDie ?? 6}
        format={(v) => `D${v}`}
      />
      <span aria-hidden className="opacity-30">·</span>
      <Delta
        before={card.attackBonus ?? 0}
        after={translated.attackBonus ?? card.attackBonus ?? 0}
        format={(v) => `atk ${signed(Number(v))}`}
      />
      <span aria-hidden className="opacity-30">·</span>
      <Delta
        before={card.damageBonus ?? 0}
        after={translated.damageBonus ?? card.damageBonus ?? 0}
        format={(v) => `dmg ${signed(Number(v))}`}
      />
      {(card.element ?? "none") !== "none" && (
        <>
          <span aria-hidden className="opacity-30">·</span>
          <Delta before={fromElement} after={toElement} />
        </>
      )}
      {translating && <span className="opacity-65 italic">resolving…</span>}
    </div>
  );
}

function ArmorDiff({
  card,
  translated,
  fromPreset,
  toPreset,
  translating,
}: {
  card: AssetCardType;
  translated: AssetCardType;
  fromPreset: Preset;
  toPreset: Preset;
  translating: boolean;
}) {
  const fromElement = useElementLabel(card.resistElement ?? "none", fromPreset);
  const toElement = useElementLabel(translated.resistElement ?? "none", toPreset);
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 opacity-90">
      <Delta
        before={card.acBonus ?? 0}
        after={translated.acBonus ?? card.acBonus ?? 0}
        format={(v) => `AC ${signed(Number(v))}`}
      />
      <span aria-hidden className="opacity-30">·</span>
      <Delta
        before={card.hpBonus ?? 0}
        after={translated.hpBonus ?? card.hpBonus ?? 0}
        format={(v) => `HP ${signed(Number(v))}`}
      />
      {(card.resistElement ?? "none") !== "none" && (
        <>
          <span aria-hidden className="opacity-30">·</span>
          <Delta before={fromElement} after={toElement} />
        </>
      )}
      {translating && <span className="opacity-65 italic">resolving…</span>}
    </div>
  );
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}
