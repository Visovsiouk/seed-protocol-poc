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
    hp: 12,
    attackDie: 6,
    ac: 12,
    attackVerbs: [
      "slashes with a notched blade for {dmg}",
      "feints and stabs for {dmg}",
      "snarls a curse and swings for {dmg}",
    ],
  },
  skeleton: {
    id: "skeleton",
    name: "Skeleton",
    hp: 14,
    attackDie: 6,
    ac: 13,
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
    hp: 16,
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
    hp: 18,
    attackDie: 6,
    ac: 13,
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
    hp: 10,
    attackDie: 4,
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
    hp: 28,
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
    attackDie: 8,
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
    hp: 26,
    attackDie: 8,
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
    hp: 14,
    attackDie: 6,
    ac: 12,
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
    hp: 22,
    attackDie: 8,
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
    baseHp: 42,
    attackDie: 6 as const,
    ac: 14,
    bakedEffects: ["dodge_chance", "regen"] as ["dodge_chance", "regen"],
    phase2NarrationKey: "forest_hag_phase2",
    phase2AttackDie: 8 as const,
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
      "Sunlight filters through old trees. Something rustles.",
      "A clearing of moss and bracken. Birds are silent here.",
      "Wildflowers bend in a wind you cannot feel.",
    ],
    dark_grove: [
      "The trees lean inward as if eavesdropping.",
      "Shadows pool at the base of every trunk.",
      "Something has been carving runes into the bark.",
    ],
    stone_ruin: [
      "Toppled columns and the smell of rain on old stone.",
      "Lichen-furred steps descend into half-light.",
      "A broken altar stands at the center, dark with stains.",
    ],
    crypt_hall: [
      "A hall of dust and dry air. Names are chiseled everywhere.",
      "Sarcophagi line both walls. One is open.",
      "Cold creeps up from the flagstones.",
    ],
    cavern: [
      "Water drips somewhere out of sight.",
      "The cavern walls shimmer with damp.",
      "Your torch hisses in the wet air.",
    ],
    bone_pit: [
      "Bones crunch underfoot. Many are not animal.",
      "A circular pit, deep enough that you don't see the bottom.",
    ],
    inner_sanctum: [
      "The chamber is hush. Whatever lives here is waiting for you.",
      "Tall windows admit no light. The air is wrong.",
    ],
  },
  bossPhases: {
    forest_hag_phase2: [
      "The Hag laughs through broken teeth. Her thorns sharpen.",
      "Bramble erupts from the ground. She walks lighter now.",
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
  trialPrompts: [
    "A chasm splits the path. Far side is dark.",
    "A rotted rope-bridge sways over a long fall.",
    "The floor here is wrong — old planks, deep mire beneath.",
  ],
  trialSuccess: [
    "You time it right and land clean on the far side.",
    "Your boots find purchase. You're across.",
    "You read the gap and trust your legs. You're through.",
  ],
  trialFailure: [
    "Your footing betrays you; you take the fall hard.",
    "Wood splinters under you. The drop hurts.",
    "Too slow — the floor punishes you for hesitating.",
  ],
  ledgerPrompts: [
    "A stone ledger sits open in the chamber. Names. Debts. Names.",
    "Pages of a forgotten ledger flutter in a wind that isn't there.",
  ],
  roomTemplates: [
    { id: "r1", depth: 1, archetype: "combat", narrationKey: "woodland_clearing", monsterPool: ["goblin", "giant_rat", "bandit"] },
    { id: "r2", depth: 2, archetype: "combat", narrationKey: "dark_grove", monsterPool: ["bandit", "wolf", "forest_hag_minion"] },
    { id: "r3", depth: 2, archetype: "trial", narrationKey: "cavern" },
    { id: "r4", depth: 3, archetype: "combat", narrationKey: "stone_ruin", monsterPool: ["skeleton", "ghoul", "wolf"] },
    { id: "r5", depth: 3, archetype: "trial", narrationKey: "crypt_hall" },
    { id: "r6", depth: 4, archetype: "combat", narrationKey: "bone_pit", monsterPool: ["ogre", "wraith", "troll", "cultist"] },
    { id: "r7", depth: 5, archetype: "combat", narrationKey: "inner_sanctum", monsterPool: ["troll", "wraith", "shadow_drake"] },
  ],
  monsters,
  bosses,
};
