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
};

export function EscrowTray({ escrow, preset, realm, realmName }: Props) {
  // Highest tier first; within a tier, newest find leads (descending index).
  const cards = useMemo(
    () =>
      escrow
        .map((entry, i) => ({
          card: lootRollToMockCard(entry.loot, preset, realm, realmName),
          i,
        }))
        .sort((a, b) => b.card.tier - a.card.tier || b.i - a.i)
        .map((e) => e.card),
    [escrow, preset, realm, realmName],
  );

  if (cards.length === 0) return null;

  return (
    <Panel
      as="section"
      tone="glass-2"
      glow="accent"
      aria-label="Carried findings"
      className="flex h-full min-h-0 flex-col gap-3 p-4"
    >
      <header className="flex items-baseline justify-between gap-2">
        <Stamp tone="accent">Carried findings</Stamp>
        <span className="text-[11px] tabular-nums opacity-70">
          {cards.length} unminted
        </span>
      </header>
      <p className="text-xs opacity-70 leading-relaxed">
        Not yours yet. These bank to your wallet when you extract or clear the
        boss — fall before then and they&apos;re gone.
      </p>
      {/*
        The list fills the remaining height of the fixed focal slot and
        scrolls internally, so the tray never grows as findings stack up
        over a run — a growing panel here would push the Descend/Extract
        buttons + HUD down on every drop. Filling (not capping) keeps the
        tray the exact height of the slot the stage vacated, so swapping
        stage↔tray moves nothing below it.

        Sparse runs (one or two findings) used to orphan a single narrow
        card in the top-left of a tall, mostly-empty box. The scroll
        container now `safe`-centres its content vertically — a lone card
        sits in the middle of the slot, but the moment findings overflow
        the height the keyword falls back to start so every card stays
        reachable by scroll. `auto-fit` (not auto-fill) collapses the empty
        column tracks so a single finding spans the full width instead of
        hugging the left at 11rem.
      */}
      <ul className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] content-start gap-2 overflow-y-auto pr-1">
        {cards.map((card, i) => (
          <li key={`${card.tokenId.toString()}-${i}`}>
            <AssetCard card={card} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}
