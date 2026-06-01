"use client";

/**
 * Delve escrow tray. Shows the findings the player is
 * carrying *unminted* this run — banked only on Extract or a boss clear,
 * forfeited on a permadeath fall. Replaces the per-room `LootMintPrompt`:
 * loot no longer mints the moment it drops, so the tray is the running
 * record of what's at stake.
 *
 * Each escrowed `LootRoll` is previewed as the exact `AssetCard` the
 * engine produces post-mint (`lootRollToMockCard`), so the tray reads in
 * the same visual language as the inventory drawer. The most recent find
 * is rendered first so the reveal beat lands on the freshest drop.
 */

import { useMemo } from "react";
import type { EscrowEntry, Preset } from "@/lib/engine/types";
import { lootRollToMockCard } from "@/lib/engine/runtime";
import { AssetCard } from "@/components/inventory/AssetCard";
import { Panel, Stamp } from "@/components/ui";

type Props = {
  escrow: readonly EscrowEntry[];
  /** Preset whose vocabulary labels the element / archetype fields. */
  preset: Preset;
  /** Realm the findings would mint under. */
  realm: `0x${string}`;
  /** Human-readable realm name (shown on the AssetCard subline). */
  realmName: string;
  /**
   * Whether these findings are forfeited on death. `true` for canonical
   * permadeath realms (the stake is real); `false` for seed-mercy starter
   * realms where the escrow survives the rewind. Drives the framing
   * copy only — the engine owns the actual discard/preserve behaviour.
   */
  atRisk: boolean;
};

export function EscrowTray({ escrow, preset, realm, realmName, atRisk }: Props) {
  // Newest find first — the reveal beat should land on what just dropped.
  const cards = useMemo(
    () =>
      escrow
        .map((entry) => lootRollToMockCard(entry.loot, preset, realm, realmName))
        .reverse(),
    [escrow, preset, realm, realmName],
  );

  if (cards.length === 0) return null;

  return (
    <Panel
      as="section"
      tone="glass-2"
      glow="accent"
      aria-label="Carried findings"
      className="flex flex-col gap-3 p-4"
    >
      <header className="flex items-baseline justify-between gap-2">
        <Stamp tone="accent">Carried findings</Stamp>
        <span className="text-[11px] tabular-nums opacity-70">
          {cards.length} unminted
        </span>
      </header>
      <p className="text-xs opacity-70 leading-relaxed">
        {atRisk
          ? "Not yours yet. These bank to your wallet when you extract or clear the boss — fall before then and they're gone."
          : "Held safely while you learn the delve. They bank when you extract or clear the boss, and survive a fall here."}
      </p>
      <ul className="flex flex-col gap-2">
        {cards.map((card, i) => (
          <li key={`${card.tokenId.toString()}-${i}`}>
            <AssetCard card={card} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}
