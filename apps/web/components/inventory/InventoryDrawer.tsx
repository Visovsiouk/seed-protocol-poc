"use client";

/**
 * Side drawer holding the player's owned assets, split by slot. Clicking
 * a card equips it (replacing whatever was in that slot). Equip is purely
 * local UI state — no transaction ("Equipping is a pure UI
 * action").
 *
 * Accessibility: the open drawer is a modal dialog
 * focus moves into it on open, Tab/Shift-Tab cycle inside it, Escape
 * closes, and focus is restored to the trigger on close.
 *
 *  note: the drawer takes its `inventory` prop from the page
 * during that's the local accumulator the page grows as runs
 * bank their escrow. swaps it for the real on-chain
 * `fetchInventory` read.
 */

import { useEffect, useRef, useState } from "react";
import type { AssetCard as AssetCardType, Preset, Slot } from "@/lib/engine/types";
import { AssetCard } from "./AssetCard";

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

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
  const asideRef = useRef<HTMLElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Focus trap + restore. Captures the trigger on open, moves focus into
  // the drawer, cycles Tab within it, closes on Escape, and returns focus
  // to the trigger on close. Gated on `open` so it's inert while hidden.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const aside = asideRef.current;
    const first = aside?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !aside) return;
      const nodes = Array.from(aside.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (nodes.length === 0) return;
      const firstEl = nodes[0]!;
      const lastEl = nodes[nodes.length - 1]!;
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      restoreFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  const weapons = inventory.filter((c) => c.slot === "weapon");
  const armors = inventory.filter((c) => c.slot === "armor");

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex"
      onClick={onClose}
    >
      <div className="flex-1 bg-[color-mix(in_oklab,var(--color-preset-bg)_55%,#000_55%)]" />
      <aside
        ref={asideRef}
        role="dialog"
        aria-modal="true"
        aria-label="Inventory"
        className="w-[360px] max-w-[90vw] h-full overflow-y-auto p-5 flex flex-col gap-4 bg-[var(--color-preset-bg)] border-l border-[var(--border-1)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-baseline justify-between">
          <h3 className="text-lg font-semibold font-[family-name:var(--font-display)]">
            Inventory
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-sm opacity-60 hover:opacity-100"
          >
            Close
          </button>
        </header>
        <div
          role="tablist"
          aria-label="Inventory slot"
          className="flex gap-2 border-b border-[var(--border-1)] pb-2"
        >
          {(["weapon", "armor"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
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
