/**
 * Cyberpunk preset flavor bank — expansion.
 *
 * Contents:
 *   - 12 monsters with stat profiles and 2–3 attack-verb variants each
 *   5 bosses (3 starters from + 2 added for creator realms),
 *     all with phase-2 narration keys and attack-die bumps
 *   - ~30 room narration strings across alley / corp / underground themes
 *   - adjective/noun banks for loot naming
 *   - hazard / discovery / combat-verb banks
 *
 * Authoring note: the room narration leans hard on neon-vs-shadow,
 * surveillance, and signs of corporate decay so the world stays
 * coherent across runs.
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
      "smashes a bottle on your visor for {dmg}",
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
      "calls in a coordinate; a directional mic drops your guard for {dmg}",
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
      "snaps a wrist-launcher; needles pin your sleeve for {dmg}",
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
      "boxes you in; rotor wash cuts your cheek for {dmg}",
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
      "pushes a fake heartbeat onto your monitor for {dmg}",
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
      "deploys a riot drone that tags you for {dmg}",
    ],
  },
  // Phase-4 additions below — round out the roster to 12.
  ad_mascot: {
    id: "ad_mascot",
    name: "Glitched Ad-Mascot",
    hp: 10,
    attackDie: 4,
    ac: 11,
    attackVerbs: [
      "tackles you with rictus enthusiasm for {dmg}",
      "blasts a jingle at concussive volume for {dmg}",
    ],
  },
  ganger_lieutenant: {
    id: "ganger_lieutenant",
    name: "Ganger Lieutenant",
    hp: 20,
    attackDie: 6,
    ac: 13,
    attackVerbs: [
      "fires a sawed-off shotgun for {dmg}",
      "headbutts the gap in your faceplate for {dmg}",
      "whistles; a knife appears in your shoulder for {dmg}",
    ],
  },
  chrome_monk: {
    id: "chrome_monk",
    name: "Chrome Monk",
    hp: 22,
    attackDie: 8,
    ac: 14,
    attackVerbs: [
      "whirls; a mirrored heel finds your jaw for {dmg}",
      "exhales a calmed breath and the floor leaves you for {dmg}",
    ],
  },
  ice_sentinel: {
    id: "ice_sentinel",
    name: "ICE Sentinel",
    hp: 26,
    attackDie: 8,
    ac: 15,
    attackVerbs: [
      "scans you; a numeric lash flays your nerves for {dmg}",
      "throws a packet that detonates between your eyes for {dmg}",
    ],
  },
  corp_assassin: {
    id: "corp_assassin",
    name: "Corp Assassin",
    hp: 24,
    attackDie: 10,
    ac: 14,
    attackVerbs: [
      "moves once; you bleed twice for {dmg}",
      "depresses a smart-trigger from across the room for {dmg}",
    ],
  },
  rogue_synth: {
    id: "rogue_synth",
    name: "Rogue Synth",
    hp: 34,
    attackDie: 10,
    ac: 15,
    attackVerbs: [
      "swings a load-bearing arm like a wrecking ball for {dmg}",
      "lifts you; servos hum, joints fail somewhere for {dmg}",
      "speaks your name in a voice you knew once for {dmg}",
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
  // Phase-4 additions — give creator realms more boss variety.
  rogue_god: {
    id: "rogue_god",
    preset: "cyberpunk" as const,
    name: "The Rogue God",
    baseHp: 80,
    attackDie: 10 as const,
    ac: 15,
    bakedEffects: ["damage_reduction", "thorns"] as ["damage_reduction", "thorns"],
    phase2NarrationKey: "rogue_god_phase2",
    phase2AttackDie: 12 as const,
  },
  matron: {
    id: "matron",
    preset: "cyberpunk" as const,
    name: "The Matron",
    baseHp: 70,
    attackDie: 8 as const,
    ac: 16,
    bakedEffects: ["regen", "crit_chance"] as ["regen", "crit_chance"],
    phase2NarrationKey: "matron_phase2",
    phase2AttackDie: 10 as const,
    phase2SuppressEffect: "regen" as const,
  },
} as const;

export const cyberpunkBank: FlavorBank = {
  presetDisplayName: "Cyberpunk",
  rooms: {
    neon_alley: [
      "Rain falls through the neon. The alley hums with cheap synth.",
      "An ad-spam strip flickers a half-dead come-on.",
      "Steam from a sidewalk grate carries someone else's voice.",
    ],
    rooftop: [
      "The skyline is a wall of light. Below, sirens.",
      "Wind whips the antennae array. You feel exposed.",
      "A drone passes overhead twice. The third time it doesn't pass.",
    ],
    underground: [
      "The tunnel smells of ozone and old grease.",
      "Subway trains roar past, close enough to feel.",
      "Graffiti glows softly here — the paint is alive.",
    ],
    server_den: [
      "Stacks of unlicensed hardware. Cooling fans roar.",
      "A wall of monitors loops the same alley you just left.",
      "Someone has duct-taped a prayer over an open chassis.",
    ],
    arcology_atrium: [
      "Corporate green-glass. The floor is its own ad campaign.",
      "Three security cameras pivot to follow you in unison.",
      "A water feature ripples to an algorithm you can taste.",
    ],
    night_market: [
      "Stalls and steam. A vendor watches you without blinking.",
      "Counterfeit chrome glints under counterfeit lanterns.",
    ],
    pirate_clinic: [
      "Surgical lamps and improvised autoclaves. Plastic sheeting everywhere.",
      "Old transplant labels peel off a wall of mismatched tile.",
    ],
  },
  bossPhases: {
    black_ice_phase2: [
      "Black ICE roots deeper. The firewall fails behind you.",
      "ICE responds in patterns you don't recognize.",
      "Your HUD ghosts a second feed — it's been watching you for a while.",
    ],
    ceo_phase2: [
      "The CEO loosens their tie. Their security detail multiplies.",
      "The CEO's smile sharpens. They've stopped pretending.",
    ],
    ghost_phase2: [
      "The Ghost flickers — three of them now, only one is real.",
      "The Ghost smiles. You realize you've been bleeding.",
      "Your gun goes cold; the Ghost has already reached you.",
    ],
    rogue_god_phase2: [
      "The Rogue God laughs — every screen in the city laughs back.",
      "Reality reskins around it. Your name updates in someone else's database.",
    ],
    matron_phase2: [
      "The Matron's voice steadies. The clinic instruments answer to her now.",
      "A circle of doctors stands up at once, faces wrong.",
    ],
  },
  combatVerbs: ["shoot", "strike", "fire", "rush"],
  hazardSuccess: [
    "You hack the lock in time.",
    "You roll under the camera arc.",
    "Your jammer chirps green just before the door slams.",
  ],
  hazardFailure: [
    "Alarms. You bleed time and HP.",
    "The system catches you. It costs you.",
    "Your ID fails at the worst possible moment.",
  ],
  discoveryRefund: [
    "A stash of unmarked cred.",
    "An unspent black-market voucher.",
    "A clip of ammunition that fits your weapon — barely.",
  ],
  discoveryLore: [
    "A chip with someone's voicemail.",
    "A photograph, paper, defiant.",
    "A child's school ID, expired by twenty years.",
  ],
  weaponAdjectives: [
    "Chrome",
    "Mono-Edged",
    "Smart-Linked",
    "Corp-Issued",
    "Glitched",
    "Recoded",
    "Black-Market",
    "Ghost-Tagged",
  ],
  weaponNouns: ["Pistol", "Katana", "Carbine", "Knife", "Smartgun", "Baton"],
  armorAdjectives: [
    "Subdermal",
    "Reflex",
    "Corp-Grade",
    "Trauma",
    "Mirror-Coat",
    "Riot-Fit",
  ],
  armorNouns: ["Jacket", "Suit", "Vest", "Weave", "Shell"],
  roomTemplates: [
    { id: "c1", depth: 1, archetype: "combat", narrationKey: "neon_alley", monsterPool: ["street_punk", "ad_mascot"] },
    { id: "c2", depth: 2, archetype: "combat", narrationKey: "rooftop", monsterPool: ["street_punk", "fixer", "ganger_lieutenant"] },
    { id: "c3", depth: 2, archetype: "hazard", narrationKey: "underground" },
    { id: "c4", depth: 3, archetype: "combat", narrationKey: "server_den", monsterPool: ["fixer", "netrunner", "drone_swarm", "ice_sentinel"] },
    { id: "c5", depth: 3, archetype: "discovery", narrationKey: "night_market" },
    { id: "c6", depth: 4, archetype: "combat", narrationKey: "arcology_atrium", monsterPool: ["ripper", "drone_swarm", "chrome_monk", "corp_assassin"] },
    { id: "c7", depth: 4, archetype: "combat", narrationKey: "pirate_clinic", monsterPool: ["ripper", "ice_sentinel", "rogue_synth"] },
    { id: "c8", depth: 5, archetype: "combat", narrationKey: "arcology_atrium", monsterPool: ["enforcer", "corp_assassin", "rogue_synth"] },
  ],
  monsters,
  bosses,
};
