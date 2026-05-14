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

import type { AssetCard as AssetCardType } from "@/lib/engine/types";

type Props = {
  card: AssetCardType;
  selected?: boolean;
  onClick?: () => void;
  /** Compact mode strips the description and shortens the card. */
  compact?: boolean;
};

const TIER_LABEL: Record<number, string> = {
  1: "Common",
  2: "Uncommon",
  3: "Rare",
  4: "Epic",
  5: "Legendary",
};

export function AssetCard({ card, selected, onClick, compact }: Props) {
  const isWeapon = card.slot === "weapon";
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
            d{card.damageDie} damage · +{card.attackBonus ?? 0} attack
          </>
        ) : (
          <>
            +{card.acBonus ?? 0} AC · +{card.hpBonus ?? 0} HP
          </>
        )}
      </div>
      {card.catalogEffects.length > 0 && (
        <div className="flex flex-wrap gap-1">
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
    </button>
  );
}
