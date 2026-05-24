/**
 * Two distinct naming layers for loot:
 *
 *   1. **TYPE name** (`weaponName` / `armorName`) — the schema-native
 *      tier-ladder label. Mirrors the on-chain `name(type, tier)` view
 *      exported by every weapon/armor schema library:
 *
 *        contracts/src/schemas/FantasyWeaponSchema.sol
 *        contracts/src/schemas/SciFiWeaponSchema.sol
 *        contracts/src/schemas/CyberpunkWeaponSchema.sol
 *        (+ matching armor schemas)
 *
 *      This is what *changes* when an asset crosses a realm: a fantasy
 *      dagger T2 reads "Stiletto"; the same token translated into
 *      cyberpunk reads "Switchblade". The UI surfaces this as a chip,
 *      not the headline name. If a string here ever diverges from the
 *      schema it is a *bug here* — the chain wins.
 *
 *   2. **Atmospheric NAME** (`evocativeName`) — a tier- and element-
 *      themed evocative label ("Ember", "Inferno", "Frost") chosen
 *      deterministically from the loot's `nameSeed`. This is the
 *      *identity* of the item and DOES NOT change across realms — the
 *      cross-realm adapter passes the original name through unchanged.
 *      The pool is preset-agnostic (keyed by canonical element index,
 *      so a fantasy "fire" sword and a sci-fi "plasma" sword pick from
 *      the same ember family).
 *
 * Authoring rule: types are PoC-locked to a small fixed set per preset
 * (3-5 archetypes × 5 tiers). When a type rolls "none" (or is absent
 * altogether — story-objects, legacy un-archetyped loot), the type
 * helper returns an empty string and the caller falls back to whatever
 * it was doing before (typically the loot.nameOverride or a generic).
 */

import type { Preset, Tier } from "@/lib/engine/types";
import { elementIndex } from "@/lib/engine/types";

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

// --- Atmospheric (preset-agnostic) name pool -------------------------------
//
// Layout: ELEMENT_FAMILY[canonical-element-index][tier-1] → 4 candidate names.
// Canonical index follows the fantasy enum order:
//   0 = none / mundane, 1 = fire, 2 = ice, 3 = shock, 4 = holy, 5 = unholy
// The other presets share these indices by enum alignment,
// so a cyberpunk "incendiary" weapon lands in the same ember pool as a
// fantasy "fire" weapon. The name is stored on-chain at mint time and is
// the *identity* of the asset across realms.

const EVOCATIVE_NAMES: readonly (readonly (readonly string[])[])[] = [
  // 0 — none / mundane
  [
    ["Hand", "Edge", "Pin", "Tooth"],
    ["Steel", "Iron", "Brass", "Knot"],
    ["Hammer", "Tide", "Vow", "Cull"],
    ["Master", "Reign", "Drift", "Bastion"],
    ["Legend", "Pinnacle", "Apex", "Forever"],
  ],
  // 1 — fire / plasma / incendiary
  [
    ["Ember", "Spark", "Cinder", "Flicker"],
    ["Brand", "Pyre", "Smolder", "Glow"],
    ["Bonfire", "Heatwave", "Furnace", "Searer"],
    ["Wildfire", "Inferno", "Sunfire", "Blaze"],
    ["Conflagration", "Pyroclasm", "Solflare", "Phoenix"],
  ],
  // 2 — ice / cryo / cryogenic
  [
    ["Chill", "Frost", "Rime", "Floe"],
    ["Hoarfrost", "Brisk", "Numb", "Sleet"],
    ["Permafrost", "Iceheart", "Hailstrike", "Snowdrift"],
    ["Avalanche", "Blizzard", "Whiteout", "Glaciem"],
    ["Cryostorm", "Icebourne", "Stillpoint", "Absolute"],
  ],
  // 3 — shock / ion / emp
  [
    ["Jolt", "Static", "Arc", "Crackle"],
    ["Surge", "Pulse", "Snap", "Shock"],
    ["Discharge", "Voltage", "Stunner", "Trembler"],
    ["Tempest", "Thunderclap", "Megavolt", "Stormcaller"],
    ["Cataclysm", "Tesla", "Worldspark", "Skyfire"],
  ],
  // 4 — holy / photon / laser
  [
    ["Halo", "Glimmer", "Dawn", "Grace"],
    ["Beacon", "Radiance", "Blessing", "Gleam"],
    ["Aurora", "Sunburst", "Hallow", "Brilliance"],
    ["Sunlance", "Empyrean", "Hopebringer", "Genesis"],
    ["Heavensent", "Solburst", "Daystar", "Allspark"],
  ],
  // 5 — unholy / void / nano
  [
    ["Hex", "Sin", "Hollow", "Whisper"],
    ["Wail", "Shade", "Bane", "Mourn"],
    ["Doom", "Wraithcall", "Decay", "Sorrow"],
    ["Anathema", "Eclipse", "Maladictum", "Lament"],
    ["Endsong", "Pandemonium", "Antithesis", "Nihil"],
  ],
] as const;

/**
 * Maps any preset's element string onto the canonical 0..5 index used
 * to key `EVOCATIVE_NAMES`. The three preset enums share their ordinal
 * layout (1=fire/plasma/incendiary, 2=ice/cryo/cryogenic, …), so we
 * just read the index in the source preset and reuse it. "none" → 0.
 */
function canonicalElementIndex(element: string | undefined): number {
  if (!element || element === "none") return 0;
  // Every preset's enum agrees on these ordinals; fantasy is the
  // arbitrary canonical choice.
  return elementIndex("fantasy", element) ||
    elementIndex("scifi", element) ||
    elementIndex("cyberpunk", element);
}

/**
 * Pick an atmospheric, preset-agnostic name for a loot drop. Pure and
 * deterministic — same `(seed, tier, element)` always returns the same
 * string, so the on-chain mint can embed the name in metadata and every
 * later read agrees on it.
 *
 * The name is the *identity* of the asset and never changes across
 * realms; the schema-native TYPE label (via `weaponName`/`armorName`)
 * is what translates.
 */
export function evocativeName(
  nameSeed: bigint,
  tier: Tier,
  element: string | undefined,
): string {
  const elemIdx = canonicalElementIndex(element);
  const family = EVOCATIVE_NAMES[elemIdx] ?? EVOCATIVE_NAMES[0]!;
  const ladder = family[tierIdx(tier)] ?? family[0]!;
  // nameSeed is uint256; we only need a small modulus to pick within
  // the 4-name cell. BigInt mod is exact.
  const pick = Number(nameSeed % BigInt(ladder.length));
  return ladder[pick]!;
}
