import { universalAssetAbi } from "@abis/generated";
import { getReadClient } from "./client";
import { getAddress } from "@/lib/contracts/addresses";
import type { AssetSummary, Tier } from "./types";

/**
 * Asset provenance reads.
 *
 * `mintedBy(tokenId)` → realm address that minted the asset (perpetual royalty).
 * `tokenAttributes(tokenId)` → { tier, extensionSchemaId, metadataURI }.
 *
 * Batched via multicall when possible (viem's `multicall` action does this
 * automatically when the public client is configured with a multicall3
 * address; anvil ships with multicall3 at the canonical
 * 0xcA11bde05977b3631167028862bE2a173976CA11). Falls back to parallel
 * individual reads otherwise.
 */

const ASSET = () => getAddress("universalAsset");

export async function fetchAssetSummary(
  tokenId: bigint,
): Promise<AssetSummary> {
  const client = getReadClient();
  const address = ASSET();

  const [mintedBy, attrs] = await Promise.all([
    client.readContract({
      address,
      abi: universalAssetAbi,
      functionName: "mintedBy",
      args: [tokenId],
    }),
    client.readContract({
      address,
      abi: universalAssetAbi,
      functionName: "tokenAttributes",
      args: [tokenId],
    }),
  ]);

  // tokenAttributes returns a tuple: (tier uint8, extensionSchemaId uint256, metadataURI string)
  const [tier, schemaId, metadataURI] = attrs as readonly [
    number,
    bigint,
    string,
  ];

  return {
    tokenId,
    tier: clampTier(tier),
    schemaId: Number(schemaId),
    metadataURI,
    mintedByRealm: mintedBy as `0x${string}`,
  };
}

export async function fetchAssetSummaries(
  tokenIds: bigint[],
): Promise<Map<string, AssetSummary>> {
  // Dedupe — listings may reference the same token across multiple rows.
  const unique = Array.from(new Set(tokenIds.map((t) => t.toString()))).map((s) =>
    BigInt(s),
  );
  const results = await Promise.all(unique.map(fetchAssetSummary));
  const map = new Map<string, AssetSummary>();
  for (const r of results) map.set(r.tokenId.toString(), r);
  return map;
}

function clampTier(t: number): Tier {
  // SeedTypes.Tier is a uint8 enum 0..4 on-chain; spec exposes 1..5 to users.
  // Shift by +1 so on-chain T0 → user-facing T1. Adjust here if the contract
  // already 1-indexes (verify against tests if behavior looks off).
  const shifted = t + 1;
  if (shifted >= 1 && shifted <= 5) return shifted as Tier;
  return 1;
}
