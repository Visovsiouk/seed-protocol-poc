"use client";

import { Chip } from "@/components/ui";

/**
 * Distinguishes dev-wallet-listed Genesis bazaar inventory from
 * player-listed assets. Routed through the kit `Chip`
 * so both states share the loot-pill shape; the two stable provenance
 * hues (genesis violet, player-listed cyan) are intentionally realm-
 * independent so the signal reads the same in every preset.
 */
export function PreseedBadge({ preseed }: { preseed: boolean }) {
  return preseed ? (
    <Chip color="#7c5cff" label="Genesis liquidity" />
  ) : (
    <Chip color="#4ad8ff" label="Player-listed" />
  );
}
