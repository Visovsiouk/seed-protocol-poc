/**
 * Cyberpunk preset flavor bank — minimal PoC bank.
 *
 * As with scifi.ts, full expansion is. Same FlavorBank contract.
 */

import type { FlavorBank } from "./types";

const monsters = {
  street_punk: {
    id: "street_punk",
    name: "Street Punk",
    hp: 8,
    attackDie: 4,
    ac: 11,
    attackVerbs: [
      "swings a length of chain for {dmg}",
      "stabs with a sharpened bolt for {dmg}",
    ],
  },
  fixer: {
    id: "fixer",
    name: "Corporate Fixer",
    hp: 14,
    attackDie: 6,
    ac: 12,
    attackVerbs: [
      "fires a suppressed pistol for {dmg}",
      "cracks a stun-baton across your ribs for {dmg}",
    ],
  },
  ripper: {
    id: "ripper",
    name: "Cyber Ripper",
    hp: 18,
    attackDie: 6,
    ac: 13,
    attackVerbs: [
      "extends an arm-blade for {dmg}",
      "rakes you with mono-claws for {dmg}",
    ],
  },
  drone_swarm: {
    id: "drone_swarm",
    name: "Drone Swarm",
    hp: 22,
    attackDie: 6,
    ac: 14,
    attackVerbs: [
      "fans out and stings for {dmg}",
      "converges with a buzzing whine for {dmg}",
    ],
  },
  netrunner: {
    id: "netrunner",
    name: "Hostile Netrunner",
    hp: 16,
    attackDie: 8,
    ac: 12,
    attackVerbs: [
      "slams your firewall and feedback burns you for {dmg}",
      "shorts your subdermals for {dmg}",
    ],
  },
  enforcer: {
    id: "enforcer",
    name: "Sector Enforcer",
    hp: 30,
    attackDie: 10,
    ac: 15,
    attackVerbs: [
      "fires a rail-pistol for {dmg}",
      "checks you into the wall for {dmg}",
    ],
  },
} as const;

const bosses = {
  black_ice: {
    id: "black_ice",
    preset: "cyberpunk" as const,
    name: "Black ICE",
    baseHp: 70,
    attackDie: 8 as const,
    ac: 14,
    bakedEffects: ["crit_chance", "armor_pierce"] as ["crit_chance", "armor_pierce"],
    phase2NarrationKey: "black_ice_phase2",
    phase2AttackDie: 10 as const,
  },
  ceo: {
    id: "ceo",
    preset: "cyberpunk" as const,
    name: "The CEO",
    baseHp: 75,
    attackDie: 8 as const,
    ac: 14,
    bakedEffects: ["lifesteal", "dodge_chance"] as ["lifesteal", "dodge_chance"],
    phase2NarrationKey: "ceo_phase2",
    phase2AttackDie: 10 as const,
    phase2SuppressEffect: "dodge_chance" as const,
  },
  ghost: {
    id: "ghost",
    preset: "cyberpunk" as const,
    name: "The Ghost",
    baseHp: 65,
    attackDie: 8 as const,
    ac: 15,
    bakedEffects: ["multi_hit", "bleed"] as ["multi_hit", "bleed"],
    phase2NarrationKey: "ghost_phase2",
    phase2AttackDie: 10 as const,
  },
} as const;

export const cyberpunkBank: FlavorBank = {
  presetDisplayName: "Cyberpunk",
  rooms: {
    neon_alley: [
      "Rain falls through the neon. The alley hums with cheap synth.",
      "An ad-spam strip flickers a half-dead come-on.",
    ],
    rooftop: [
      "The skyline is a wall of light. Below, sirens.",
      "Wind whips the antennae array. You feel exposed.",
    ],
    underground: [
      "The tunnel smells of ozone and old grease.",
      "Subway trains roar past, close enough to feel.",
    ],
    server_den: [
      "Stacks of unlicensed hardware. Cooling fans roar.",
    ],
    arcology_atrium: [
      "Corporate green-glass. The floor is its own ad campaign.",
    ],
  },
  bossPhases: {
    black_ice_phase2: [
      "Black ICE roots deeper. The firewall fails behind you.",
      "ICE responds in patterns you don't recognize.",
    ],
    ceo_phase2: [
      "The CEO loosens their tie. Their security detail multiplies.",
      "The CEO's smile sharpens. They've stopped pretending.",
    ],
    ghost_phase2: [
      "The Ghost flickers — three of them now, only one is real.",
      "The Ghost smiles. You realize you've been bleeding.",
    ],
  },
  combatVerbs: ["shoot", "strike", "fire", "rush"],
  hazardSuccess: ["You hack the lock in time.", "You roll under the camera arc."],
  hazardFailure: ["Alarms. You bleed time and HP.", "The system catches you. It costs you."],
  discoveryRefund: ["A stash of unmarked cred.", "An unspent black-market voucher."],
  discoveryLore: ["A chip with someone's voicemail.", "A photograph, paper, defiant."],
  weaponAdjectives: [
    "Chrome",
    "Mono-Edged",
    "Smart-Linked",
    "Corp-Issued",
    "Glitched",
    "Recoded",
  ],
  weaponNouns: ["Pistol", "Katana", "Carbine", "Knife", "Smartgun"],
  armorAdjectives: [
    "Subdermal",
    "Reflex",
    "Corp-Grade",
    "Trauma",
    "Mirror-Coat",
  ],
  armorNouns: ["Jacket", "Suit", "Vest", "Weave", "Shell"],
  roomTemplates: [
    { id: "c1", depth: 1, archetype: "combat", narrationKey: "neon_alley", monsterPool: ["street_punk"] },
    { id: "c2", depth: 2, archetype: "combat", narrationKey: "rooftop", monsterPool: ["street_punk", "fixer"] },
    { id: "c3", depth: 2, archetype: "hazard", narrationKey: "underground" },
    { id: "c4", depth: 3, archetype: "combat", narrationKey: "server_den", monsterPool: ["fixer", "netrunner", "drone_swarm"] },
    { id: "c5", depth: 3, archetype: "discovery", narrationKey: "neon_alley" },
    { id: "c6", depth: 4, archetype: "combat", narrationKey: "arcology_atrium", monsterPool: ["ripper", "drone_swarm", "netrunner"] },
    { id: "c7", depth: 5, archetype: "combat", narrationKey: "arcology_atrium", monsterPool: ["ripper", "enforcer"] },
  ],
  monsters,
  bosses,
};
