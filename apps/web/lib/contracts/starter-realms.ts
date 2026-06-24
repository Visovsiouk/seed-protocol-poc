import type { Element, Preset } from "@/lib/engine/types";
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
 *   - `name`/`tagline` live here — these are the display labels the
 *     selector and play-page header render. Single source so the two
 *     surfaces can't drift apart.
 *
 * A zero `realm` signals "not seeded yet"; the play route surfaces that
 * to the user instead of throwing.
 */
export type StarterRealm = {
  realm: `0x${string}`;
  bossId: string;
  name: string;
  tagline: string;
  /**
   * Depth at which the boss arrives. Normalized to 3 across all three
   * starters — the run is three rooms (easy → elite → boss), so the
   * cadence stays even and every room leans on the combat system. The
   * post-3-clear free play (and any community realm) can pick its own
   * depth without touching this baseline.
   */
  bossDepth: number;
  /**
   * First-weapon override. Genesis forces `"fire"` so the player
   * stumbles onto the Pilgrim's Brand — the canonical fire blade that
   * justifies the Hag's `weakTo: fire` as a narrative beat rather
   * than a coincidence.
   */
  forcedFirstWeaponElement?: Exclude<Element, "none">;
};

const BOSS_ID_BY_PRESET: Record<Preset, string> = {
  fantasy: "forest_hag",
  scifi: "ai_core",
  cyberpunk: "black_ice",
};

/**
 * Per-preset narrative-mechanic config. See `StarterRealm` field docs
 * for the worldbuilding behind each value.
 */
const STARTER_MECHANICS_BY_PRESET: Record<
  Preset,
  Pick<StarterRealm, "bossDepth" | "forcedFirstWeaponElement">
> = {
  // The Hollow Reach — first door. Three rooms (easy → elite → boss) and a
  // forced fire first weapon so the player stumbles onto the Pilgrim's Brand
  // and the Hag's fire-weakness reads as a story beat, not a coincidence.
  fantasy: {
    bossDepth: 3,
    forcedFirstWeaponElement: "fire",
  },
  // Black Ice District — second door. Same three-room cadence, in wetter
  // neon. No forced first weapon — the warp brought the Brand across,
  // translated.
  cyberpunk: {
    bossDepth: 3,
  },
  // Drift Station Ker-7 — third door. Last starter; same three-room cadence,
  // hardest tonal stretch.
  scifi: {
    bossDepth: 3,
  },
};

const STARTER_DISPLAY_BY_PRESET: Record<Preset, { name: string; tagline: string }> = {
  fantasy: {
    name: "The Hollow Reach",
    tagline:
      "Wet stone, oil-rust banners, and the Forest Hag's wet laughter from somewhere ahead.",
  },
  scifi: {
    name: "Drift Station Ker-7",
    tagline:
      "A dead colony ship on a long elliptical, frost creeping across the inside of the hull. Something rebooted the core last cycle.",
  },
  cyberpunk: {
    name: "Black Ice District",
    tagline:
      "Neon bleeds on wet concrete. The ICE knows your name before you give it. Everything down here that watches is also counting.",
  },
};

// Display order matches the canonical narrative arc
// (`REALM_ORDER` in `lib/story/progression.ts`): fantasy → cyberpunk → scifi.
// Sci-fi is the third door — longest tonal stretch, hardest starter — so
// it appears last in the selector.
const PRESETS: readonly Preset[] = ["fantasy", "cyberpunk", "scifi"];

/**
 * Returns the configured starter realm for a preset. The `realm` may be
 * the zero address while the on-chain deploy is pending; callers should
 * check `isStarterRealmDeployed` before issuing reads against it.
 */
export function getStarterRealm(preset: Preset): StarterRealm {
  return {
    realm: getSeededRealm(preset),
    bossId: BOSS_ID_BY_PRESET[preset],
    name: STARTER_DISPLAY_BY_PRESET[preset].name,
    tagline: STARTER_DISPLAY_BY_PRESET[preset].tagline,
    ...STARTER_MECHANICS_BY_PRESET[preset],
  };
}

/**
 * Iterates every preset's starter-realm config. Consumers that need to
 * fan-out reads across all three realms (boss-clear scan, mint-loot
 * resolver, etc.) use this instead of hand-rolling the preset list.
 */
export function listStarterRealms(): StarterRealmEntry[] {
  return PRESETS.map((preset) => ({
    preset,
    ...getStarterRealm(preset),
  }));
}

export type StarterRealmEntry = StarterRealm & { preset: Preset };

export { isStarterRealmDeployed };
