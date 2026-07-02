/**
 * Pure guard logic for "Hail the Wandering Trader" — kept viem-free so it
 * unit-tests without a chain (same rationale as lib/metadata/asset-card.ts).
 * `doTraderHail` in ./index.ts feeds it chain data and enforces the verdicts.
 */

/**
 * What the trader will pay, by user-facing tier (1..5), in wei. A listing
 * priced above the appraisal gets refused — the fix for "list at a billion
 * ETH and the trader still bites". TRADER_MAX_BUY_WEI stays the absolute
 * ceiling on top (min of the two wins).
 */
export const HAIL_PRICE_CAP_WEI: Readonly<Record<number, bigint>> = {
  1: 10_000_000_000_000_000n, // 0.01 ETH
  2: 20_000_000_000_000_000n, // 0.02 ETH
  3: 50_000_000_000_000_000n, // 0.05 ETH
  4: 100_000_000_000_000_000n, // 0.1  ETH
  5: 200_000_000_000_000_000n, // 0.2  ETH
};

/** On-chain Tier is a 0-indexed uint8 enum; users see 1..5. */
export function userTierFromOnChain(rawTier: number): number {
  return Math.min(Math.max(rawTier + 1, 1), 5);
}

/** The trader's appraisal: per-tier cap bounded by the env ceiling. */
export function appraiseCapWei(userTier: number, maxBuyWei: bigint): bigint {
  const tierCap = HAIL_PRICE_CAP_WEI[userTier] ?? HAIL_PRICE_CAP_WEI[1];
  return tierCap < maxBuyWei ? tierCap : maxBuyWei;
}

export type ListedEventArgs = {
  listingId?: bigint;
  seller?: `0x${string}`;
};
export type PurchasedEventArgs = {
  listingId?: bigint;
  buyer?: `0x${string}`;
};

/**
 * "One deal per wanderer, ever" — true when the trader has already bought
 * any of this seller's listings. Derived purely from event history, so it
 * survives server restarts and cannot be reset client-side.
 */
export function traderAlreadyDealtWith(
  listed: readonly { args: ListedEventArgs }[],
  purchased: readonly { args: PurchasedEventArgs }[],
  seller: `0x${string}`,
  trader: `0x${string}`,
): boolean {
  const sellerLower = seller.toLowerCase();
  const traderLower = trader.toLowerCase();
  const sellerListingIds = new Set<string>();
  for (const ev of listed) {
    if (
      ev.args.listingId !== undefined &&
      ev.args.seller?.toLowerCase() === sellerLower
    ) {
      sellerListingIds.add(ev.args.listingId.toString());
    }
  }
  return purchased.some(
    (ev) =>
      ev.args.listingId !== undefined &&
      ev.args.buyer?.toLowerCase() === traderLower &&
      sellerListingIds.has(ev.args.listingId.toString()),
  );
}
