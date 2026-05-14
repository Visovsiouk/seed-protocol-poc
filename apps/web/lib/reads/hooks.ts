"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchActiveListings, fetchRecentSales } from "./listings";
import { fetchAssetSummaries } from "./provenance";
import { fetchInventory, type InventoryEntry } from "./inventory";
import { fetchInventoryCards } from "./inventory-cards";
import { queryKeys, defaultReadQueryOptions } from "./cache";
import type { ListingSummary, SaleSummary, AssetSummary } from "./types";
import type { AssetCard } from "@/lib/engine/types";

/**
 * Client-side wrappers around the lib/reads/* fetchers, plus their React
 * Query cache wiring. UI components consume these hooks; reads can also be
 * called directly from server components without going through this file.
 */

export function useActiveListings() {
  return useQuery<ListingSummary[]>({
    queryKey: queryKeys.listings(),
    queryFn: fetchActiveListings,
    ...defaultReadQueryOptions,
  });
}

export function useRecentSales(windowBlocks?: bigint) {
  return useQuery<SaleSummary[]>({
    queryKey: queryKeys.recentSales(),
    queryFn: () => fetchRecentSales(windowBlocks),
    ...defaultReadQueryOptions,
  });
}

/**
 * Given a list of listings, batch-fetch each asset's summary (mintedBy +
 * attributes) and return a map keyed by tokenId string.
 */
export function useInventory(player: `0x${string}` | undefined) {
  return useQuery<InventoryEntry[]>({
    queryKey: player ? queryKeys.inventory(player) : ["inventory", "none"],
    queryFn: () => fetchInventory(player!),
    enabled: !!player,
    ...defaultReadQueryOptions,
  });
}

/**
 * Hydrated inventory — `AssetCard[]` rather than `InventoryEntry[]`. Lets
 * the play route's drawer + HUD render real on-chain holdings without the
 * page needing to know about metadata decoding.
 */
export function useInventoryCards(player: `0x${string}` | undefined) {
  return useQuery<AssetCard[]>({
    queryKey: player
      ? queryKeys.inventoryCards(player)
      : ["inventory-cards", "none"],
    queryFn: () => fetchInventoryCards(player!),
    enabled: !!player,
    ...defaultReadQueryOptions,
  });
}

export function useAssetsForListings(listings: ListingSummary[] | undefined) {
  const tokenIds = listings?.map((l) => l.tokenId) ?? [];
  const key = tokenIds.map((t) => t.toString()).sort().join(",");
  return useQuery<Map<string, AssetSummary>>({
    queryKey: ["assets-for-listings", key],
    queryFn: () => fetchAssetSummaries(tokenIds),
    enabled: tokenIds.length > 0,
    ...defaultReadQueryOptions,
  });
}
