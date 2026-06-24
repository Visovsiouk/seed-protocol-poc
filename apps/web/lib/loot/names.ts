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
 *      deterministically from the loot's stable `tokenId`. Like the TYPE
 *      label it *re-derives per realm* so it always reads genre-native:
 *      the same token reads "Inferno" in fantasy, "Meltdown" in sci-fi,
 *      "Firestorm" in cyberpunk — the word follows the element through
 *      the adapter. Each genre has its own elemental vocabulary, keyed
 *      by canonical element index; element-`none` items share one
 *      preset-agnostic quality ladder (no element to follow on a hop).
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
  dagger: ["Shiv", "Dirk", "Stiletto", "Poniard", "Heartseeker"],
  sword: ["Shortsword", "Arming Sword", "Longsword", "Greatsword", "Vorpal Blade"],
  bow: ["Shortbow", "Recurve Bow", "Longbow", "Warbow", "Sunderbow"],
  staff: ["Quarterstaff", "Acolyte's Staff", "Magus Staff", "Archmage Staff", "Worldroot"],
} as const;

const SCIFI_WEAPON_NAMES: Readonly<Record<string, readonly string[]>> = {
  cannon: ["Autocannon", "Mass Driver", "Siege Cannon", "Heavy Driver", "Singularity Lance"],
  pistol: ["Sidearm", "Service Pistol", "Heavy Pistol", "Magnum", "Annihilator"],
  rifle: ["Carbine", "Service Rifle", "Battle Rifle", "Heavy Rifle", "Vanguard Rifle"],
  beam: ["Emitter", "Beam Caster", "Pulse Lance", "Heavy Lance", "Starlance"],
  railgun: ["Coilgun", "Light Railgun", "Service Railgun", "Heavy Railgun", "Orbital Spike"],
} as const;

const CYBERPUNK_WEAPON_NAMES: Readonly<Record<string, readonly string[]>> = {
  shotgun: ["Sawed-off", "Combat Shotgun", "Auto-Shotgun", "Breacher", "Citykiller"],
  knife: ["Boxcutter", "Switchblade", "Combat Knife", "Ceramic Blade", "Razorghost"],
  katana: ["Tanto", "Wakizashi", "Nodachi", "Mantis Blade", "Monoblade"],
  smartsmg: ["Machine Pistol", "Burst SMG", "Auto-SMG", "Smartlink SMG", "Killcrown"],
  monowire: ["Filament", "Garrote", "Razorwire", "Smartwire", "Killscript"],
} as const;

// --- Armor ladders ---------------------------------------------------------

const FANTASY_ARMOR_NAMES: Readonly<Record<string, readonly string[]>> = {
  plate: ["Cuirass", "Half-Plate", "Full Plate", "Crusader Plate", "Drakeplate"],
  mail: ["Ring Mail", "Chain Mail", "Banded Mail", "Elven Mail", "Wyrmweave"],
  robe: ["Initiate Robe", "Acolyte Robe", "Adept Robe", "Conclave Robe", "Astral Robe"],
} as const;

const SCIFI_ARMOR_NAMES: Readonly<Record<string, readonly string[]>> = {
  exosuit: ["Worksuit", "Marine Suit", "Powered Exo", "Heavy Exo", "Titan Frame"],
  carapace: [
    "Pressure Skin",
    "Combat Skin",
    "Carapace Plate",
    "Aegis Carapace",
    "Bulwark Carapace",
  ],
  cloak: ["Field Cloak", "Recon Cloak", "Stealth Cloak", "Spectre Cloak", "Ghostframe"],
} as const;

const CYBERPUNK_ARMOR_NAMES: Readonly<Record<string, readonly string[]>> = {
  riotfit: ["Street Pads", "Riot Vest", "Riot Plate", "Heavy Riot", "Bulwark Rig"],
  vest: ["Tac-Vest", "Plate Carrier", "Composite Vest", "Hardshell", "Dermal Plate"],
  weave: ["Synthweave", "Mesh Weave", "Subdermal Weave", "Reflex Weave", "Ghostweave"],
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
 * Compose the player-facing headline: the cross-realm evocative identity
 * ("Inferno") prefixed onto the realm-native TYPE label ("Greatsword") →
 * "Inferno Greatsword". When the asset has no archetype (story-objects,
 * legacy un-archetyped loot) the type label is "" and we show the
 * evocative name alone.
 */
export function composeDisplayName(evocative: string, typeLabel: string): string {
  return typeLabel ? `${evocative} ${typeLabel}` : evocative;
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

// --- Atmospheric name pool (per-preset so the word translates) --------------
//
// The evocative word is the element-themed identity of a drop ("Inferno",
// "Frost"). It is NOT frozen across realms: like the TYPE label it re-derives
// per realm so it always reads genre-native. Three layers:
//
//   • MUNDANE (shared) — element-`none` items have no element to follow, so
//     their quality-adjective word is the SAME in every genre (a "Masterwork
//     Greatsword" stays "Masterwork" when it hops). Keyed [tier-1][pick].
//
//   • EVOCATIVE_FANTASY / _SCIFI / _CYBERPUNK — one elemental table per genre,
//     keyed [element-family][tier-1][pick] where element-family is the
//     canonical index MINUS ONE (fire/plasma/incendiary = family 0, …). The
//     tables are positionally aligned: a given item's fixed `pick` lands on the
//     genre-equivalent word in each table, so the same token reads "Inferno"
//     in fantasy, "Meltdown" in sci-fi, "Firestorm" in cyberpunk.
//
// Canonical element index (from the preset enums, which share ordinals):
//   0 = none, 1 = fire/plasma/incendiary, 2 = ice/cryo/cryogenic,
//   3 = shock/ion/emp, 4 = holy/photon/laser, 5 = unholy/void/nano.
//
// `pick` is derived from the token's stable id (`tokenId`) at both mint and
// render, so the stored name and the re-derived headline agree in the home
// realm and diverge — correctly — only on a cross-genre hop.

// Shared across all presets — element-`none` quality ladder.
const MUNDANE: readonly (readonly string[])[] = [
  ["Plain", "Iron", "Worn", "Rough"],
  ["Sturdy", "Tempered", "Honed", "Solid"],
  ["Fine", "Masterwork", "Keen", "Trueforged"],
  ["Exquisite", "Heirloom", "Vaunted", "Resplendent"],
  ["Fabled", "Peerless", "Mythic", "Eternal"],
];

// Elemental families, indexed [family][tier-1][pick]. Family order:
//   0 fire · 1 ice · 2 shock · 3 holy · 4 unholy.
const EVOCATIVE_FANTASY: readonly (readonly (readonly string[])[])[] = [
  // fire
  [
    ["Ember", "Spark", "Cinder", "Flicker"],
    ["Brand", "Pyre", "Searing", "Glow"],
    ["Bonfire", "Heatwave", "Furnace", "Searer"],
    ["Wildfire", "Inferno", "Sunfire", "Blaze"],
    ["Conflagration", "Pyroclasm", "Solflare", "Phoenix"],
  ],
  // ice
  [
    ["Chill", "Frost", "Rime", "Floe"],
    ["Hoarfrost", "Brisk", "Frozen", "Sleet"],
    ["Permafrost", "Iceheart", "Hailstrike", "Snowdrift"],
    ["Avalanche", "Blizzard", "Whiteout", "Glaciem"],
    ["Everwinter", "Icebourne", "Frostbound", "Absolute"],
  ],
  // shock
  [
    ["Jolt", "Static", "Arc", "Crackle"],
    ["Surge", "Pulse", "Snap", "Shock"],
    ["Discharge", "Voltage", "Stunner", "Charged"],
    ["Tempest", "Thunderclap", "Stormbolt", "Stormcaller"],
    ["Cataclysm", "Skybreaker", "Worldspark", "Skyfire"],
  ],
  // holy
  [
    ["Halo", "Glimmer", "Dawn", "Grace"],
    ["Beacon", "Radiance", "Blessing", "Gleam"],
    ["Aurora", "Sunburst", "Hallow", "Brilliance"],
    ["Sunlance", "Empyrean", "Hopebringer", "Genesis"],
    ["Heavensent", "Solburst", "Daystar", "Allspark"],
  ],
  // unholy
  [
    ["Hex", "Sin", "Withered", "Whisper"],
    ["Wail", "Shade", "Bane", "Mourn"],
    ["Doom", "Wraithcall", "Decay", "Sorrow"],
    ["Anathema", "Eclipse", "Maladictum", "Lament"],
    ["Endsong", "Pandemonium", "Antithesis", "Nihil"],
  ],
];

const EVOCATIVE_SCIFI: readonly (readonly (readonly string[])[])[] = [
  // plasma
  [
    ["Scald", "Plasmaspark", "Emberjet", "Flicker"],
    ["Searflux", "Plasmabrand", "Heatlance", "Glowcore"],
    ["Plasmaflare", "Heatwave", "Reactor", "Burnwave"],
    ["Meltdown", "Plasmastorm", "Starfire", "Overburn"],
    ["Detonation", "Fusionburst", "Solcore", "Supernova"],
  ],
  // cryo
  [
    ["Coolant", "Frostbyte", "Rimevent", "Chillpack"],
    ["Subzero", "Cryojet", "Flashchill", "Sleetcore"],
    ["Deepfreeze", "Cryoburst", "Hailvent", "Driftcore"],
    ["Flashfreeze", "Cryoshock", "Whiteout", "Nullheat"],
    ["Absolute Zero", "Cryobourne", "Cryosleep", "Stasis"],
  ],
  // ion
  [
    ["Ionspark", "Static", "Arcvent", "Crackle"],
    ["Ionsurge", "Pulsejet", "Snapcore", "Shockwave"],
    ["Discharge", "Voltcore", "Stunpulse", "Ioncharge"],
    ["Overload", "Thunderbolt", "Megavolt", "Ionstorm"],
    ["Cascade", "Teslacore", "Gridspike", "Skybreaker"],
  ],
  // photon
  [
    ["Photonspark", "Glimmer", "Dawnlight", "Gleamcore"],
    ["Beacon", "Radiance", "Lightlance", "Lumen"],
    ["Aurora", "Sunburst", "Photoncore", "Brilliance"],
    ["Photonburst", "Empyrean", "Daybreaker", "Genesis"],
    ["Lightspeed", "Solburst", "Daystar", "Starflare"],
  ],
  // void
  [
    ["Voidspark", "Null", "Withered", "Whisper"],
    ["Voidwail", "Umbra", "Bane", "Driftloss"],
    ["Entropy", "Voidcall", "Decay", "Hollow"],
    ["Singularity", "Eclipse", "Voidrend", "Lament"],
    ["Heatdeath", "Eventhorizon", "Antimatter", "Nihil"],
  ],
];

const EVOCATIVE_CYBERPUNK: readonly (readonly (readonly string[])[])[] = [
  // incendiary
  [
    ["Burnoff", "Sparkplug", "Cinderkick", "Flashpoint"],
    ["Backdraft", "Pyrocharge", "Scorch", "Hotwire"],
    ["Firebomb", "Heatwave", "Flamebox", "Burnout"],
    ["Firestorm", "Inferno", "Napalm", "Blaze"],
    ["Hellburn", "Pyroclasm", "Ashcloud", "Wildfire"],
  ],
  // cryogenic
  [
    ["Coldpack", "Frostbite", "Rimekit", "Chillout"],
    ["Hardfrost", "Coldburn", "Flashfrost", "Sleet"],
    ["Deepchill", "Coldsink", "Hailshot", "Snowblind"],
    ["Coldsnap", "Whiteout", "Freezeframe", "Glaciate"],
    ["Killfrost", "Iceblock", "Cryocrash", "Zero"],
  ],
  // emp
  [
    ["Jolt", "Static", "Arcflash", "Crackle"],
    ["Surge", "Powerspike", "Snapfry", "Shortout"],
    ["Blackout", "Voltspike", "Stungun", "Overcharge"],
    ["Brownout", "Thunderhack", "Megavolt", "Stormwire"],
    ["Gridkill", "Teslacrash", "Citysurge", "Skyfry"],
  ],
  // laser
  [
    ["Laserdot", "Glimmer", "Daybright", "Gleam"],
    ["Beacon", "Lightburst", "Optflash", "Lumen"],
    ["Floodbeam", "Sunbeam", "Hardlight", "Brilliance"],
    ["Floodlight", "Highbeam", "Daybreaker", "Genesis"],
    ["Overlight", "Solflare", "Daystar", "Allbright"],
  ],
  // nano
  [
    ["Nanobite", "Glitch", "Withered", "Whisper"],
    ["Greywail", "Swarm", "Bane", "Decay"],
    ["Meltware", "Nanocall", "Rotcode", "Sorrow"],
    ["Greyout", "Eclipse", "Nanorend", "Lament"],
    ["Greygoo", "Pandemic", "Antiware", "Null"],
  ],
];

const EVOCATIVE_BY_PRESET: Readonly<
  Record<Preset, readonly (readonly (readonly string[])[])[]>
> = {
  fantasy: EVOCATIVE_FANTASY,
  scifi: EVOCATIVE_SCIFI,
  cyberpunk: EVOCATIVE_CYBERPUNK,
};

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
 * Pick the atmospheric name for a loot drop, in the vocabulary of `preset`.
 * Pure and deterministic — same `(preset, idSeed, tier, element)` always
 * returns the same string.
 *
 * Unlike the old frozen-at-mint scheme, the word now translates with the
 * realm: pass the *local* preset and the *translated* element and the headline
 * re-derives genre-native (fantasy "Inferno" → sci-fi "Meltdown" → cyberpunk
 * "Firestorm") for the same token. `idSeed` is the token's stable id
 * (`tokenId`), available at both mint and render, so `pick` — and thus the
 * stored name vs. the re-derived headline — agree in the home realm.
 *
 * Element-`none` items draw from the shared MUNDANE ladder, which does NOT
 * vary by preset (a non-elemental item has no element to follow on a hop).
 */
export function evocativeName(
  preset: Preset,
  idSeed: bigint,
  tier: Tier,
  element: string | undefined,
): string {
  const elemIdx = canonicalElementIndex(element);
  const family =
    elemIdx === 0
      ? MUNDANE
      : EVOCATIVE_BY_PRESET[preset][elemIdx - 1] ?? MUNDANE;
  const ladder = family[tierIdx(tier)] ?? family[0]!;
  // idSeed is uint256; we only need a small modulus to pick within the
  // 4-name cell. BigInt mod is exact.
  const pick = Number(idSeed % BigInt(ladder.length));
  return ladder[pick]!;
}
