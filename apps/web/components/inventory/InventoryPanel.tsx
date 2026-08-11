"use client";

/**
 * InventoryPanel — the body of the floating Inventory popover (see
 * <CornerDock/>). A view-only browser of the player's owned gear, grouped by
 * slot and styled like the pre-descent loadout picker (LoadoutStaging) so the
 * two read as the same "here's your gear" surface.
 *
 * View-only by design: equipping happens once at LoadoutStaging (gear is locked
 * for the whole delve), so cards here carry no `onClick` — <AssetCard/> renders
 * them disabled (non-interactive) but visually unchanged. No `targetRealm` is
 * passed, so cards show their native form with no translation strip, matching
 * the loadout picker.
 */

import { useAccount } from "wagmi";
import type { AssetCard as AssetCardType } from "@/lib/engine/types";
import { useInventoryCards } from "@/lib/reads/hooks";
import { AssetCard } from "@/components/inventory/AssetCard";
import { Rule, Stamp } from "@/components/ui";

function Section({
  label,
  cards,
}: {
  label: string;
  cards: readonly AssetCardType[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-xs uppercase tracking-wider opacity-65">{label}</h4>
      {cards.length === 0 ? (
        <p className="text-xs opacity-60">No {label.toLowerCase()} owned yet.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-2">
          {cards.map((c) => (
            <AssetCard key={c.tokenId.toString()} card={c} />
          ))}
        </div>
      )}
    </div>
  );
}

export function InventoryPanel() {
  const { address } = useAccount();
  const inv = useInventoryCards(address);

  const cards = inv.data ?? [];
  // Highest tier first so the rarest gear leads each section (matches the
  // loadout picker and the drawer sort).
  const weapons = cards
    .filter((c) => c.slot === "weapon")
    .sort((a, b) => b.tier - a.tier);
  const armors = cards
    .filter((c) => c.slot === "armor")
    .sort((a, b) => b.tier - a.tier);

  let body: React.ReactNode;
  if (!address) {
    body = (
      <p className="text-xs leading-relaxed opacity-70">
        Connect your wallet to view your gear.
      </p>
    );
  } else if (inv.isLoading) {
    body = (
      <p className="text-xs leading-relaxed opacity-70">Reading your vault…</p>
    );
  } else if (cards.length === 0) {
    body = (
      <p className="text-xs leading-relaxed opacity-70">
        No gear yet — findings you keep after a delve appear here.
      </p>
    );
  } else {
    body = (
      <>
        <Section label="Weapon" cards={weapons} />
        <Section label="Armor" cards={armors} />
      </>
    );
  }

  return (
    <>
      <header className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <Stamp tone="accent">Inventory</Stamp>
          {address && !inv.isLoading && (
            <span
              className="font-mono text-sm tabular-nums opacity-70"
              aria-label={`${cards.length} items owned`}
            >
              {cards.length}
            </span>
          )}
        </div>
        <Rule />
        <p className="text-xs leading-relaxed opacity-70">
          The gear you carry between realms. Choose what descends with you at the
          doorway — here you can look it over any time.
        </p>
      </header>
      {body}
    </>
  );
}
