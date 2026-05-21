"use client";

/**
 * `<WarpInterstitial/>` — bridges two starter realms after a boss
 * clear. Replaces the bare "open the picker" CTA for the forced
 * linear arc: the player isn't picking a next realm, they're being
 * funneled toward one, and the moment is supposed to *feel like*
 * a translation rather than a teleport.
 *
 * Three beats:
 *   1. Shard pickup — diegetic ledger note announcing what just came
 *      out of the boss room.
 *   2. Gear translation — each equipped item rendered twice: once
 *      native to the realm just left, once translated against the
 *      destination realm via the adapter (`AssetCard`'s `targetRealm`
 *      prop). Same on-chain token, same stats, different vocabulary.
 *      This is the dramatized "translation" surface.
 *   3. Arrival — short voice + a single "Walk forward" CTA that
 *      routes to `/play/${toPreset}`.
 *
 * Equipped gear comes in via props (the parent reads it from the
 * RunState). If the player has nothing equipped, the gear beat is
 * skipped — no translation to dramatize.
 */

import Link from "next/link";
import { useState } from "react";
import type { AssetCard as AssetCardType, Preset } from "@/lib/engine/types";
import { AssetCard } from "@/components/inventory/AssetCard";
import { getStarterRealm } from "@/lib/contracts/starter-realms";
import {
  presetForRealm,
  useElementLabel,
  useTranslatedCard,
} from "@/lib/contracts/adapters";
import { getAdapterAddress } from "@/lib/contracts/seeded-adapters";
import { shortAddress } from "@/lib/utils";
import {
  LedgerBody,
  LedgerRule,
  LedgerStamp,
} from "@/components/ledger/Ledger";

type Beat = "shard" | "gear" | "arrival";

const ARRIVAL_BY_PRESET: Record<Preset, { stamp: string; title: string; body: string; arrival: string }> = {
  fantasy: {
    stamp: "Field record · the Reach falls",
    title: "Wet wood, then rain on stone.",
    body:
      "Her laughter splinters into static. The forest thins. The ground beneath " +
      "the moss is concrete now, and the concrete is wet.",
    arrival: "You wake on a curb. The mark on your hand is still there.",
  },
  cyberpunk: {
    stamp: "Field record · the ICE shatters",
    title: "Blue smoke and a longer corridor.",
    body:
      "The contract burns in your hand. The rain becomes condensation, the " +
      "neon becomes panel-light. Something quieter than an engine is waiting.",
    arrival: "You wake in a corridor. The mark on your hand is still there.",
  },
  scifi: {
    stamp: "Field record · the Core goes quiet",
    title: "Three doors closed behind you.",
    body:
      "The reactor's whisper drops below hearing. You step through and the " +
      "ground steadies. The walk is finished, or the next part begins.",
    arrival: "You step out onto open ground.",
  },
};

export function WarpInterstitial({
  fromPreset,
  toPreset,
  equipped,
}: {
  fromPreset: Preset;
  toPreset: Preset;
  equipped: { weapon?: AssetCardType; armor?: AssetCardType };
}) {
  const [beat, setBeat] = useState<Beat>("shard");
  const toRealm = getStarterRealm(toPreset).realm;
  const arrival = ARRIVAL_BY_PRESET[toPreset];
  const fromArrival = ARRIVAL_BY_PRESET[fromPreset];
  const hasGear = !!(equipped.weapon || equipped.armor);

  if (beat === "shard") {
    return (
      <Frame stamp={fromArrival.stamp}>
        <h3
          className="font-mono text-lg leading-snug font-medium"
          style={{ color: "var(--color-preset-accent)" }}
        >
          {fromArrival.title}
        </h3>
        <LedgerBody size="sm">{fromArrival.body}</LedgerBody>
        <LedgerBody size="sm">
          A shard catches the light in your hand. It is warm. It is yours.
        </LedgerBody>
        <Footer
          label={hasGear ? "Carry what's yours" : "Walk forward"}
          onClick={() => setBeat(hasGear ? "gear" : "arrival")}
        />
      </Frame>
    );
  }

  if (beat === "gear") {
    return (
      <Frame stamp="Field record · the things you carried">
        <h3
          className="font-mono text-lg leading-snug font-medium"
          style={{ color: "var(--color-preset-accent)" }}
        >
          What you carried changes shape.
        </h3>
        <LedgerBody size="sm">
          The same blade, the same coat, the same token in the same wallet —
          but the ground beneath them speaks a different language now. The
          protocol translates. Watch.
        </LedgerBody>

        <div className="flex flex-col gap-4">
          {equipped.weapon && (
            <TranslationPair
              label="Weapon"
              card={equipped.weapon}
              toRealm={toRealm}
            />
          )}
          {equipped.armor && (
            <TranslationPair
              label="Armor"
              card={equipped.armor}
              toRealm={toRealm}
            />
          )}
        </div>

        <Footer label="Walk forward" onClick={() => setBeat("arrival")} />
      </Frame>
    );
  }

  // arrival
  return (
    <Frame stamp={arrival.stamp}>
      <h3
        className="font-mono text-lg leading-snug font-medium"
        style={{ color: "var(--color-preset-accent)" }}
      >
        {arrival.title}
      </h3>
      <LedgerBody size="sm">{arrival.body}</LedgerBody>
      <LedgerBody size="sm">{arrival.arrival}</LedgerBody>
      <footer className="flex items-center justify-end pt-1">
        <Link
          href={`/play/${toPreset}`}
          data-preset={toPreset}
          className="rounded-md px-4 py-2 text-sm font-medium transition"
          style={{
            background: "var(--color-preset-accent)",
            color: "var(--color-preset-bg)",
          }}
        >
          Walk in →
        </Link>
      </footer>
    </Frame>
  );
}

function Frame({
  stamp,
  children,
}: {
  stamp: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label="Warp"
      className="flex flex-col gap-4 p-5 rounded-md relative overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))",
        border: "1px dashed var(--color-preset-accent)",
      }}
    >
      <header className="flex items-baseline justify-between gap-3">
        <LedgerStamp>{stamp}</LedgerStamp>
      </header>
      <LedgerRule />
      {children}
      <LedgerRule tone="muted" />
    </section>
  );
}

function Footer({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <footer className="flex items-center justify-end pt-1">
      <button
        type="button"
        onClick={onClick}
        className="rounded-md px-4 py-2 text-sm font-medium transition"
        style={{
          background: "var(--color-preset-accent)",
          color: "var(--color-preset-bg)",
        }}
      >
        {label} →
      </button>
    </footer>
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
  const fromPreset = presetForRealm(card.realm);
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
      <span
        className="font-mono text-[10px] uppercase opacity-55"
        style={{ letterSpacing: "0.28em" }}
      >
        {label}
      </span>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <AssetCard card={card} compact />
        <span
          aria-hidden
          className="hidden sm:block font-mono text-xs uppercase opacity-60 text-center"
          style={{ letterSpacing: "0.28em" }}
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
    <div
      className="flex flex-col gap-1 rounded-md px-3 py-2 text-[11px]"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px dashed rgba(255,255,255,0.12)",
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span
          className="font-mono uppercase opacity-55"
          style={{ letterSpacing: "0.22em" }}
        >
          via adapter
        </span>
        <code
          className="font-mono opacity-80"
          title={adapter}
        >
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
      {translating && (
        <span className="opacity-50 italic">resolving…</span>
      )}
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
  const toElement = useElementLabel(
    translated.resistElement ?? "none",
    toPreset,
  );
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
      {translating && (
        <span className="opacity-50 italic">resolving…</span>
      )}
    </div>
  );
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}
