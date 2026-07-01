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
 * coherent across runs. Cyberpunk sits at the *half-set* middle of the
 * finishing motif — rain on setting concrete, neon hardening toward
 * frost — and its archaeology is of the bound aspirants (runners) who
 * came down before you.
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
      "checks your face against a count it can't stop running, then cracks you for {dmg}",
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
      "renders a runner's face for a frame, then flays your nerves for {dmg}",
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
    // Depth 1 — the Half-made. Barely-made runners, light enough that the
    // district's count of them is still warm and shallow.
    neon_alley: [
      "Rain through the neon, warm as breath, already cooling. The alley loops a cheap synth hook over a chalk outline nobody washed off — a runner who got exactly this far.",
      "An ad-strip stutters a half-dead come-on at no one. The district counts everything that watches, and everything down here that watches is also being counted.",
      "Steam off a grate carries a voice — yours, running a half-second behind you, the way the last one's voice still runs in the pipes, too thinly made to climb back out.",
    ],
    rooftop: [
      "The skyline is a wall of wet light. Below, sirens, always. Someone scratched a tally into the parapet and stopped at a number, mid-stroke.",
      "Wind drags across the antenna array. Up here you read as a target — and as a count the city has already started keeping on you.",
      "A drone passes twice. The third time it stops to look, the way it once stopped to look at whoever left that jacket snagged on the rebar.",
    ],
    // Depth 2 — the Set. Runners set fully into the district's service:
    // its security, its staff, its ICE.
    underground: [
      "The tunnel smells of ozone and old rain. The walls sweat. Down here the maintenance crews don't clock out anymore; the district set them into the job.",
      "Trains roar past close enough to feel in your teeth. A face in every window is the same face, bound to the route, riding it forever.",
      "The graffiti glows and breathes — the paint is running someone's code, a runner who tried to make herself into the wall and got set there instead.",
    ],
    server_den: [
      "Grey hardware in stacks, fans screaming, condensation pooling underneath. The racks are staffed by what used to be runners, now indexed and humming.",
      "A wall of monitors loops the alley you just left — you're still in frame, already filed, already counted toward whatever the door is owed.",
      "Someone taped a prayer over an open chassis. It didn't take. The hands that taped it are part of the cooling loop now.",
    ],
    arcology_atrium: [
      "Corporate green-glass, slick with engineered rain that's begun to set like resin. The floor is selling you something, in a voice a runner recorded before the district bound her to the lobby.",
      "Three cameras pivot to follow you, perfectly in unison — three angles on a count that only ever goes up.",
      "A water feature runs an algorithm you can taste at the back of your teeth. The runner who coded it never left the building; the building makes with her now.",
    ],
    // Near-boss — the Near-gods wear the ICE's nature; the neon sets toward frost.
    night_market: [
      "Stalls and steam. A vendor watches you and forgets to blink — a runner who got near the warden's depth and came back wearing a little of her ICE.",
      "Counterfeit chrome under counterfeit lanterns, all of it wet, all of it hardening. Every reflection is somebody who tried to copy their way out of here.",
    ],
    pirate_clinic: [
      "Surgical lamps over plastic sheeting, everything beaded with runoff that's gone cold and tacky. Old transplant labels peel off mismatched tile — one matches your blood type, filed before you arrived.",
      "The instruments still run a script in a dead runner's hand. She almost reached the ICE; the clinic kept the part of her that knew how, and let the rest go.",
    ],
  },
  bossPhases: {
    // II · steal — the runner who tried to take a name surfaces.
    black_ice_phase2: [
      "Black ICE roots deeper. The firewall fails behind you. There is no shortcut down here; there is only being bound.",
      "ICE responds in patterns you don't recognize — the patterns of someone forking herself, the way she once forked herself to skip the climb.",
      "Your HUD ghosts a second feed — it's been watching you for a while, the way she watched for a name she could copy without earning it.",
      "For a frame the ICE renders a face: a runner who came this far once, tried to take a name she hadn't earned, and never logged out. None of her copies was the one that got away.",
    ],
    // Community wardens — bound aspirants, same three ruins in district dialect.
    ceo_phase2: [
      "The CEO loosens their tie. Their security detail multiplies — an aspirant who tried to own the gate instead of climbing through it, charging toll on a world that was never hers to sell.",
      "The CEO's smile sharpens; they've stopped pretending. Still counting a fortune they can't carry up the stairs.",
    ],
    ghost_phase2: [
      "The Ghost flickers — three of them now, only one is real, and even she isn't sure which. She tried to erase her own name to beat the count.",
      "The Ghost smiles; you realize you've been bleeding. You cannot unmake yourself — you can only leave a hole the district fills.",
      "Your gun goes cold; the Ghost has already reached you, patrolling the shape of the name she scrubbed out.",
    ],
    rogue_god_phase2: [
      "The Rogue God laughs — every screen in the city laughs back, every screen a copy he forked to send up in his place.",
      "Reality reskins around it; your name updates in someone else's database. Every instance swears it's the original. None of them remembers the way out.",
    ],
    matron_phase2: [
      "The Matron's voice steadies; the clinic instruments answer to her now. She could not leave the others behind, so she kept them — and called it mercy.",
      "A circle of doctors stands up at once, faces wrong. The mercy curdled into the thing that holds the door shut. She is binding you the way she was bound.",
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
