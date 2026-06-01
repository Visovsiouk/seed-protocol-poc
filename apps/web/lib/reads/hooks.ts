"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchActiveListings, fetchRecentSales } from "./listings";
import { fetchAssetSummaries } from "./provenance";
import { fetchInventory, type InventoryEntry } from "./inventory";
import { fetchInventoryCards } from "./inventory-cards";
import {
  fetchRealms,
  fetchStarterRealmResolution,
  type StarterRealmResolution,
} from "./realms";
import { fetchBossClears, fetchHasSeed } from "./boss-clears";
import { listStarterRealms } from "@/lib/contracts/starter-realms";
import {
  fetchRealmActivity,
  type RealmActivityEntry,
} from "./realm-activity";
import { fetchRealmStats, type RealmStats } from "./realm-stats";
import { fetchRealmAssets } from "./realm-assets";
import {
  deriveTutorialProgress,
  type TutorialProgress,
  type BossClearEvent,
} from "@/lib/tutorial/progress";
import { queryKeys, defaultReadQueryOptions } from "./cache";
import type {
  ListingSummary,
  SaleSummary,
  AssetSummary,
  RealmSummary,
} from "./types";
import type { AssetCard, Preset } from "@/lib/engine/types";

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

/**
 * Snapshot of every realm in the `EcosystemRegistry`. Useful for a
 * future "Realms" picker on the landing page; today the play route only
 * needs `useStarterRealm` (below), which delegates here internally so
 * the registry list is fetched at most once per stale window.
 */
export function useRealms() {
  return useQuery<RealmSummary[]>({
    queryKey: queryKeys.realms(),
    queryFn: fetchRealms,
    ...defaultReadQueryOptions,
  });
}

/**
 * Player-realm metadata. Reads from the server sqlite store
 * via `/api/realm/list`. Returns an address-keyed map so callers can
 * cheaply join against the on-chain `EcosystemRegistry` listing.
 *
 * NOT authoritative — the on-chain `owner()` + `minters[...]` are the
 * security boundary. This is purely for surfacing creator-chosen
 * cosmetic data (name, preset, bossId) on the landing page.
 */
export type PlayerRealmMeta = {
  address: `0x${string}`;
  owner: `0x${string}`;
  preset: Preset;
  bossId: string;
  name: string;
  /** Creator-chosen accent hex, or null to inherit the genre default. */
  accent: string | null;
  maxTier: number;
  createdAt: number;
};

async function fetchPlayerRealms(): Promise<
  ReadonlyMap<string, PlayerRealmMeta>
> {
  const res = await fetch("/api/realm/list", { cache: "no-store" });
  const body = (await res.json()) as
    | { ok: true; realms: PlayerRealmMeta[] }
    | { ok: false; reason: string; message: string };
  if (!body.ok) {
    throw new Error(`player-realms[${body.reason}]: ${body.message}`);
  }
  const map = new Map<string, PlayerRealmMeta>();
  for (const r of body.realms) map.set(r.address.toLowerCase(), r);
  return map;
}

export function usePlayerRealms() {
  return useQuery<ReadonlyMap<string, PlayerRealmMeta>>({
    queryKey: queryKeys.playerRealms(),
    queryFn: fetchPlayerRealms,
    ...defaultReadQueryOptions,
  });
}

/**
 * Resolves the configured starter realm for a preset against the live
 * registry. Returns the configured address, bossId, deployment state,
 * and the on-chain summary if registered. The play route uses this to
 * decide between (a) running the on-chain mint path and (b) showing the
 * "Realm not deployed yet" panel.
 */
export function useStarterRealm(preset: Preset) {
  return useQuery<StarterRealmResolution>({
    queryKey: queryKeys.starterRealm(preset),
    queryFn: () => fetchStarterRealmResolution(preset),
    ...defaultReadQueryOptions,
  });
}

/**
 * Raw BossCleared event union for a player, across every deployed
 * starter realm. The claim-seed flow consumes these directly to build
 * the on-chain `ContributionProof`; the tutorial overlay only needs the
 * derived progress (see `useTutorialProgress`).
 */
export function useBossClears(player: `0x${string}` | undefined) {
  return useQuery<BossClearEvent[]>({
    queryKey: queryKeys.bossClears(
      player ?? ("0x0000000000000000000000000000000000000000" as const),
    ),
    enabled: !!player,
    queryFn: () => (player ? fetchBossClears(player) : Promise.resolve([])),
    ...defaultReadQueryOptions,
  });
}

/**
 * Composite tutorial-progress hook. Combines the per-
 * realm `BossCleared` event scan with `SeedSBT.balanceOf(player)` and
 * runs the result through the (pure, tested) `deriveTutorialProgress`.
 *
 * Returns `emptyTutorialProgress`-shaped data while `player` is
 * undefined so the overlay can render against a stable shape during the
 * pre-connect render pass. Caller should treat the query's `isLoading`
 * as the source of truth for spinners.
 */
export function useTutorialProgress(player: `0x${string}` | undefined) {
  return useQuery<TutorialProgress>({
    queryKey: queryKeys.tutorialProgress(
      player ?? ("0x0000000000000000000000000000000000000000" as const),
    ),
    enabled: !!player,
    queryFn: async () => {
      const starterRealmAddresses = new Set(
        listStarterRealms()
          .map((r) => r.realm.toLowerCase())
          .filter((addr) => addr !== "0x0000000000000000000000000000000000000000"),
      );
      if (!player) {
        return deriveTutorialProgress({
          hasSeed: false,
          events: [],
          starterRealmAddresses,
          communityRealmCount: 0,
        });
      }
      const [events, hasSeed, registry] = await Promise.all([
        fetchBossClears(player),
        fetchHasSeed(player),
        // Registry list drives the community-realm count for the
        // second-tier Seed gate. Tolerant of a failed read — fall back
        // to zero so the player at least sees the first-tier progress.
        fetchRealms().catch(() => [] as RealmSummary[]),
      ]);
      const communityRealmCount = registry.reduce(
        (n, r) =>
          starterRealmAddresses.has(r.address.toLowerCase()) ? n : n + 1,
        0,
      );
      return deriveTutorialProgress({
        hasSeed,
        events,
        starterRealmAddresses,
        communityRealmCount,
      });
    },
    ...defaultReadQueryOptions,
  });
}

/**
 * Per-realm activity feed: most-recent `AssetMinted` events on the
 * realm clone, with each row tagged `loot | clear-receipt | unknown`
 * via the seeded per-preset schema IDs. Used by the `/realm/[address]`
 * dashboard's activity panel.
 */
export function useRealmActivity(args: {
  realm: `0x${string}` | null;
  preset: Preset | null;
  limit?: number;
}) {
  const { realm, preset, limit } = args;
  return useQuery<RealmActivityEntry[]>({
    queryKey: queryKeys.activity(
      realm ?? ("0x0000000000000000000000000000000000000000" as const),
    ),
    enabled: !!realm,
    queryFn: () =>
      realm
        ? fetchRealmActivity({ realm, preset, limit })
        : Promise.resolve([]),
    ...defaultReadQueryOptions,
  });
}

/**
 * Aggregate metrics + boss leaderboard for a single realm. Powers the
 * `/realm/[address]` MetricsRow + BossLeaderboard panels off one
 * `AssetMinted` scan.
 */
export function useRealmStats(args: {
  realm: `0x${string}` | null;
  preset: Preset | null;
}) {
  const { realm, preset } = args;
  return useQuery<RealmStats>({
    queryKey: queryKeys.realmStats(
      realm ?? ("0x0000000000000000000000000000000000000000" as const),
    ),
    enabled: !!realm,
    queryFn: () =>
      realm
        ? fetchRealmStats({ realm, preset })
        : Promise.resolve({
            metrics: {
              totalMints: 0,
              lootMints: 0,
              clearReceipts: 0,
              distinctHolders: 0,
              firstClearBlock: null,
            },
            leaderboard: [],
          }),
    ...defaultReadQueryOptions,
  });
}

/**
 * Hydrated catalog of cards a realm has ever minted (newest first,
 * deduped by tokenId, clearReceipts dropped). Powers the
 * `<RealmAssetsGrid/>` panel on `/realm/[address]`.
 */
export function useRealmAssets(args: {
  realm: `0x${string}` | null;
  preset: Preset | null;
  limit?: number;
}) {
  const { realm, preset, limit } = args;
  return useQuery<AssetCard[]>({
    queryKey: queryKeys.realmAssets(
      realm ?? ("0x0000000000000000000000000000000000000000" as const),
    ),
    enabled: !!realm,
    queryFn: () =>
      realm
        ? fetchRealmAssets({ realm, preset, cardLimit: limit })
        : Promise.resolve([]),
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
