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
import type { LootRoll, Preset } from "@/lib/engine/types";
import { lootRollToMockCard } from "@/lib/engine/runtime";
import { AssetCard } from "@/components/inventory/AssetCard";

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
  onMint: () => Promise<void> | void;
  onSkip: () => void;
};

export function LootMintPrompt({
  loot,
  preset,
  realm,
  realmName,
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
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleMint}
          disabled={minting}
          className="rounded-md px-4 py-2 text-sm font-medium transition disabled:opacity-50"
          style={{
            background: "var(--color-preset-accent)",
            color: "var(--color-preset-bg)",
          }}
        >
          {minting ? "Minting…" : "Mint and equip"}
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={minting}
          className="rounded-md px-4 py-2 text-sm transition disabled:opacity-50"
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "var(--color-preset-fg)",
          }}
        >
          Skip
        </button>
      </div>
    </section>
  );
}
