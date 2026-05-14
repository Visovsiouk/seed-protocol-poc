/**
 * Flavor-bank registry. The engine asks for `getFlavorBank(preset)` and
 * gets back the right bank. Adding a preset is a one-line addition here.
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

/**
 * Assembles a loot name from a slot, a name seed, and the preset's bank.
 * Pure: same (slot, seed, bank) → same name. Used by the engine when
 * surfacing a `LootRoll` to the UI before the on-chain mint.
 */
export function assembleLootName(
  bank: FlavorBank,
  slot: "weapon" | "armor",
  nameSeed: bigint,
): string {
  const adjectives = slot === "weapon" ? bank.weaponAdjectives : bank.armorAdjectives;
  const nouns = slot === "weapon" ? bank.weaponNouns : bank.armorNouns;
  // Split the 256-bit seed in half: low 128 bits → adjective, high → noun.
  // Both pools are tiny (~5–10) so we don't lose any meaningful entropy.
  const adjIndex = Number(nameSeed % BigInt(adjectives.length));
  const nounIndex = Number((nameSeed >> 128n) % BigInt(nouns.length));
  return `${adjectives[adjIndex]} ${nouns[nounIndex]}`;
}
