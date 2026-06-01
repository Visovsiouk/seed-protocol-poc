"use client";

/**
 * Generic asset card — renders any `AssetCard` from the engine, regardless
 * of source realm or schema. Used inside the inventory drawer and (Phase
 * 4) the Bazaar listing detail.
 *
 * The card surfaces three layers, top to bottom:
 *   1. Identity — name, realm of origin (the `mintedBy` realm), tier.
 *   2. Canonical mechanical stats from the tier table.
 *   3. Catalog effects (if any) and extra non-canonical fields.
 *
 * Presentation is built entirely on the shared kit:
 * a tier-ramp spine down the left edge keyed to `tierColor`, kit chips for
 * tier / element / effect / provenance, and token-ized surfaces — no inline
 * colour dicts. `selected` is presentational only — equip flow is driven by
 * the parent (`<InventoryDrawer/>`).
 */

import type {
  AssetCard as AssetCardType,
  Element,
  Preset,
} from "@/lib/engine/types";
import {
  presetForRealm,
  useElementLabel,
  useTranslatedCard,
} from "@/lib/contracts/adapters";
import { getAdapterAddress } from "@/lib/contracts/seeded-adapters";
import { armorName, weaponName } from "@/lib/loot/names";
import { tierColor } from "@/lib/ui/loot-visuals";
import { fadeRise, withReducedMotion } from "@/lib/ui/motion";
import { Chip, TierChip, ElementChip, EffectChip, ProvenanceChip } from "@/components/ui";
import { motion, useReducedMotion } from "framer-motion";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;

type Props = {
  card: AssetCardType;
  selected?: boolean;
  onClick?: () => void;
  /** Compact mode strips the description and shortens the card. */
  compact?: boolean;
  /**
   * The realm the player is currently playing in. When set and different
   * from `card.realm`, the card renders a translation strip showing the
   * stats the adapter will produce on equip. Omit on screens where there
   * is no "active realm" context (e.g. the Bazaar listing detail).
   */
  targetRealm?: `0x${string}`;
  /**
   * Optional preset hint for `targetRealm`. Required when the target is a
   * player-deployed realm not in the seeded-realms map. The play page
   * supplies this from its realm-meta fetch so translation works uniformly
   * across starter and player-made realms.
   */
  targetPreset?: Preset;
};

/**
 * Element pill that resolves the preset-local vocabulary (e.g. holy →
 * "laser" in cyberpunk) and delegates to the kit `ElementChip` so the hue
 * stays canonical while the label follows the realm. `null` preset falls
 * back to the canonical name.
 */
function TranslatedElementChip({
  element,
  kind,
  preset,
}: {
  element: Exclude<Element, "none">;
  kind: "damage" | "resist";
  preset: Preset | null;
}) {
  const label = useElementLabel(element, preset);
  return <ElementChip element={element} label={label} kind={kind} />;
}

function shortAddr(addr: `0x${string}`): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Resolve the schema-native TYPE label for a card under a given preset's
 * vocabulary. Returns "" when the card has no archetype (story-objects,
 * legacy un-archetyped loot) or when the preset can't be resolved — in
 * either case the chip is omitted by the caller.
 */
function typeLabelFor(
  card: AssetCardType,
  preset: Preset | null,
): string {
  if (!preset) return "";
  if (card.slot === "weapon") {
    return weaponName(preset, card.weaponType, card.tier);
  }
  if (card.slot === "armor") {
    return armorName(preset, card.armorType, card.tier);
  }
  return "";
}

/**
 * Strip rendered below the active-realm stats showing the card's
 * *original* (source-preset) stats and element vocabulary. Only renders
 * when a real translation hop applies. Loading / missing-adapter /
 * error states fall through to a status line instead of stat rows —
 * the parent has already rendered the native stats up top in those
 * cases, so the source card itself isn't useful to show twice.
 */
function OriginalStrip({
  card,
  sourcePreset,
  hasAdapter,
  hasTranslation,
  adapter,
  isFetching,
  isError,
}: {
  card: AssetCardType;
  sourcePreset: Preset;
  hasAdapter: boolean;
  hasTranslation: boolean;
  adapter: `0x${string}`;
  isFetching: boolean;
  isError: boolean;
}) {
  const isWeapon = card.slot === "weapon";
  const reduced = useReducedMotion();
  const damageElement =
    isWeapon && card.element && card.element !== "none"
      ? (card.element as Exclude<Element, "none">)
      : null;
  const resistElement =
    !isWeapon && card.resistElement && card.resistElement !== "none"
      ? (card.resistElement as Exclude<Element, "none">)
      : null;

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={withReducedMotion(fadeRise, reduced)}
      className="mt-1 rounded-md p-2 flex flex-col gap-1 border border-dashed"
      style={{
        background:
          "color-mix(in oklab, var(--color-preset-accent) 7%, transparent)",
        borderColor:
          "color-mix(in oklab, var(--color-preset-accent) 35%, transparent)",
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-preset-accent)]">
          Translated from {sourcePreset}
        </span>
        {hasAdapter && (
          <span className="text-[10px] opacity-50 font-mono">
            via {shortAddr(adapter)}
          </span>
        )}
      </div>
      {!hasAdapter ? (
        <span className="text-[10px] opacity-60">
          No adapter deployed — equipping uses native stats.
        </span>
      ) : isError ? (
        <span className="text-[10px] text-[var(--color-warn)]">
          Adapter call failed — re-run <code>pnpm seed:adapters</code> if you
          restarted Anvil. Equipping uses native stats.
        </span>
      ) : !hasTranslation ? (
        <span className="text-[10px] opacity-60">
          {isFetching ? "Translating…" : "Awaiting adapter read."}
        </span>
      ) : (
        <>
          <div className="text-xs tabular-nums opacity-90">
            {isWeapon ? (
              <>
                d{card.damageDie}
                {card.damageBonus ? `+${card.damageBonus}` : ""} damage · +
                {card.attackBonus ?? 0} attack
              </>
            ) : (
              <>
                +{card.acBonus ?? 0} AC · +{card.hpBonus ?? 0} HP
              </>
            )}
          </div>
          {(() => {
            const srcTypeLabel = typeLabelFor(card, sourcePreset);
            if (!damageElement && !resistElement && srcTypeLabel === "") {
              return null;
            }
            return (
              <div className="flex flex-wrap gap-1">
                {srcTypeLabel !== "" && (
                  <Chip color="var(--border-2)" label={srcTypeLabel} />
                )}
                {damageElement && (
                  <TranslatedElementChip
                    element={damageElement}
                    kind="damage"
                    preset={sourcePreset}
                  />
                )}
                {resistElement && (
                  <TranslatedElementChip
                    element={resistElement}
                    kind="resist"
                    preset={sourcePreset}
                  />
                )}
              </div>
            );
          })()}
        </>
      )}
    </motion.div>
  );
}

export function AssetCard({
  card,
  selected,
  onClick,
  compact,
  targetRealm,
  targetPreset: targetPresetProp,
}: Props) {
  const isWeapon = card.slot === "weapon";

  // Decide whether a real preset hop applies. The hook itself short-
  // circuits non-hop cases and returns the input card unchanged, but
  // we still need these locally to drive the strip + label vocabularies.
  // Fall back to card.realmPreset for cards from player-deployed realms
  // that aren't in the seeded-realms map.
  const sourcePreset = card.realmPreset ?? presetForRealm(card.realm);
  const targetPreset = targetPresetProp ?? (targetRealm ? presetForRealm(targetRealm) : null);
  const isHop =
    !!sourcePreset &&
    !!targetPreset &&
    sourcePreset !== targetPreset &&
    (card.slot === "weapon" || card.slot === "armor");

  // Always call the hook (rules-of-hooks). When `isHop` is false the
  // hook resolves synchronously to the input card.
  const safeRealm = (targetRealm ?? card.realm) as `0x${string}`;
  const {
    data: translated,
    isFetching,
    isError,
  } = useTranslatedCard(card, safeRealm, targetPresetProp);

  // `translated === card` (same identity) means the hook chose passthrough;
  // we only have a real translation to display when the identity differs.
  const hasTranslation = isHop && !!translated && translated !== card;

  // The card we show on top. When the player is "in" a different
  // preset's realm and we have a successful translation, that's what
  // should headline the card — the player sees their gear in the
  // current realm's language. Otherwise (no hop, fetching, or error)
  // fall back to the source card so the UI never shows empty stats.
  const displayCard: AssetCardType = hasTranslation ? translated! : card;

  // Vocabulary for the top element chips: target preset when we're
  // showing translated stats, otherwise the source preset (or canonical
  // fallback if neither resolves).
  const topLabelPreset: Preset | null = hasTranslation
    ? targetPreset
    : sourcePreset;

  const adapter = isHop
    ? getAdapterAddress(
        card.slot as "weapon" | "armor",
        sourcePreset!,
        targetPreset!,
      )
    : ZERO_ADDR;
  const hasAdapter = adapter !== ZERO_ADDR;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="text-left rounded-lg p-3 pl-4 transition flex flex-col gap-2 border overflow-hidden relative bg-[var(--surface-1)]"
      style={{
        background: selected ? "var(--surface-2)" : undefined,
        borderColor: selected
          ? "var(--color-preset-accent)"
          : "var(--border-1)",
        borderLeft: `3px solid ${tierColor(displayCard.tier)}`,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <header className="flex items-baseline justify-between gap-2">
        <h4 className="font-semibold text-sm truncate">{displayCard.name}</h4>
        <TierChip tier={displayCard.tier} />
      </header>
      {!compact && (
        <p className="text-xs opacity-50">
          {displayCard.slot} · {displayCard.realmName}
        </p>
      )}
      <div className="text-xs opacity-80 tabular-nums">
        {isWeapon ? (
          <>
            d{displayCard.damageDie}
            {displayCard.damageBonus ? `+${displayCard.damageBonus}` : ""}{" "}
            damage · +{displayCard.attackBonus ?? 0} attack
          </>
        ) : (
          <>
            +{displayCard.acBonus ?? 0} AC · +{displayCard.hpBonus ?? 0} HP
          </>
        )}
      </div>
      {(() => {
        const topTypeLabel = typeLabelFor(displayCard, topLabelPreset);
        const showAnyChip =
          (isWeapon && displayCard.element && displayCard.element !== "none") ||
          (!isWeapon &&
            displayCard.resistElement &&
            displayCard.resistElement !== "none") ||
          topTypeLabel !== "" ||
          displayCard.catalogEffects.length > 0;
        if (!showAnyChip) return null;
        return (
        <div className="flex flex-wrap gap-1">
          {topTypeLabel !== "" && (
            <Chip color="var(--border-2)" label={topTypeLabel} />
          )}
          {isWeapon &&
            displayCard.element &&
            displayCard.element !== "none" && (
              <TranslatedElementChip
                element={displayCard.element as Exclude<Element, "none">}
                kind="damage"
                preset={topLabelPreset}
              />
            )}
          {!isWeapon &&
            displayCard.resistElement &&
            displayCard.resistElement !== "none" && (
              <TranslatedElementChip
                element={
                  displayCard.resistElement as Exclude<Element, "none">
                }
                kind="resist"
                preset={topLabelPreset}
              />
            )}
          {displayCard.catalogEffects.map((e) => (
            <EffectChip key={e.name} effect={e} />
          ))}
        </div>
        );
      })()}
      {displayCard.preseed && (
        <ProvenanceChip>Genesis liquidity</ProvenanceChip>
      )}
      {isHop && (
        <OriginalStrip
          card={card}
          sourcePreset={sourcePreset!}
          hasAdapter={hasAdapter}
          hasTranslation={hasTranslation}
          adapter={adapter}
          isFetching={isFetching}
          isError={isError}
        />
      )}
    </button>
  );
}
