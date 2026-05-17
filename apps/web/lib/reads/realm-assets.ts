import { ecosystemTemplateAbi } from "@abis/generated";
import { getReadClient } from "./client";
import { fetchAssetSummary } from "./provenance";
import { buildAssetCardFromMetadata } from "@/lib/metadata/asset-card";
import { getSeededSchemaIds } from "@/lib/contracts/seeded-realms";
import type { AssetCard, Preset } from "@/lib/engine/types";

/**
 * Per-realm assets reader.
 *
 * Scans the realm clone's `AssetMinted` events, dedupes by tokenId
 * (keeping the most recent mint), drops clearReceipts, and hydrates
 * the remaining tokens into engine-shaped `AssetCard`s via the same
 * `buildAssetCardFromMetadata` path the inventory drawer uses.
 *
 * This is "assets the realm has *issued*", not "assets currently
 * held". Two reasons that matters: (1) some may have been sold/
 * traded and the dashboard still wants to show them as part of the
 * realm's catalog; (2) hydration is the canonical metadata read,
 * which renders correctly across realm hops via the adapter strip.
 */

export async function fetchRealmAssets(args: {
  realm: `0x${string}`;
  preset: Preset | null;
  scanLimit?: number;
  cardLimit?: number;
}): Promise<AssetCard[]> {
  const { realm, preset, scanLimit = 200, cardLimit = 24 } = args;
  const client = getReadClient();

  const events = await client.getContractEvents({
    address: realm,
    abi: ecosystemTemplateAbi,
    eventName: "AssetMinted",
    fromBlock: 0n,
    toBlock: "latest",
  });
  if (events.length === 0) return [];

  // Newest first; cap before hydration.
  const sorted = [...events].sort((a, b) =>
    b.blockNumber === a.blockNumber
      ? b.logIndex - a.logIndex
      : b.blockNumber > a.blockNumber
        ? 1
        : -1,
  );
  const window = sorted.slice(0, scanLimit);

  // Dedupe by tokenId, keeping the first (newest) appearance.
  const seen = new Set<string>();
  const uniqueTokenIds: bigint[] = [];
  for (const ev of window) {
    const a = ev.args as { tokenId?: bigint };
    if (a.tokenId === undefined) continue;
    const key = a.tokenId.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueTokenIds.push(a.tokenId);
    if (uniqueTokenIds.length >= cardLimit) break;
  }

  const clearReceiptSchemaId = preset
    ? Number(getSeededSchemaIds(preset).clearReceipt)
    : -1;

  const cards = await Promise.all(
    uniqueTokenIds.map(async (tokenId): Promise<AssetCard | null> => {
      try {
        const summary = await fetchAssetSummary(tokenId);
        if (summary.schemaId === clearReceiptSchemaId) return null;
        const card = buildAssetCardFromMetadata({
          tokenId: summary.tokenId,
          tier: summary.tier,
          schemaId: summary.schemaId,
          metadataURI: summary.metadataURI,
          mintedByRealm: summary.mintedByRealm,
        });
        if (card.slot === "accessory") return null;
        return card;
      } catch {
        // Asset hydration failed (token may have no metadata, or
        // metadata isn't our base64-JSON shape). Drop rather than
        // surface a half-rendered card.
        return null;
      }
    }),
  );

  return cards.filter((c): c is AssetCard => c !== null);
}
