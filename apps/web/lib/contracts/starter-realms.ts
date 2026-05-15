import type { Preset } from "@/lib/engine/types";
import { isStarterRealmDeployed } from "./realm-picker";
import { getSeededRealm } from "./seeded-realms";

/**
 * Per-preset starter realm config.
 *
 * Split of concerns:
 *   - `realm` (address) lives in `.seeded-realms.json` — written by
 *     `pnpm seed` (`apps/web/scripts/seed-realms.ts`) and keyed by chainId
 *     so anvil and base-sepolia deploys can coexist in the same file.
 *   - `bossId` lives here — bosses are an engine catalog concept (see
 *     `lib/engine/boss.ts`) and the realm contract has no opinion about
 *     who its final boss is at the PoC stage.
 *
 * A zero `realm` signals "not seeded yet"; the play route surfaces that
 * to the user instead of throwing.
 */
export type StarterRealm = { realm: `0x${string}`; bossId: string };

const BOSS_ID_BY_PRESET: Record<Preset, string> = {
  fantasy: "forest_hag",
  scifi: "ai_core",
  cyberpunk: "black_ice",
};

const PRESETS: readonly Preset[] = ["fantasy", "scifi", "cyberpunk"];

/**
 * Returns the configured starter realm for a preset. The `realm` may be
 * the zero address while the on-chain deploy is pending; callers should
 * check `isStarterRealmDeployed` before issuing reads against it.
 */
export function getStarterRealm(preset: Preset): StarterRealm {
  return {
    realm: getSeededRealm(preset),
    bossId: BOSS_ID_BY_PRESET[preset],
  };
}

/**
 * Iterates every preset's starter-realm config. Consumers that need to
 * fan-out reads across all three realms (boss-clear scan, mint-loot
 * resolver, etc.) use this instead of hand-rolling the preset list.
 */
export function listStarterRealms(): { preset: Preset; realm: `0x${string}`; bossId: string }[] {
  return PRESETS.map((preset) => {
    const { realm, bossId } = getStarterRealm(preset);
    return { preset, realm, bossId };
  });
}

export { isStarterRealmDeployed };
