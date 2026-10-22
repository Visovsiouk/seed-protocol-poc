/**
 * Trial-mode fallbacks for a realm that exists on-chain but has no row in
 * the player-realm store — deployed straight off the factory, or created
 * before `/create` started registering metadata.
 *
 * `/play/realm/[address]` has always run these realms in trial mode (the
 * engine boots fantasy / Forest Hag, drops stay in the session). The hub's
 * loadout staging has to agree with it: staging builds the realm's starter
 * gear and the HP/AC preview from the *same* `(preset, realm, name)` triple
 * the play route will boot with, so the two drifting apart would show the
 * player numbers the run then contradicts. Hence one definition here rather
 * than a constant per call site.
 *
 * No chain-config imports — kept pure so the staging resolver's tests don't
 * transitively load `lib/chain.ts`. Same isolation pattern as
 * `realm-picker.ts`.
 */

import type { Preset, Tier } from "@/lib/engine/types";
import { shortAddress } from "@/lib/utils";

export const TRIAL_PRESET: Preset = "fantasy";
export const TRIAL_BOSS_ID = "forest_hag";
/** Trial realms pin to T2; registered realms scale via their sqlite row. */
export const TRIAL_MAX_TIER: Tier = 2;

/**
 * Display name for an unregistered realm. The creator never chose one, so
 * the address stands in. Callers must pass the address in the same case
 * everywhere (the play route lowercases), or the label visibly differs
 * between screens.
 */
export function trialRealmName(address: `0x${string}`): string {
  return `Realm ${shortAddress(address)}`;
}
