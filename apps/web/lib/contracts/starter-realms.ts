import { activeChain, anvil } from "@/lib/chain";
import { baseSepolia } from "viem/chains";
import type { Preset } from "@/lib/engine/types";
import { ZERO_ADDRESS, isStarterRealmDeployed } from "./realm-picker";

/**
 * Per-preset starter realm config keyed by chainId. The on-chain
 * `EcosystemRegistry` stores `(owner, createdAt, active)` per ecosystem
 * address — it has *no* notion of "preset" or "name", so the
 * preset → proxy-address mapping has to live here as deploy config.
 *
 * Anvil entries will be populated once the local
 * `script/SeedStarterRealms.s.sol` is wired up;
 * baseSepolia waits for the testnet deploy.
 *
 * The `bossId` lives off-chain by design — bosses are an engine catalog
 * concept (see `lib/engine/boss.ts`). The realm contract has no opinion
 * about who its final boss is at the PoC stage.
 *
 * A zero address signals "not deployed yet" and the play route surfaces
 * that to the user instead of throwing.
 */
export type StarterRealm = { realm: `0x${string}`; bossId: string };

type StarterRealmMap = Record<Preset, StarterRealm>;

export const starterRealmsByChain: Record<number, StarterRealmMap> = {
  [anvil.id]: {
    // TODO(phase-2c-solidity): replace with the proxy addresses emitted by
    // EcosystemFactory.createEcosystem() in the starter-realms deploy script.
    fantasy: { realm: ZERO_ADDRESS, bossId: "forest_hag" },
    scifi: { realm: ZERO_ADDRESS, bossId: "ai_core" },
    cyberpunk: { realm: ZERO_ADDRESS, bossId: "black_ice" },
  },
  [baseSepolia.id]: {
    fantasy: { realm: ZERO_ADDRESS, bossId: "forest_hag" },
    scifi: { realm: ZERO_ADDRESS, bossId: "ai_core" },
    cyberpunk: { realm: ZERO_ADDRESS, bossId: "black_ice" },
  },
};

export const starterRealms: StarterRealmMap =
  starterRealmsByChain[activeChain.id]!;

if (!starterRealms) {
  throw new Error(
    `No starter realms configured for chainId ${activeChain.id} (${activeChain.name})`,
  );
}

/**
 * Returns the configured starter realm for a preset. The `realm` may be
 * the zero address while the on-chain deploy is pending; callers should
 * check `isStarterRealmDeployed` before issuing reads against it.
 */
export function getStarterRealm(preset: Preset): StarterRealm {
  return starterRealms[preset];
}

export { isStarterRealmDeployed };
