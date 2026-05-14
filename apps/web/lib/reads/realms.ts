import { ecosystemRegistryAbi } from "@abis/generated";
import { getReadClient } from "./client";
import { getAddress } from "@/lib/contracts/addresses";
import { getStarterRealm } from "@/lib/contracts/starter-realms";
import {
  pickStarterRealm,
  isStarterRealmDeployed,
} from "@/lib/contracts/realm-picker";
import type { Preset } from "@/lib/engine/types";
import type { RealmSummary } from "./types";

/**
 * Realm-registry reads. The `EcosystemRegistry` exposes
 *
 *   getEcosystemCount() → uint256
 *   ecosystemList(uint256) → address
 *   ecosystems(address) → (owner, createdAt, active)
 *
 * but no `name()` or preset accessor, so the UI joins the on-chain list
 * against the off-chain `starterRealms` config to identify which active
 * realm is the configured starter per preset.
 *
 * Why enumerate vs. subscribe: PoC scale (a handful of realms) makes the
 * `for i in count` walk trivially cheap, and it gives us a snapshot we
 * can cache for 15s. When realm count grows past a hundred, switch to
 * the `EcosystemRegistered` event-scan pattern used by `inventory.ts`.
 */

const REGISTRY = () => getAddress("ecosystemRegistry");

export async function fetchRealms(): Promise<RealmSummary[]> {
  const client = getReadClient();
  const address = REGISTRY();

  const count = await client.readContract({
    address,
    abi: ecosystemRegistryAbi,
    functionName: "getEcosystemCount",
  });

  if (count === 0n) return [];

  // Two-phase: list addresses (n calls), then look each one up (n more).
  // viem's `multicall` would halve the round trips but requires a
  // Multicall3 deploy on the chain, which we don't assume for anvil.
  const indices = Array.from({ length: Number(count) }, (_, i) => BigInt(i));
  const addresses = await Promise.all(
    indices.map((i) =>
      client.readContract({
        address,
        abi: ecosystemRegistryAbi,
        functionName: "ecosystemList",
        args: [i],
      }),
    ),
  );

  const records = await Promise.all(
    addresses.map((addr) =>
      client.readContract({
        address,
        abi: ecosystemRegistryAbi,
        functionName: "ecosystems",
        args: [addr],
      }),
    ),
  );

  return addresses.map((addr, i): RealmSummary => {
    const [owner, createdAt, active] = records[i]!;
    return { address: addr, owner, createdAt, active };
  });
}

export type StarterRealmResolution = {
  preset: Preset;
  /** The configured starter address from the chain-keyed config. */
  configuredAddress: `0x${string}`;
  bossId: string;
  /** Whether the configured address is non-zero. */
  deployed: boolean;
  /** The matching on-chain summary, when the realm is registered. */
  onchain: RealmSummary | undefined;
  /** `deployed && onchain?.active === true`. */
  ready: boolean;
};

/**
 * Resolves the play route's starter realm for a preset against the live
 * registry. The hook (`useStarterRealm`) is the usual consumer; this
 * function is exposed for server components that want to prefetch.
 */
export async function fetchStarterRealmResolution(
  preset: Preset,
): Promise<StarterRealmResolution> {
  const { realm: configuredAddress, bossId } = getStarterRealm(preset);
  const deployed = isStarterRealmDeployed(configuredAddress);

  if (!deployed) {
    return {
      preset,
      configuredAddress,
      bossId,
      deployed: false,
      onchain: undefined,
      ready: false,
    };
  }

  const realms = await fetchRealms();
  const { onchain } = pickStarterRealm({
    preset,
    configuredAddress,
    realms,
  });

  return {
    preset,
    configuredAddress,
    bossId,
    deployed,
    onchain,
    ready: onchain?.active === true,
  };
}
