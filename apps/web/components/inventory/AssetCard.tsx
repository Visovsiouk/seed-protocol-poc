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
  elementLabel,
  presetForRealm,
  useTranslatedCard,
} from "@/lib/contracts/adapters";
import { getAdapterAddress } from "@/lib/contracts/seeded-adapters";

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
 * needs to know about presentation — these are pure UI tokens. */
const ELEMENT_COLOR: Record<Exclude<Element, "none">, { bg: string; fg: string }> = {
  fire: { bg: "rgba(255,120,40,0.18)", fg: "#ffb38a" },
  ice: { bg: "rgba(120,200,255,0.18)", fg: "#a8dcff" },
  shock: { bg: "rgba(255,230,80,0.18)", fg: "#ffeb8a" },
  holy: { bg: "rgba(255,220,140,0.18)", fg: "#ffd97a" },
  unholy: { bg: "rgba(180,120,255,0.18)", fg: "#caa6ff" },
};

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
  const c = ELEMENT_COLOR[element];
  const label = elementLabel(element, preset);
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
 * Strip rendered below the native stats when a card is foreign to the
 * active realm. Calls `useTranslatedCard` (cached by tokenId+targetRealm)
 * so flipping back to the same drawer view doesn't re-hit the chain.
 */
function TranslationStrip({
  card,
  targetRealm,
}: {
  card: AssetCardType;
  targetRealm: `0x${string}`;
}) {
  const sourcePreset = presetForRealm(card.realm);
  const targetPreset = presetForRealm(targetRealm);
  const {
    data: translated,
    isFetching,
    isError,
  } = useTranslatedCard(card, targetRealm);

  // Only show the strip when there is an actual preset hop to translate.
  if (!sourcePreset || !targetPreset) return null;
  if (sourcePreset === targetPreset) return null;
  if (card.slot !== "weapon" && card.slot !== "armor") return null;

  const adapter = getAdapterAddress(card.slot, sourcePreset, targetPreset);
  const hasAdapter = adapter !== "0x0000000000000000000000000000000000000000";
  const isWeapon = card.slot === "weapon";
  const tr = translated && translated !== card ? translated : null;

  const translatedDamageElement =
    isWeapon && tr?.element && tr.element !== "none"
      ? (tr.element as Exclude<Element, "none">)
      : null;
  const translatedResistElement =
    !isWeapon && tr?.resistElement && tr.resistElement !== "none"
      ? (tr.resistElement as Exclude<Element, "none">)
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
          Translated for {targetPreset}
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
      ) : !tr ? (
        <span className="text-[10px] opacity-60">
          {isFetching ? "Translating…" : "Awaiting adapter read."}
        </span>
      ) : (
        <>
          <div className="text-xs tabular-nums opacity-90">
            {isWeapon ? (
              <>
                d{tr.damageDie}
                {tr.damageBonus ? `+${tr.damageBonus}` : ""} damage · +
                {tr.attackBonus ?? 0} attack
              </>
            ) : (
              <>
                +{tr.acBonus ?? 0} AC · +{tr.hpBonus ?? 0} HP
              </>
            )}
          </div>
          {(translatedDamageElement || translatedResistElement) && (
            <div className="flex flex-wrap gap-1">
              {translatedDamageElement && (
                <ElementChip
                  element={translatedDamageElement}
                  kind="damage"
                  preset={targetPreset}
                />
              )}
              {translatedResistElement && (
                <ElementChip
                  element={translatedResistElement}
                  kind="resist"
                  preset={targetPreset}
                />
              )}
            </div>
          )}
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
}: Props) {
  const isWeapon = card.slot === "weapon";
  // Display preset for the element chips on the native stats row. The
  // canonical enum is shared across presets — only the label flavor
  // changes — so we prefer the active realm's vocabulary when we know
  // it (the player is "in" that realm and shouldn't see "holy" in a
  // cyberpunk drawer). Fall back to the card's source preset; if
  // neither resolves (e.g. starter gear from an unseeded realm) the
  // chip falls back to the canonical name via `elementLabel`.
  const labelPreset: Preset | null =
    (targetRealm && presetForRealm(targetRealm)) ||
    presetForRealm(card.realm);
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
        <h4 className="font-semibold text-sm truncate">{card.name}</h4>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider"
          style={{
            background: "var(--color-preset-accent)",
            color: "var(--color-preset-bg)",
          }}
        >
          T{card.tier}
        </span>
      </header>
      {!compact && (
        <p className="text-xs opacity-50">
          {TIER_LABEL[card.tier]} · {card.slot} · {card.realmName}
        </p>
      )}
      <div className="text-xs opacity-80 tabular-nums">
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
      {((isWeapon && card.element && card.element !== "none") ||
        (!isWeapon && card.resistElement && card.resistElement !== "none") ||
        card.catalogEffects.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {isWeapon && card.element && card.element !== "none" && (
            <ElementChip
              element={card.element as Exclude<Element, "none">}
              kind="damage"
              preset={labelPreset}
            />
          )}
          {!isWeapon && card.resistElement && card.resistElement !== "none" && (
            <ElementChip
              element={card.resistElement as Exclude<Element, "none">}
              kind="resist"
              preset={labelPreset}
            />
          )}
          {card.catalogEffects.map((e) => (
            <span
              key={e.name}
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              {e.name.replace(/_/g, " ")} {e.value}
            </span>
          ))}
        </div>
      )}
      {card.preseed && (
        <span className="text-[10px] opacity-50 uppercase tracking-wider">
          Genesis liquidity
        </span>
      )}
      {targetRealm && targetRealm.toLowerCase() !== card.realm.toLowerCase() && (
        <TranslationStrip card={card} targetRealm={targetRealm} />
      )}
    </button>
  );
}
