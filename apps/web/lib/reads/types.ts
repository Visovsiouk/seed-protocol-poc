/**
 * On-chain summary types. These are the shapes the UI binds
 * against — the read layer assembles them from a mix of getLogs + storage reads.
 *
 * Engine-internal types live in lib/engine/types.ts. When that
 * lands, AssetCard there will mirror the asset fields here; for we
 * only need what the bazaar renders.
 */

export type Tier = 1 | 2 | 3 | 4 | 5;

export type AssetSummary = {
  tokenId: bigint;
  tier: Tier;
  schemaId: number;
  metadataURI: string;
  mintedByRealm: `0x${string}`;
};

export type ListingSummary = {
  id: bigint;
  seller: `0x${string}`;
  tokenId: bigint;
  amount: bigint;
  price: bigint;
  active: boolean;
  /**
   * Pre-seed listings = the dev-wallet-listed Genesis bazaar inventory
   * from script/SeedBazaar.s.sol. Computed off-chain by
   * comparing `seller` to the configured dev wallet address.
   */
  preseed: boolean;
  /** Block the listing was created at — used for sort order. */
  blockNumber: bigint;
  asset?: AssetSummary;
};

export type SaleSummary = {
  listingId: bigint;
  buyer: `0x${string}`;
  price: bigint;
  blockNumber: bigint;
  txHash: `0x${string}`;
};
