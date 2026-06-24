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
    hp: 12,
    attackDie: 6,
    ac: 12,
    attackVerbs: [
      "swings a length of chain for {dmg}",
      "stabs with a sharpened bolt for {dmg}",
      "smashes a bottle on your visor for {dmg}",
    ],
  },
  fixer: {
    id: "fixer",
    name: "Corporate Fixer",
    hp: 18,
    attackDie: 6,
    ac: 13,
    attackVerbs: [
      "fires a suppressed pistol for {dmg}",
      "cracks a stun-baton across your ribs for {dmg}",
      "calls in a coordinate; a directional mic drops your guard for {dmg}",
    ],
  },
  ripper: {
    id: "ripper",
    name: "Cyber Ripper",
    hp: 24,
    attackDie: 6,
    ac: 14,
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
    weakTo: "emp",
  },
  netrunner: {
    id: "netrunner",
    name: "Hostile Netrunner",
    hp: 22,
    attackDie: 8,
    ac: 13,
    attackVerbs: [
      "slams your firewall and feedback burns you for {dmg}",
      "shorts your subdermals for {dmg}",
      "pushes a fake heartbeat onto your monitor for {dmg}",
    ],
    element: "emp",
    weakTo: "emp",
  },
  enforcer: {
    id: "enforcer",
    name: "Sector Enforcer",
    hp: 24,
    attackDie: 8,
    ac: 15,
    attackVerbs: [
      "fires a rail-pistol for {dmg}",
      "checks you into the wall for {dmg}",
      "deploys a riot drone that tags you for {dmg}",
    ],
    weakTo: "emp",
  },
  // Phase-4 additions below — round out the roster to 12.
  ad_mascot: {
    id: "ad_mascot",
    name: "Glitched Ad-Mascot",
    hp: 12,
    attackDie: 6,
    ac: 11,
    attackVerbs: [
      "tackles you with rictus enthusiasm for {dmg}",
      "blasts a jingle at concussive volume for {dmg}",
    ],
  },
  ganger_lieutenant: {
    id: "ganger_lieutenant",
    name: "Ganger Lieutenant",
    hp: 22,
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
    attackDie: 6,
    ac: 14,
    attackVerbs: [
      "whirls; a mirrored heel finds your jaw for {dmg}",
      "exhales a calmed breath and the floor leaves you for {dmg}",
    ],
    weakTo: "emp",
    resistTo: "incendiary",
  },
  ice_sentinel: {
    id: "ice_sentinel",
    name: "ICE Sentinel",
    hp: 24,
    attackDie: 6,
    ac: 15,
    attackVerbs: [
      "scans you; a numeric lash flays your nerves for {dmg}",
      "throws a packet that detonates between your eyes for {dmg}",
    ],
    element: "cryogenic",
    weakTo: "incendiary",
    resistTo: "cryogenic",
  },
  corp_assassin: {
    id: "corp_assassin",
    name: "Corp Assassin",
    hp: 24,
    attackDie: 8,
    ac: 15,
    attackVerbs: [
      "moves once; you bleed twice for {dmg}",
      "depresses a smart-trigger from across the room for {dmg}",
    ],
  },
  rogue_synth: {
    id: "rogue_synth",
    name: "Rogue Synth",
    hp: 24,
    attackDie: 6,
    ac: 15,
    attackVerbs: [
      "swings a load-bearing arm like a wrecking ball for {dmg}",
      "lifts you; servos hum, joints fail somewhere for {dmg}",
      "speaks your name in a voice you knew once for {dmg}",
    ],
    weakTo: "emp",
    resistTo: "incendiary",
  },
} as const;

const bosses = {
  black_ice: {
    id: "black_ice",
    preset: "cyberpunk" as const,
    name: "Black ICE",
    baseHp: 38,
    attackDie: 6 as const,
    ac: 14,
    bakedEffects: ["crit_chance", "armor_pierce"] as ["crit_chance", "armor_pierce"],
    phase2NarrationKey: "black_ice_phase2",
    phase2AttackDie: 8 as const,
    element: "cryogenic" as const,
    weakTo: "incendiary" as const,
    resistTo: "cryogenic" as const,
  },
  //  tuning: non-starter bosses match the starter recipe
  // (attackDie 6 / phase2 8); baseHp scales against effect severity.
  ceo: {
    id: "ceo",
    preset: "cyberpunk" as const,
    name: "The CEO",
    baseHp: 40,
    attackDie: 6 as const,
    ac: 14,
    bakedEffects: ["lifesteal", "dodge_chance"] as ["lifesteal", "dodge_chance"],
    phase2NarrationKey: "ceo_phase2",
    phase2AttackDie: 8 as const,
    phase2SuppressEffect: "dodge_chance" as const,
    weakTo: "emp" as const,
  },
  ghost: {
    id: "ghost",
    preset: "cyberpunk" as const,
    name: "The Ghost",
    baseHp: 36,
    attackDie: 6 as const,
    ac: 15,
    bakedEffects: ["multi_hit", "bleed"] as ["multi_hit", "bleed"],
    phase2NarrationKey: "ghost_phase2",
    phase2AttackDie: 8 as const,
    element: "nano" as const,
    weakTo: "laser" as const,
    resistTo: "nano" as const,
  },
  rogue_god: {
    id: "rogue_god",
    preset: "cyberpunk" as const,
    name: "The Rogue God",
    baseHp: 38,
    attackDie: 6 as const,
    ac: 15,
    bakedEffects: ["damage_reduction", "thorns"] as ["damage_reduction", "thorns"],
    phase2NarrationKey: "rogue_god_phase2",
    phase2AttackDie: 8 as const,
    element: "emp" as const,
    weakTo: "emp" as const,
  },
  matron: {
    id: "matron",
    preset: "cyberpunk" as const,
    name: "The Matron",
    baseHp: 36,
    attackDie: 6 as const,
    ac: 14,
    bakedEffects: ["regen", "crit_chance"] as ["regen", "crit_chance"],
    phase2NarrationKey: "matron_phase2",
    phase2AttackDie: 8 as const,
    phase2SuppressEffect: "regen" as const,
    weakTo: "incendiary" as const,
  },
} as const;

export const cyberpunkBank: FlavorBank = {
  presetDisplayName: "Cyberpunk",
  rooms: {
    neon_alley: [
      "Rain through the neon, warm as breath. The alley loops a cheap synth hook.",
      "An ad-strip stutters a half-dead come-on at no one.",
      "Steam off a grate carries a voice — yours, running a half-second behind you.",
    ],
    rooftop: [
      "The skyline is a wall of wet light. Below, sirens, always.",
      "Wind drags across the antenna array. Up here you read as a target.",
      "A drone passes twice. The third time it stops to look.",
    ],
    underground: [
      "The tunnel smells of ozone and old rain. The walls sweat.",
      "Trains roar past close enough to feel in your teeth.",
      "The graffiti glows and breathes — the paint is running someone's code.",
    ],
    server_den: [
      "Grey hardware in stacks, fans screaming, condensation pooling underneath.",
      "A wall of monitors loops the alley you just left — you're still in frame.",
      "Someone's taped a prayer over an open chassis. It didn't take.",
    ],
    arcology_atrium: [
      "Corporate green-glass, slick with engineered rain. The floor is selling you something.",
      "Three cameras pivot to follow you, perfectly in unison.",
      "A water feature runs an algorithm you can taste at the back of your teeth.",
    ],
    night_market: [
      "Stalls and steam. A vendor watches you and forgets to blink.",
      "Counterfeit chrome under counterfeit lanterns, all of it wet.",
    ],
    pirate_clinic: [
      "Surgical lamps over plastic sheeting, everything beaded with runoff.",
      "Old transplant labels peel off mismatched tile. One matches your blood type.",
    ],
  },
  bossPhases: {
    black_ice_phase2: [
      "Black ICE roots deeper. The firewall fails behind you.",
      "ICE responds in patterns you don't recognize.",
      "Your HUD ghosts a second feed — it's been watching you for a while.",
      "For a frame the ICE renders a face: a runner who came this far once, and never logged out.",
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
  roomTemplates: [
    // Three-room shape: depth 1 easy mob, depth 2 elite mob, boss at depth 3.
    { id: "c1", depth: 1, archetype: "combat", narrationKey: "neon_alley", monsterPool: ["street_punk", "ad_mascot"] },
    // Elite: chromed-up d6 heavies (HP 22-24 vs easy's 12) — a real step up
    // without the d8 spike of the enforcer/corp_assassin.
    { id: "c2", depth: 2, archetype: "combat", narrationKey: "arcology_atrium", monsterPool: ["ripper", "drone_swarm", "ice_sentinel", "rogue_synth"] },
  ],
  monsters,
  bosses,
};
