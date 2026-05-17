/**
 * Canonical React Query key catalog. Centralized so reads + UI components
 * share keys and revalidations work end-to-end.
 *
 * Each function returns a tuple — pass it straight into `useQuery({ queryKey })`.
 *
 * Reference:
 */
export const queryKeys = {
  listings: () => ["listings"] as const,
  recentSales: () => ["recent-sales"] as const,
  inventory: (player: `0x${string}`) => ["inventory", player] as const,
  inventoryCards: (player: `0x${string}`) => ["inventory-cards", player] as const,
  mintedBy: (tokenId: bigint) => ["mintedBy", tokenId.toString()] as const,
  attrs: (tokenId: bigint) => ["attrs", tokenId.toString()] as const,
  schema: (schemaId: number) => ["schema", schemaId] as const,
  adoption: () => ["adoption"] as const,
  realms: () => ["realms"] as const,
  realmMeta: (addr: `0x${string}`) => ["realm-meta", addr] as const,
  starterRealm: (preset: string) => ["starter-realm", preset] as const,
  budget: (addr: `0x${string}`) => ["budget", addr] as const,
  activity: (addr: `0x${string}`) => ["activity", addr] as const,
  bossClears: (player: `0x${string}`) => ["boss-clears", player] as const,
  hasSeed: (player: `0x${string}`) => ["has-seed", player] as const,
  tutorialProgress: (player: `0x${string}`) =>
    ["tutorial-progress", player] as const,
  bossLeaderboard: (realm: `0x${string}`) =>
    ["boss-leaderboard", realm] as const,
  realmStats: (realm: `0x${string}`) => ["realm-stats", realm] as const,
  adapters: (schemaId: number) => ["adapters", schemaId] as const,
};

/**
 * Default React Query options for read-heavy chain data. Sets a small
 * stale window so the bazaar feels live without hammering the RPC.
 */
export const defaultReadQueryOptions = {
  staleTime: 15_000,
  gcTime: 5 * 60_000,
  refetchOnWindowFocus: false,
};
