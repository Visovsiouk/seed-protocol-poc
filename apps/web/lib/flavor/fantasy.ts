/**
 * Fantasy preset flavor bank — the full PoC bank.
 *
 * Contents:
 *   - 12 monsters with stat profiles and 3–4 attack-verb variants each
 *   - 5 bosses (one per starter realm + extras for player-deployed realms),
 *     all with phase-2 narration keys and attack-die bumps
 *   - ~30 room narration strings spread across forest / ruin / crypt themes
 *   - adjective/noun banks for loot naming
 *   - hazard / discovery / combat-verb banks
 *
 * Authoring note: the room narration variants intentionally repeat motifs
 * (cold wind, dripping water, broken stones) so the bank reads as the
 * same world even when individual lines vary.
 */

import type { FlavorBank } from "./types";

const monsters = {
  goblin: {
    id: "goblin",
    name: "Goblin",
    hp: 8,
    attackDie: 4,
    ac: 11,
    attackVerbs: [
      "snarls and stabs you for {dmg}",
      "darts in low and pricks you for {dmg}",
      "spits and slashes for {dmg}",
    ],
  },
  giant_rat: {
    id: "giant_rat",
    name: "Giant Rat",
    hp: 6,
    attackDie: 4,
    ac: 12,
    attackVerbs: [
      "lunges with yellow teeth for {dmg}",
      "scrabbles up your leg and bites for {dmg}",
    ],
  },
  bandit: {
    id: "bandit",
    name: "Bandit",
    hp: 16,
    attackDie: 6,
    ac: 13,
    attackVerbs: [
      "slashes with a notched blade for {dmg}",
      "feints and stabs for {dmg}",
      "snarls a curse and swings for {dmg}",
    ],
  },
  skeleton: {
    id: "skeleton",
    name: "Skeleton",
    hp: 20,
    attackDie: 6,
    ac: 14,
    attackVerbs: [
      "rattles and swings a rusted sword for {dmg}",
      "lunges with bony fingers for {dmg}",
    ],
    weakTo: "holy",
    resistTo: "unholy",
  },
  wolf: {
    id: "wolf",
    name: "Dire Wolf",
    hp: 20,
    attackDie: 6,
    ac: 13,
    attackVerbs: [
      "snaps its jaws for {dmg}",
      "pounces and tears for {dmg}",
      "growls low and bites for {dmg}",
    ],
  },
  ghoul: {
    id: "ghoul",
    name: "Ghoul",
    hp: 22,
    attackDie: 6,
    ac: 14,
    attackVerbs: [
      "rakes you with rotting claws for {dmg}",
      "shrieks and lunges for {dmg}",
    ],
    element: "unholy",
    weakTo: "holy",
    resistTo: "unholy",
  },
  forest_hag_minion: {
    id: "forest_hag_minion",
    name: "Bramble Wisp",
    hp: 16,
    attackDie: 6,
    ac: 14,
    attackVerbs: [
      "wraps thorns around your arm for {dmg}",
      "drains your warmth for {dmg}",
    ],
    weakTo: "fire",
  },
  ogre: {
    id: "ogre",
    name: "Ogre",
    hp: 26,
    attackDie: 8,
    ac: 13,
    attackVerbs: [
      "swings a tree-trunk club for {dmg}",
      "roars and slams down for {dmg}",
      "stomps the ground; debris hits you for {dmg}",
    ],
  },
  wraith: {
    id: "wraith",
    name: "Wraith",
    hp: 22,
    attackDie: 6,
    ac: 14,
    attackVerbs: [
      "drifts through your guard and chills you for {dmg}",
      "whispers your name and burns you for {dmg}",
    ],
    element: "ice",
    weakTo: "holy",
    resistTo: "unholy",
  },
  troll: {
    id: "troll",
    name: "Troll",
    hp: 24,
    attackDie: 6,
    ac: 14,
    attackVerbs: [
      "swings a wet limb for {dmg}",
      "shoves you against the wall for {dmg}",
    ],
    weakTo: "fire",
  },
  cultist: {
    id: "cultist",
    name: "Cultist",
    hp: 22,
    attackDie: 6,
    ac: 13,
    attackVerbs: [
      "chants and slashes for {dmg}",
      "calls down a sickly light that burns you for {dmg}",
    ],
    element: "unholy",
    weakTo: "holy",
  },
  shadow_drake: {
    id: "shadow_drake",
    name: "Shadow Drake",
    hp: 24,
    attackDie: 6,
    ac: 15,
    attackVerbs: [
      "lashes its tail for {dmg}",
      "breathes a cone of dark fire for {dmg}",
      "rakes you with smoke-dark claws for {dmg}",
    ],
    element: "fire",
    weakTo: "ice",
    resistTo: "fire",
  },
} as const;

const bosses = {
  forest_hag: {
    id: "forest_hag",
    preset: "fantasy" as const,
    name: "The Forest Hag",
    baseHp: 36,
    attackDie: 6 as const,
    ac: 14,
    bakedEffects: ["dodge_chance", "regen"] as ["dodge_chance", "regen"],
    phase2NarrationKey: "forest_hag_phase2",
    phase2AttackDie: 6 as const,
    phase2SuppressEffect: "regen" as const,
    element: "unholy" as const,
    weakTo: "fire" as const,
    resistTo: "unholy" as const,
  },
  //  tuning: non-starter bosses target 30–55% win at T2, same
  // band as the starter forest_hag. Recipe mirrors the starter
  // (attackDie 6 / phase2 8); each boss's baseHp is scaled against
  // how punishing its `bakedEffects` are — DR+thorns combos need
  // less HP, pure-DPS combos can carry more.
  lich: {
    id: "lich",
    preset: "fantasy" as const,
    name: "The Lich",
    baseHp: 42,
    attackDie: 6 as const,
    ac: 14,
    bakedEffects: ["lifesteal", "bleed"] as ["lifesteal", "bleed"],
    phase2NarrationKey: "lich_phase2",
    phase2AttackDie: 8 as const,
    phase2SuppressEffect: "lifesteal" as const,
    element: "unholy" as const,
    weakTo: "holy" as const,
    resistTo: "unholy" as const,
  },
  dragon: {
    id: "dragon",
    preset: "fantasy" as const,
    name: "The Dragon",
    baseHp: 36,
    attackDie: 6 as const,
    ac: 14,
    bakedEffects: ["multi_hit", "armor_pierce"] as ["multi_hit", "armor_pierce"],
    phase2NarrationKey: "dragon_phase2",
    phase2AttackDie: 8 as const,
    element: "fire" as const,
    weakTo: "ice" as const,
    resistTo: "fire" as const,
  },
  warden: {
    id: "warden",
    preset: "fantasy" as const,
    name: "The Stone Warden",
    baseHp: 38,
    attackDie: 6 as const,
    ac: 15,
    bakedEffects: ["damage_reduction", "thorns"] as ["damage_reduction", "thorns"],
    phase2NarrationKey: "warden_phase2",
    phase2AttackDie: 8 as const,
    weakTo: "shock" as const,
  },
  vampire: {
    id: "vampire",
    preset: "fantasy" as const,
    name: "The Vampire Lord",
    baseHp: 38,
    attackDie: 6 as const,
    ac: 14,
    bakedEffects: ["lifesteal", "crit_chance"] as ["lifesteal", "crit_chance"],
    phase2NarrationKey: "vampire_phase2",
    phase2AttackDie: 8 as const,
    phase2SuppressEffect: "dodge_chance" as const,
    element: "unholy" as const,
    weakTo: "holy" as const,
    resistTo: "unholy" as const,
  },
} as const;

export const fantasyBank: FlavorBank = {
  presetDisplayName: "Fantasy",
  rooms: {
    woodland_clearing: [
      "Wet light through black trunks. The moss gives like something only just made.",
      "Standing water, turned earth, the smell of rain that hasn't fallen. Birds won't come this deep.",
      "The ground takes the shape of your step, holds it a moment, then smooths over.",
    ],
    dark_grove: [
      "The trees lean in as if reading you.",
      "Water beads black at the foot of every trunk and refuses to fall.",
      "Something has carved the same rune into the bark over and over, getting it wrong each time.",
    ],
    stone_ruin: [
      "Toppled columns, and the smell of rain on stone that was never outdoors.",
      "Lichen-furred steps go down into half-light. The walls weep.",
      "A broken altar, dark with stains that haven't finished drying.",
    ],
    crypt_hall: [
      "A hall of dry air and chiselled names — more than one wall has run out of room.",
      "Sarcophagi line both walls. One stands open, and clean inside.",
      "Cold climbs from the flagstones like it's looking for you.",
    ],
    cavern: [
      "Water drips somewhere out of sight, keeping a count.",
      "The walls shimmer with damp; the rock is softer than rock should be.",
      "Your torch hisses in air thick enough to drink.",
    ],
    bone_pit: [
      "Bones crunch underfoot. Too many are the wrong shape for animals.",
      "A pit worn smooth by what's fallen in. The dark at the bottom is still wet.",
    ],
    inner_sanctum: [
      "The chamber holds its breath. Whatever the Reach kept here is waiting for you.",
      "Tall windows, no light through them. The air in here was written wrong.",
    ],
  },
  bossPhases: {
    forest_hag_phase2: [
      "The Hag laughs through broken teeth. Her thorns sharpen.",
      "Bramble erupts from the ground. She walks lighter now.",
      "For a breath her eyes hold a reader's fear — then the Reach pours back in, and she is only the Hag again.",
    ],
    lich_phase2: [
      "The Lich raises both hands; the air grows colder.",
      "Black light blooms behind the Lich's ribs.",
    ],
    dragon_phase2: [
      "The Dragon's scales darken. It draws a deep, slow breath.",
      "Its wings unfurl. The room shrinks.",
    ],
    warden_phase2: [
      "Stone scrapes on stone. The Warden's body knits itself thicker.",
      "Cracks bloom across its surface — then close again.",
    ],
    vampire_phase2: [
      "The Vampire smiles. Its eyes are no longer red.",
      "It steps through its own shadow, faster than it should be.",
    ],
  },
  roomTemplates: [
    // Three-room shape: depth 1 easy mob, depth 2 elite mob, boss at depth 3.
    { id: "r1", depth: 1, archetype: "combat", narrationKey: "woodland_clearing", monsterPool: ["goblin", "giant_rat", "bandit"] },
    // Elite: tough d6 mobs (HP 20-24 vs easy's 6-16) — a real step up without
    // the d8 damage spike of the ogre.
    { id: "r2", depth: 2, archetype: "combat", narrationKey: "bone_pit", monsterPool: ["skeleton", "ghoul", "wraith", "troll"] },
  ],
  monsters,
  bosses,
};
