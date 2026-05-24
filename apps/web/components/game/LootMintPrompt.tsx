"use client";

/**
 * Loot-drop prompt that surfaces after a room clear. Renders the rolled
 * stats and lets the player "Mint and equip" (dispatches the on-chain
 * mint via the caller's `onMint`) or "Skip".
 *
 * Visual language: we render the rolled LootRoll as a preview
 * `AssetCard` so the prompt reads identical to the inventory drawer —
 * same name resolution, same element/type chips, same tier badge. The
 * preview card uses `lootRollToMockCard` (the same helper the engine
 * uses post-mint), so the player sees exactly the card they're about
 * to mint.
 *
 * Why a prompt and not auto-mint: the player should see what dropped
 * before paying gas.
 */

import { useMemo, useState } from "react";
import type {
  AssetCard as AssetCardType,
  LootRoll,
  Preset,
} from "@/lib/engine/types";
import { lootRollToMockCard } from "@/lib/engine/runtime";
import { AssetCard } from "@/components/inventory/AssetCard";
import { ChoiceRow, type Choice } from "@/components/game/ChoiceRow";

type Props = {
  loot: LootRoll;
  /**
   * The preset whose vocabulary should label the element / archetype
   * fields. The canonical keys flow through the on-chain label views
   * inside the rendered `AssetCard`, so the drop reads in the current
   * realm's voice — fire → incendiary in cyberpunk, holy → laser in
   * sci-fi, etc.
   */
  preset: Preset;
  /** Realm address the loot would be minted on. */
  realm: `0x${string}`;
  /** Human-readable realm name (shown on the AssetCard subline). */
  realmName: string;
  /**
   * Rebalance (A4): the currently-equipped card in the same slot, used
   * to render delta rows under the preview. `undefined` (no equipped
   * card in that slot) suppresses the delta block — the preview is the
   * upgrade by default. Both sides agree on the on-chain metadata
   * fields, so the delta is a pedagogical read of the same source of
   * truth combat resolves against.
   */
  comparedTo?: AssetCardType;
  onMint: () => Promise<void> | void;
  onSkip: () => void;
};

type DeltaRow = {
  label: string;
  /** "up" → upgrade, "down" → downgrade, "neutral" → side-grade / informational. */
  tone: "up" | "down" | "neutral";
};

/**
 * Element/resist swap tone:
 *   none → element  = up (gained a damage type / resistance)
 *   element → element = neutral (side-grade — different but not better)
 *   element → none  = down (lost the damage type / resistance)
 * Same-on-same returns null and produces no row.
 */
function elementSwapTone(
  from: string,
  to: string,
): "up" | "down" | "neutral" | null {
  if (from === to) return null;
  if (from === "none") return "up";
  if (to === "none") return "down";
  return "neutral";
}

/**
 * Compares two `AssetCard`s in the same slot and produces human-readable
 * delta rows. Stats are read off the canonical fields the engine uses
 * (`damageDie`, `attackBonus`, `damageBonus`, `acBonus`, `hpBonus`,
 * `element`, `resistElement`, `catalogEffects`) so the player is
 * looking at the same numbers combat resolves against.
 *
 * Catalog effects compare by NAME, not by value — a value bump on an
 * existing effect renders as a value-row; a brand-new effect renders
 * as "new" (up tone — strictly added capability). Effects on the equipped
 * card not present on the drop render as "lost" (down tone).
 */
function computeDeltas(next: AssetCardType, prev: AssetCardType): DeltaRow[] {
  const rows: DeltaRow[] = [];
  const fmt = (n: number) => (n > 0 ? `+${n}` : `${n}`);

  // Weapon-slot stats. damageDie compares as the integer die size.
  const dieA = prev.damageDie ?? 0;
  const dieB = next.damageDie ?? 0;
  if (dieA !== dieB && (dieA > 0 || dieB > 0)) {
    rows.push({
      label: `damage die d${dieA || "-"} → d${dieB || "-"}`,
      tone: dieB > dieA ? "up" : "down",
    });
  }
  const abA = prev.attackBonus ?? 0;
  const abB = next.attackBonus ?? 0;
  if (abA !== abB) {
    rows.push({
      label: `attack ${fmt(abA)} → ${fmt(abB)}`,
      tone: abB > abA ? "up" : "down",
    });
  }
  const dbA = prev.damageBonus ?? 0;
  const dbB = next.damageBonus ?? 0;
  if (dbA !== dbB) {
    rows.push({
      label: `damage ${fmt(dbA)} → ${fmt(dbB)}`,
      tone: dbB > dbA ? "up" : "down",
    });
  }

  // Armor-slot stats.
  const acA = prev.acBonus ?? 0;
  const acB = next.acBonus ?? 0;
  if (acA !== acB) {
    rows.push({
      label: `AC ${fmt(acA)} → ${fmt(acB)}`,
      tone: acB > acA ? "up" : "down",
    });
  }
  const hpA = prev.hpBonus ?? 0;
  const hpB = next.hpBonus ?? 0;
  if (hpA !== hpB) {
    rows.push({
      label: `HP ${fmt(hpA)} → ${fmt(hpB)}`,
      tone: hpB > hpA ? "up" : "down",
    });
  }

  // Element / resist swaps. Tone depends on direction:
  // gaining one is positive, losing one is negative, swapping is neutral.
  const elemA = prev.element ?? "none";
  const elemB = next.element ?? "none";
  const elemTone = elementSwapTone(elemA, elemB);
  if (elemTone) {
    const label =
      elemTone === "up"
        ? `element → ${elemB}`
        : elemTone === "down"
          ? `lost ${elemA} element`
          : `element ${elemA} → ${elemB}`;
    rows.push({ label, tone: elemTone });
  }
  const resA = prev.resistElement ?? "none";
  const resB = next.resistElement ?? "none";
  const resTone = elementSwapTone(resA, resB);
  if (resTone) {
    const label =
      resTone === "up"
        ? `resist → ${resB}`
        : resTone === "down"
          ? `lost ${resA} resist`
          : `resist ${resA} → ${resB}`;
    rows.push({ label, tone: resTone });
  }

  // Catalog effects. Index by name on both sides.
  const prevEffects = new Map(prev.catalogEffects.map((e) => [e.name, e.value]));
  const nextEffects = new Map(next.catalogEffects.map((e) => [e.name, e.value]));
  for (const [name, value] of nextEffects) {
    const prevVal = prevEffects.get(name);
    if (prevVal === undefined) {
      rows.push({ label: `${name.replace(/_/g, " ")} ${value} (new)`, tone: "up" });
    } else if (value !== prevVal) {
      rows.push({
        label: `${name.replace(/_/g, " ")} ${prevVal} → ${value}`,
        tone: value > prevVal ? "up" : "down",
      });
    }
  }
  for (const [name] of prevEffects) {
    if (!nextEffects.has(name)) {
      rows.push({ label: `lost ${name.replace(/_/g, " ")}`, tone: "down" });
    }
  }

  // Sort by tone priority: up → neutral → down.
  const TONE_ORDER: Record<DeltaRow["tone"], number> = {
    up: 0,
    neutral: 1,
    down: 2,
  };
  rows.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);

  return rows;
}

/**
 * Pill-style delta row. Visual language matches the chips in `AssetCard`
 * (small uppercase pill on a tinted background with a matching border)
 * so the delta block reads as part of the same family rather than as a
 * separate ad-hoc list. Tone drives the hue:
 *   up      → emerald (gain)
 *   neutral → slate-blue (side-grade)
 *   down    → rose (loss)
 * The leading glyph stays so the meaning is decodable without colour
 * (a11y — colour is reinforcement, not the only signal).
 */
function DeltaChip({
  tone,
  label,
}: {
  tone: "up" | "down" | "neutral";
  label: string;
}) {
  const palette =
    tone === "up"
      ? { bg: "rgba(45,212,191,0.10)", fg: "#5eead4", border: "rgba(45,212,191,0.30)" }
      : tone === "down"
        ? { bg: "rgba(244,63,94,0.10)", fg: "#fb7185", border: "rgba(244,63,94,0.30)" }
        : { bg: "rgba(148,163,184,0.10)", fg: "#cbd5e1", border: "rgba(148,163,184,0.30)" };
  const glyph = tone === "up" ? "↑" : tone === "down" ? "↓" : "→";
  return (
    <li
      className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider font-semibold tabular-nums inline-flex items-center gap-1"
      style={{
        background: palette.bg,
        color: palette.fg,
        border: `1px solid ${palette.border}`,
      }}
    >
      <span aria-hidden="true" className="opacity-80">
        {glyph}
      </span>
      <span>{label}</span>
    </li>
  );
}

export function LootMintPrompt({
  loot,
  preset,
  realm,
  realmName,
  comparedTo,
  onMint,
  onSkip,
}: Props) {
  const [minting, setMinting] = useState(false);

  // Preview the loot as the exact AssetCard the engine will produce
  // post-mint. The mock tokenId is fine here — the prompt is a preview
  // and the real card built in the parent's `onLootMinted` will have
  // the chain-assigned id.
  const previewCard = useMemo(
    () => lootRollToMockCard(loot, preset, realm, realmName),
    [loot, preset, realm, realmName],
  );

  // Delta block compares the rolled card against whatever the player
  // currently has in the same slot. Suppress when no comparable card
  // is equipped — the preview is a strict upgrade in that case.
  const deltas = useMemo(() => {
    if (!comparedTo || comparedTo.slot !== previewCard.slot) return [];
    return computeDeltas(previewCard, comparedTo);
  }, [previewCard, comparedTo]);

  const handleMint = async () => {
    setMinting(true);
    try {
      await onMint();
    } finally {
      setMinting(false);
    }
  };

  return (
    <section
      aria-label="Loot drop"
      className="flex flex-col gap-3 p-4 rounded-md"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid var(--color-preset-accent)",
      }}
    >
      <p className="text-xs uppercase tracking-widest opacity-50">
        Loot dropped
      </p>
      <AssetCard card={previewCard} />
      {comparedTo && (
        <div
          className="flex flex-col gap-2"
          aria-label="Stat changes vs equipped"
        >
          <p className="text-[10px] uppercase tracking-widest opacity-50">
            vs equipped{" "}
            <span className="opacity-80">{comparedTo.name}</span>
          </p>
          {deltas.length === 0 ? (
            <p className="text-xs opacity-60">
              No change — same stats as equipped.
            </p>
          ) : (
            <ul className="flex flex-col items-start gap-1">
              {deltas.map((d) => (
                <DeltaChip key={d.label} tone={d.tone} label={d.label} />
              ))}
            </ul>
          )}
        </div>
      )}
      <ChoiceRow
        ariaLabel="Loot drop actions"
        disabled={minting}
        choices={
          [
            {
              key: "mint",
              label: minting ? "Minting…" : "Mint and equip",
              variant: "primary",
              onClick: handleMint,
            },
            {
              key: "skip",
              label: "Skip",
              onClick: onSkip,
            },
          ] satisfies Choice[]
        }
      />
    </section>
  );
}
