/**
 * Flavor-bank registry. The engine asks for `getFlavorBank(preset)` and
 * gets back the right bank. Adding a preset is a one-line addition here.
 *
 * Loot naming now lives in `lib/loot/names.ts` (an off-chain mirror of
 * each schema's `name(type, tier)` view). The flavor bank no longer
 * owns adjective/noun pools.
 */

import type { Preset } from "../engine/types";
import { cyberpunkBank } from "./cyberpunk";
import { fantasyBank } from "./fantasy";
import { scifiBank } from "./scifi";
import type { FlavorBank } from "./types";

export type { FlavorBank } from "./types";

const BANKS: Readonly<Record<Preset, FlavorBank>> = {
  fantasy: fantasyBank,
  scifi: scifiBank,
  cyberpunk: cyberpunkBank,
};

export function getFlavorBank(preset: Preset): FlavorBank {
  const bank = BANKS[preset];
  if (!bank) throw new Error(`getFlavorBank: unknown preset "${preset}"`);
  return bank;
}
