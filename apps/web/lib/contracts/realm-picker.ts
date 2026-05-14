/**
 * Pure realm-picker helpers (no chain-config imports).
 *
 * Lives alongside `starter-realms.ts` but deliberately imports nothing
 * that touches `lib/chain.ts` (env validation), so the unit tests can
 * run without `NEXT_PUBLIC_RPC_URL` being set. Same isolation pattern as
 * `lib/metadata/asset-card.ts`.
 */

import type { Preset } from "@/lib/engine/types";
import type { RealmSummary } from "@/lib/reads/types";

export const ZERO_ADDRESS: `0x${string}` =
  "0x0000000000000000000000000000000000000000";

export function isStarterRealmDeployed(realm: `0x${string}`): boolean {
  return realm.toLowerCase() !== ZERO_ADDRESS;
}

export type StarterRealmPick = {
  /** The matching on-chain summary, when the realm is registered. */
  onchain: RealmSummary | undefined;
  /** Whether the configured address is non-zero. */
  deployed: boolean;
};

/**
 * Pure: given the configured starter address for a preset and a snapshot
 * of all active+inactive realms from the registry, returns the matching
 * on-chain summary (if any) plus a `deployed` flag for the zero-address
 * "not yet deployed" case.
 */
export function pickStarterRealm(args: {
  preset: Preset;
  configuredAddress: `0x${string}`;
  realms: readonly RealmSummary[];
}): StarterRealmPick {
  const deployed = isStarterRealmDeployed(args.configuredAddress);
  if (!deployed) return { onchain: undefined, deployed: false };
  const match = args.realms.find(
    (r) => r.address.toLowerCase() === args.configuredAddress.toLowerCase(),
  );
  return { onchain: match, deployed: true };
}
