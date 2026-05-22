/**
 * Off-chain mirror of the on-chain `name(type, tier)` view exported by
 * every weapon/armor schema library:
 *
 *   contracts/src/schemas/FantasyWeaponSchema.sol
 *   contracts/src/schemas/SciFiWeaponSchema.sol
 *   contracts/src/schemas/CyberpunkWeaponSchema.sol
 *   contracts/src/schemas/FantasyArmorSchema.sol
 *   contracts/src/schemas/SciFiArmorSchema.sol
 *   contracts/src/schemas/CyberpunkArmorSchema.sol
 *
 * The on-chain `name()` function is the canonical source of truth.
 * This file exists so the client can label loot before the round-trip
 * read returns (and so server-side mint metadata can embed the name in
 * the tokenURI). If a string here ever diverges from the schema it is
 * a *bug here* — the chain wins.
 *
 * Authoring rule: types are PoC-locked to a small fixed set per preset
 * (3-5 archetypes × 5 tiers). When a type rolls "none" (or is absent
 * altogether — story-objects, legacy un-archetyped loot), the helper
 * returns an empty string and the caller falls back to whatever it was
 * doing before (typically the loot.nameOverride or a generic).
 */

import type { Preset, Tier } from "@/lib/engine/types";

// --- Weapon ladders --------------------------------------------------------

const FANTASY_WEAPON_NAMES: Readonly<Record<string, readonly string[]>> = {
  axe: ["Hatchet", "Hand Axe", "Battle Axe", "Greataxe", "Skullsplitter"],
  dagger: ["Knife", "Stiletto", "Misericorde", "Kris", "Whisper"],
  sword: ["Shortsword", "Arming Sword", "Longsword", "Greatsword", "Vorpal Blade"],
  bow: ["Hunting Bow", "War Bow", "Longbow", "Composite Bow", "Sunderbow"],
  staff: ["Acolyte's Staff", "Wand", "Magus Staff", "Archmage Staff", "Worldroot"],
} as const;

const SCIFI_WEAPON_NAMES: Readonly<Record<string, readonly string[]>> = {
  cannon: ["Heavy Iron", "Mass Driver", "Plasma Cannon", "Rail Cannon", "Singularity Lance"],
  pistol: ["Hold-out", "Sidearm", "Service Pistol", "Hand Cannon", "Annihilator"],
  rifle: ["Carbine", "Assault Rifle", "Marksman Rifle", "Sniper Rifle", "Vanguard Rifle"],
  beam: ["Laser Pointer", "Beam Pistol", "Beam Rifle", "Heavy Beam", "Phase Lance"],
  railgun: ["Coilgun", "Light Railgun", "Service Railgun", "Heavy Railgun", "Orbital Spike"],
} as const;

const CYBERPUNK_WEAPON_NAMES: Readonly<Record<string, readonly string[]>> = {
  shotgun: ["Sawed-off", "Combat Shotgun", "Auto-Shotgun", "Breacher", "Citykiller"],
  knife: ["Boxcutter", "Switchblade", "Combat Knife", "Ceramic Blade", "Razorghost"],
  katana: ["Tanto", "Wakizashi", "Katana", "Mantis Blade", "Edgelord"],
  smartsmg: ["Burst SMG", "Smart SMG", "Auto-SMG", "Tac-SMG", "Killcrown"],
  monowire: ["Wire", "Monowire", "Razor-wire", "Smartwire", "Killscript"],
} as const;

// --- Armor ladders ---------------------------------------------------------

const FANTASY_ARMOR_NAMES: Readonly<Record<string, readonly string[]>> = {
  plate: ["Cuirass", "Half-Plate", "Full Plate", "Crusader Plate", "Drakeplate"],
  mail: ["Padded Mail", "Chain Mail", "Banded Mail", "Elven Mail", "Wyrmweave"],
  robe: ["Initiate Robe", "Acolyte Robe", "Witch Robe", "Conclave Robe", "Starcloak"],
} as const;

const SCIFI_ARMOR_NAMES: Readonly<Record<string, readonly string[]>> = {
  exosuit: ["Worksuit", "Marine Suit", "Powered Exo", "Heavy Exo", "Titan Frame"],
  carapace: [
    "Pressure Skin",
    "Combat Skin",
    "Carapace Plate",
    "Aegis Carapace",
    "Voidskin",
  ],
  cloak: ["Vac Cloak", "Stealth Cloak", "Phase Cloak", "Ghost Cloak", "Null Cloak"],
} as const;

const CYBERPUNK_ARMOR_NAMES: Readonly<Record<string, readonly string[]>> = {
  riotfit: ["Street Vest", "Riot Pads", "Riot Plate", "Heavy Riot", "Cordon Maximum"],
  vest: ["Tac-Vest", "Plate Carrier", "Smart Vest", "Composite Vest", "Skinweave"],
  weave: ["Mesh", "Smart Mesh", "Subdermal Weave", "Mantis Weave", "Ghostweave"],
} as const;

const WEAPON_BY_PRESET: Readonly<Record<Preset, Readonly<Record<string, readonly string[]>>>> = {
  fantasy: FANTASY_WEAPON_NAMES,
  scifi: SCIFI_WEAPON_NAMES,
  cyberpunk: CYBERPUNK_WEAPON_NAMES,
};

const ARMOR_BY_PRESET: Readonly<Record<Preset, Readonly<Record<string, readonly string[]>>>> = {
  fantasy: FANTASY_ARMOR_NAMES,
  scifi: SCIFI_ARMOR_NAMES,
  cyberpunk: CYBERPUNK_ARMOR_NAMES,
};

function tierIdx(tier: Tier): number {
  return Math.max(0, Math.min(4, tier - 1));
}

/**
 * Mirror of `FantasyWeaponSchema.name(WeaponType, Tier)` (and the
 * Sci-Fi / Cyberpunk counterparts). Returns "" for "none" / unknown
 * types so callers can fall back to a generic name.
 */
export function weaponName(preset: Preset, weaponType: string | undefined, tier: Tier): string {
  if (!weaponType || weaponType === "none") return "";
  const table = WEAPON_BY_PRESET[preset];
  const ladder = table[weaponType];
  if (!ladder) return "";
  return ladder[tierIdx(tier)] ?? "";
}

/**
 * Mirror of `FantasyArmorSchema.name(ArmorType, Tier)` (and the Sci-Fi
 * / Cyberpunk counterparts).
 */
export function armorName(preset: Preset, armorType: string | undefined, tier: Tier): string {
  if (!armorType || armorType === "none") return "";
  const table = ARMOR_BY_PRESET[preset];
  const ladder = table[armorType];
  if (!ladder) return "";
  return ladder[tierIdx(tier)] ?? "";
}

/**
 * Generic tier-only fallback used when a loot drop has no archetype
 * (type === "none" or undefined). Used by story-object overrides and
 * any legacy code path that still produces un-archetyped loot.
 */
export function fallbackLootName(slot: "weapon" | "armor", tier: Tier): string {
  return slot === "weapon" ? `Tier ${tier} Weapon` : `Tier ${tier} Armor`;
}

/**
 * One-stop resolver: returns the schema-native name for `(preset, type,
 * tier)`, or the fallback if the type is absent / unknown.
 */
export function lootName(
  preset: Preset,
  slot: "weapon" | "armor",
  type: string | undefined,
  tier: Tier,
): string {
  const named = slot === "weapon" ? weaponName(preset, type, tier) : armorName(preset, type, tier);
  if (named) return named;
  return fallbackLootName(slot, tier);
}
