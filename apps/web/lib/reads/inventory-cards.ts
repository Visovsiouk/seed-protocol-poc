/**
 * Inventory hydration.
 *
 * `fetchInventoryCards(player)` is the inventory-drawer-shaped sibling of
 * `fetchInventory`: it returns full `AssetCard`s, not raw token balances.
 *
 * Hydration pipeline per tokenId:
 *
 *   1. `fetchInventory` to get the held tokenIds (uses the existing
 *      TransferSingle/TransferBatch event scan).
 *   2. `fetchAssetSummary` → on-chain `mintedBy`, `tokenAttributes` (tier,
 *      schemaId, metadataURI).
 *   3. `buildAssetCardFromMetadata` → pure mapping of (on-chain summary +
 *      decoded metadata JSON) into the engine-shaped `AssetCard`. Lives in
 *      `lib/metadata/asset-card.ts` so its unit tests can run without
 *      transitively importing `lib/chain.ts` (which validates
 *      `NEXT_PUBLIC_RPC_URL` at module load).
 *
 *  swap-points still open:
 *   - `realmName` is currently sourced from the metadata JSON (renderer
 *     embeds `seed_protocol.minted_by_realm_label`). The
 *     RealmRegistry-backed lookup lands in a later slice.
 *   - `preseed` is conservatively false here; the real check
 *     (`EmissionController.isPreseed(tokenId)`) isn't wired yet.
 */

import type { AssetCard } from "@/lib/engine/types";
import {
  buildAssetCardFromMetadata,
  isClearReceiptMetadata,
} from "@/lib/metadata/asset-card";
import { fetchInventory } from "./inventory";
import { fetchAssetSummary } from "./provenance";

/**
 * Hydrates the player's inventory into engine-shaped cards. Skips
 * accessory-slot assets — the PoC engine equips weapon/armor only, and
 * the drawer's tabbed UI doesn't have a third slot anyway.
 *
 * Also drops clearReceipts (boss-clear proofs). They have no slot/stats, so
 * `buildAssetCardFromMetadata` would fall back to the schemaId-parity heuristic
 * and route them into weapon/armor as phantom "d / +0 attack" entries. We
 * filter by metadata content (`isClearReceiptMetadata`) rather than schemaId so
 * receipts from *player-created* realms — which register their own clearReceipt
 * schemaIds, not the seeded ones — are dropped too. The receipt tokens are
 * still tracked separately via `useBossClears`.
 */
export async function fetchInventoryCards(
  player: `0x${string}`,
): Promise<AssetCard[]> {
  const balances = await fetchInventory(player);
  if (balances.length === 0) return [];

  const summaries = await Promise.all(
    balances.map((b) => fetchAssetSummary(b.tokenId)),
  );

  const cards: AssetCard[] = [];
  for (const summary of summaries) {
    if (isClearReceiptMetadata(summary.metadataURI)) continue;
    const card = buildAssetCardFromMetadata({
      tokenId: summary.tokenId,
      tier: summary.tier,
      schemaId: summary.schemaId,
      metadataURI: summary.metadataURI,
      mintedByRealm: summary.mintedByRealm,
    });
    if (card.slot === "accessory") continue;
    cards.push(card);
  }
  return cards;
}
