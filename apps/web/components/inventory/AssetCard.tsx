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
 * `selected` is presentational only — equip flow is driven by the
 * parent (`<InventoryDrawer/>`).
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

const TIER_LABEL: Record<number, string> = {
  1: "Common",
  2: "Uncommon",
  3: "Rare",
  4: "Epic",
  5: "Legendary",
};

/** Per-element accent colours for the inline element chip. Kept in this
 * component (rather than globals.css) because the engine itself never
 * needs to know about presentation — these are pure UI tokens.
 *
 * The three preset vocabularies share enum indices 1..5,
 * so all three names at a given index share a hue:
 *   1: fire / plasma / incendiary    → ember
 *   2: ice / cryo / cryogenic        → frost
 *   3: shock / ion / emp             → spark
 *   4: holy / photon / laser         → gold-light
 *   5: unholy / void / nano          → violet
 */
const EMBER = { bg: "rgba(255,120,40,0.18)", fg: "#ffb38a" };
const FROST = { bg: "rgba(120,200,255,0.18)", fg: "#a8dcff" };
const SPARK = { bg: "rgba(255,230,80,0.18)", fg: "#ffeb8a" };
const GOLD_LIGHT = { bg: "rgba(255,220,140,0.18)", fg: "#ffd97a" };
const VIOLET = { bg: "rgba(180,120,255,0.18)", fg: "#caa6ff" };
const ELEMENT_COLOR: Record<string, { bg: string; fg: string }> = {
  fire: EMBER, plasma: EMBER, incendiary: EMBER,
  ice: FROST, cryo: FROST, cryogenic: FROST,
  shock: SPARK, ion: SPARK, emp: SPARK,
  holy: GOLD_LIGHT, photon: GOLD_LIGHT, laser: GOLD_LIGHT,
  unholy: VIOLET, void: VIOLET, nano: VIOLET,
};
const ELEMENT_COLOR_FALLBACK = { bg: "rgba(180,180,180,0.18)", fg: "#cccccc" };

function ElementChip({
  element,
  kind,
  preset,
}: {
  element: Exclude<Element, "none">;
  kind: "damage" | "resist";
  /**
   * The preset whose vocabulary should label the element. Maps the
   * canonical enum onto the preset's local name (e.g. holy → "laser"
   * in cyberpunk). `null` falls back to the canonical name. Colour
   * stays element-keyed so the player still reads the same hue across
   * realms.
   */
  preset: Preset | null;
}) {
  const c = ELEMENT_COLOR[element] ?? ELEMENT_COLOR_FALLBACK;
  const label = useElementLabel(element, preset);
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider font-semibold"
      style={{
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.fg}55`,
      }}
    >
      {kind === "damage" ? `${label} dmg` : `resists ${label}`}
    </span>
  );
}

function shortAddr(addr: `0x${string}`): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Neutral chip for the schema-native TYPE label. Shows the preset's
 * tier-ladder string ("Stiletto", "Switchblade", "Plasma Cannon", …)
 * — the per-realm "what it's called here" alongside the asset's
 * constant atmospheric name. Colour is intentionally generic so the
 * element chip remains the eye-catching one.
 */
function TypeChip({ label }: { label: string }) {
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider font-semibold"
      style={{
        background: "rgba(220,220,220,0.10)",
        color: "#dddddd",
        border: "1px solid rgba(220,220,220,0.25)",
      }}
    >
      {label}
    </span>
  );
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
  const damageElement =
    isWeapon && card.element && card.element !== "none"
      ? (card.element as Exclude<Element, "none">)
      : null;
  const resistElement =
    !isWeapon && card.resistElement && card.resistElement !== "none"
      ? (card.resistElement as Exclude<Element, "none">)
      : null;

  return (
    <div
      className="mt-1 rounded-sm p-2 flex flex-col gap-1"
      style={{
        background: "rgba(120,200,255,0.06)",
        border: "1px dashed rgba(120,200,255,0.35)",
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span
          className="text-[10px] uppercase tracking-wider"
          style={{ color: "#a8dcff" }}
        >
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
        <span className="text-[10px]" style={{ color: "#ffb38a" }}>
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
                {srcTypeLabel !== "" && <TypeChip label={srcTypeLabel} />}
                {damageElement && (
                  <ElementChip
                    element={damageElement}
                    kind="damage"
                    preset={sourcePreset}
                  />
                )}
                {resistElement && (
                  <ElementChip
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
    </div>
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
      className="text-left rounded-md p-3 transition flex flex-col gap-2"
      style={{
        background: selected
          ? "rgba(255,255,255,0.06)"
          : "rgba(255,255,255,0.02)",
        border: selected
          ? "1px solid var(--color-preset-accent)"
          : "1px solid rgba(255,255,255,0.08)",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <header className="flex items-baseline justify-between gap-2">
        <h4 className="font-semibold text-sm truncate">{displayCard.name}</h4>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider"
          style={{
            background: "var(--color-preset-accent)",
            color: "var(--color-preset-bg)",
          }}
        >
          T{displayCard.tier}
        </span>
      </header>
      {!compact && (
        <p className="text-xs opacity-50">
          {TIER_LABEL[displayCard.tier]} · {displayCard.slot} ·{" "}
          {displayCard.realmName}
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
          {topTypeLabel !== "" && <TypeChip label={topTypeLabel} />}
          {isWeapon &&
            displayCard.element &&
            displayCard.element !== "none" && (
              <ElementChip
                element={displayCard.element as Exclude<Element, "none">}
                kind="damage"
                preset={topLabelPreset}
              />
            )}
          {!isWeapon &&
            displayCard.resistElement &&
            displayCard.resistElement !== "none" && (
              <ElementChip
                element={
                  displayCard.resistElement as Exclude<Element, "none">
                }
                kind="resist"
                preset={topLabelPreset}
              />
            )}
          {displayCard.catalogEffects.map((e) => (
            <span
              key={e.name}
              className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider font-semibold"
              style={{
                background: "rgba(45,212,191,0.10)",
                color: "#5eead4",
                border: "1px solid rgba(45,212,191,0.30)",
              }}
            >
              {e.name.replace(/_/g, " ")} {e.value}
            </span>
          ))}
        </div>
        );
      })()}
      {displayCard.preseed && (
        <span className="text-[10px] opacity-50 uppercase tracking-wider">
          Genesis liquidity
        </span>
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
