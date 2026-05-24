"use client";

/**
 * Side drawer holding the player's owned assets, split by slot. Clicking
 * a card equips it (replacing whatever was in that slot). Equip is purely
 * local UI state — no transaction ("Equipping is a pure UI
 * action").
 *
 *  note: the drawer takes its `inventory` prop from the page
 * during that's the engine-side `pendingLoot` accumulated across
 * runs. swaps it for the real on-chain `fetchInventory` read.
 */

import { useState } from "react";
import type { AssetCard as AssetCardType, Preset, Slot } from "@/lib/engine/types";
import { AssetCard } from "./AssetCard";

type Equipped = {
  weapon?: AssetCardType;
  armor?: AssetCardType;
  accessory?: AssetCardType;
};

type Props = {
  open: boolean;
  onClose: () => void;
  inventory: readonly AssetCardType[];
  equipped: Equipped;
  onEquip: (slot: Exclude<Slot, "accessory">, card: AssetCardType) => void;
  /**
   * The realm currently being played. Forwarded to each `<AssetCard/>` so
   * foreign-realm cards can render their translation strip. Optional —
   * screens without a single "active realm" can omit it.
   */
  activeRealm?: `0x${string}`;
  /**
   * Preset for `activeRealm`. Required when the realm is a player-deployed
   * realm not in the seeded-realms map so `<AssetCard/>` can resolve the
   * translation hop without a seeded-realms lookup.
   */
  activePreset?: Preset;
};

function Section({
  label,
  cards,
  equippedTokenId,
  onEquip,
  activeRealm,
  activePreset,
}: {
  label: string;
  cards: readonly AssetCardType[];
  equippedTokenId?: bigint;
  onEquip: (card: AssetCardType) => void;
  activeRealm?: `0x${string}`;
  activePreset?: Preset;
}) {
  if (cards.length === 0) {
    return (
      <div className="flex flex-col gap-1">
        <h4 className="text-xs uppercase tracking-wider opacity-50">{label}</h4>
        <p className="text-xs opacity-40">No {label.toLowerCase()} owned yet.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-xs uppercase tracking-wider opacity-50">{label}</h4>
      <div className="grid gap-2">
        {cards.map((c) => (
          <AssetCard
            key={c.tokenId.toString()}
            card={c}
            selected={c.tokenId === equippedTokenId}
            onClick={() => onEquip(c)}
            targetRealm={activeRealm}
            targetPreset={activePreset}
          />
        ))}
      </div>
    </div>
  );
}

export function InventoryDrawer({
  open,
  onClose,
  inventory,
  equipped,
  onEquip,
  activeRealm,
  activePreset,
}: Props) {
  const [tab, setTab] = useState<"weapon" | "armor">("weapon");
  const weapons = inventory.filter((c) => c.slot === "weapon");
  const armors = inventory.filter((c) => c.slot === "armor");

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex"
      onClick={onClose}
      role="dialog"
      aria-label="Inventory"
    >
      <div className="flex-1" style={{ background: "rgba(0,0,0,0.5)" }} />
      <aside
        className="w-[360px] max-w-[90vw] h-full overflow-y-auto p-5 flex flex-col gap-4"
        style={{
          background: "var(--color-preset-bg)",
          borderLeft: "1px solid rgba(255,255,255,0.1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-baseline justify-between">
          <h3 className="text-lg font-semibold">Inventory</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-sm opacity-60 hover:opacity-100"
          >
            Close
          </button>
        </header>
        <div className="flex gap-2 border-b border-white/10 pb-2">
          {(["weapon", "armor"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="text-xs uppercase tracking-wider px-2 py-1 rounded transition"
              style={{
                background:
                  tab === t ? "var(--color-preset-accent)" : "transparent",
                color: tab === t ? "var(--color-preset-bg)" : "inherit",
              }}
            >
              {t}
            </button>
          ))}
        </div>
        {tab === "weapon" ? (
          <Section
            label="Weapons"
            cards={weapons}
            equippedTokenId={equipped.weapon?.tokenId}
            onEquip={(c) => onEquip("weapon", c)}
            activeRealm={activeRealm}
            activePreset={activePreset}
          />
        ) : (
          <Section
            label="Armor"
            cards={armors}
            equippedTokenId={equipped.armor?.tokenId}
            onEquip={(c) => onEquip("armor", c)}
            activeRealm={activeRealm}
            activePreset={activePreset}
          />
        )}
      </aside>
    </div>
  );
}
