import { ecosystemTemplateAbi } from "@abis/generated";
import type { Tier } from "@/lib/engine/types";

/**
 * Per-realm earned tier (replaces the old global count-driven curve).
 *
 * A player realm's loot ceiling is earned by *distinct people beating it*,
 * not by how many realms exist. Every player realm starts at T3 and climbs:
 *
 *   distinctClearers < 20  → T3
 *   distinctClearers < 50  → T4
 *   distinctClearers ≥ 50  → T5
 *
 * "distinctClearer" = a unique wallet that holds a clearReceipt for the
 * realm. clearReceipts are real, delegate-signed on-chain mints (see
 * `/api/realm/boss-cleared`), and deduping by wallet means one player
 * farming clears counts once — so tier tracks genuine reach + challenge.
 */
export function playerRealmMaxTier(distinctClearers: number): Tier {
  if (distinctClearers >= 50) return 5;
  if (distinctClearers >= 20) return 4;
  return 3;
}

export type RealmTierProgress = {
  maxTier: Tier;
  distinctClearers: number;
  /** Clearer count that unlocks the next tier, or null when at T5. */
  nextTierAt: number | null;
};

/** Derives display-ready tier progress from a distinct-clearer count. */
export function realmTierProgress(distinctClearers: number): RealmTierProgress {
  const maxTier = playerRealmMaxTier(distinctClearers);
  const nextTierAt = maxTier >= 5 ? null : maxTier >= 4 ? 50 : 20;
  return { maxTier, distinctClearers, nextTierAt };
}

/**
 * Short TTL memo so the per-realm `AssetMinted` scan doesn't re-run on
 * every mint/list call in a burst. The loot cap reads through this, so the
 * window is deliberately small — a fresh clearer should lift the realm
 * promptly, not after a long cache life.
 */
const CLEARER_TTL_MS = 15_000;
const clearerCache = new Map<string, { value: number; expiry: number }>();

/**
 * Counts distinct wallets holding a clearReceipt for `realm`. Scans the
 * realm clone's full `AssetMinted` history (UNCAPPED — the loot cap must be
 * accurate; do not reuse realm-stats' `scanLimit` window) and hydrates each
 * token's schemaId to keep only clearReceipt mints.
 */
export async function countDistinctClearers(args: {
  realm: `0x${string}`;
  clearReceiptSchemaId: bigint;
}): Promise<number> {
  const { realm, clearReceiptSchemaId } = args;
  const key = `${realm.toLowerCase()}:${clearReceiptSchemaId.toString()}`;
  const now = Date.now();
  const cached = clearerCache.get(key);
  if (cached && cached.expiry > now) return cached.value;

  // Lazy-loaded so the pure tier curve (playerRealmMaxTier / realmTierProgress)
  // can be imported — and unit-tested — without dragging in the RPC client and
  // its env validation.
  const [{ getReadClient }, { fetchAssetSummary }] = await Promise.all([
    import("./client"),
    import("./provenance"),
  ]);
  const client = getReadClient();
  const events = await client.getContractEvents({
    address: realm,
    abi: ecosystemTemplateAbi,
    eventName: "AssetMinted",
    fromBlock: 0n,
    toBlock: "latest",
  });

  const clearId = Number(clearReceiptSchemaId);
  const clearers = new Set<string>();

  await Promise.all(
    events.map(async (ev) => {
      const a = ev.args as { tokenId?: bigint; recipient?: `0x${string}` };
      if (a.tokenId === undefined || a.recipient === undefined) return;
      try {
        const summary = await fetchAssetSummary(a.tokenId);
        if (summary.schemaId === clearId) {
          clearers.add(a.recipient.toLowerCase());
        }
      } catch {
        // Token hydration failed (e.g. revert on an unindexed token) — skip
        // it. A missed read can only undercount, never inflate the cap.
      }
    }),
  );

  const value = clearers.size;
  clearerCache.set(key, { value, expiry: now + CLEARER_TTL_MS });
  return value;
}

/**
 * Convenience: resolves a realm's earned tier in one call. Returns the
 * full progress shape so callers can surface "N / nextTierAt clearers".
 */
export async function fetchRealmTierProgress(args: {
  realm: `0x${string}`;
  clearReceiptSchemaId: bigint;
}): Promise<RealmTierProgress> {
  const distinctClearers = await countDistinctClearers(args);
  return realmTierProgress(distinctClearers);
}
