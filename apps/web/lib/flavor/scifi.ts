/**
 * Sci-fi preset flavor bank — expansion.
 *
 * Contents:
 *   - 12 monsters with stat profiles and 2–3 attack-verb variants each
 *   5 bosses (3 starters from + 2 added for creator realms),
 *     all with phase-2 narration keys and attack-die bumps
 *   - ~30 room narration strings across station / ship / surface themes
 *   - adjective/noun banks for loot naming
 *   - hazard / discovery / combat-verb banks
 *
 * Authoring note: motifs intentionally repeat (vacuum, frost, salvage
 * tape, dead crew chatter) so individual lines vary while the world
 * stays coherent.
 */

import type { FlavorBank } from "./types";

const monsters = {
  drone: {
    id: "drone",
    name: "Patrol Drone",
    hp: 12,
    attackDie: 6,
    ac: 12,
    attackVerbs: [
      "strafes you with laser-fire for {dmg}",
      "pulses an EM burst that scorches you for {dmg}",
      "swivels and hits you with a stun lance for {dmg}",
    ],
    element: "ion",
    weakTo: "ion",
  },
  scavenger: {
    id: "scavenger",
    name: "Hull Scavenger",
    hp: 20,
    attackDie: 6,
    ac: 13,
    attackVerbs: [
      "swings a torque-wrench for {dmg}",
      "lashes out with a sparking grip for {dmg}",
      "shoves a cargo claw into your side for {dmg}",
    ],
  },
  drifter: {
    id: "drifter",
    name: "Void Drifter",
    hp: 22,
    attackDie: 6,
    ac: 13,
    attackVerbs: [
      "phases through cover and tears you for {dmg}",
      "wraps you in cold static for {dmg}",
      "whispers a name that wasn't yours and burns you for {dmg}",
    ],
    element: "void",
    weakTo: "photon",
    resistTo: "void",
  },
  warbot: {
    id: "warbot",
    name: "Decommissioned Warbot",
    hp: 24,
    attackDie: 6,
    ac: 14,
    attackVerbs: [
      "stomps and rakes for {dmg}",
      "fires a salvo for {dmg}",
      "boots a rusted protocol and slams into you for {dmg}",
    ],
    weakTo: "ion",
  },
  xenoid: {
    id: "xenoid",
    name: "Xenoid",
    hp: 24,
    attackDie: 6,
    ac: 14,
    attackVerbs: [
      "ripples and slashes for {dmg}",
      "extrudes a barbed limb that pierces you for {dmg}",
      "spits a glob of caustic resin that eats your armor for {dmg}",
    ],
    weakTo: "plasma",
  },
  exo_hunter: {
    id: "exo_hunter",
    name: "Exo Hunter",
    hp: 24,
    attackDie: 6,
    ac: 15,
    attackVerbs: [
      "fires a railgun shot for {dmg}",
      "closes and chains a melee strike for {dmg}",
      "vents a coolant flare into your visor for {dmg}",
    ],
    weakTo: "ion",
  },
  // Phase-4 additions below — round out the roster to 12.
  saboteur: {
    id: "saboteur",
    name: "Mutineer Saboteur",
    hp: 16,
    attackDie: 6,
    ac: 12,
    attackVerbs: [
      "primes a shaped charge in your direction for {dmg}",
      "jams a stun-baton under your plate for {dmg}",
    ],
  },
  spore_husk: {
    id: "spore_husk",
    name: "Spore Husk",
    hp: 24,
    attackDie: 6,
    ac: 12,
    attackVerbs: [
      "exhales a cloud of dust that burns your lungs for {dmg}",
      "swings a malformed arm for {dmg}",
      "ruptures, and shards drive into you for {dmg}",
    ],
  },
  cryo_revenant: {
    id: "cryo_revenant",
    name: "Cryo Revenant",
    hp: 24,
    attackDie: 6,
    ac: 14,
    attackVerbs: [
      "drags rime across your suit seals for {dmg}",
      "grips your wrist and frost cracks your gauntlet for {dmg}",
    ],
    element: "cryo",
    weakTo: "plasma",
    resistTo: "cryo",
  },
  rogue_loader: {
    id: "rogue_loader",
    name: "Rogue Cargo Loader",
    hp: 30,
    attackDie: 8,
    ac: 13,
    attackVerbs: [
      "swings a pallet brace like a club for {dmg}",
      "pins you against a crate; servos whine for {dmg}",
      "lifts and drops a container on your foot for {dmg}",
    ],
  },
  ai_acolyte: {
    id: "ai_acolyte",
    name: "AI Acolyte",
    hp: 26,
    attackDie: 8,
    ac: 13,
    attackVerbs: [
      "recites diagnostic prayers; your HUD bleeds for {dmg}",
      "calls down a targeting solution that strafes you for {dmg}",
    ],
    element: "photon",
    weakTo: "ion",
  },
  void_lich: {
    id: "void_lich",
    name: "Void Lich",
    hp: 24,
    attackDie: 6,
    ac: 15,
    attackVerbs: [
      "opens a hairline rift; vacuum bites your shoulder for {dmg}",
      "lifts you in a still-spreading gravity well for {dmg}",
      "speaks a frequency your bones recognize for {dmg}",
    ],
    element: "void",
    weakTo: "photon",
    resistTo: "void",
  },
} as const;

const bosses = {
  ai_core: {
    id: "ai_core",
    preset: "scifi" as const,
    name: "The AI Core",
    baseHp: 42,
    attackDie: 6 as const,
    ac: 14,
    bakedEffects: ["multi_hit", "crit_chance"] as ["multi_hit", "crit_chance"],
    phase2NarrationKey: "ai_core_phase2",
    phase2AttackDie: 8 as const,
    element: "ion" as const,
    weakTo: "ion" as const,
  },
  //  tuning: non-starter bosses match the starter recipe
  // (attackDie 6 / phase2 8); baseHp scales against effect severity.
  hive_queen: {
    id: "hive_queen",
    preset: "scifi" as const,
    name: "The Hive Queen",
    baseHp: 44,
    attackDie: 6 as const,
    ac: 14,
    bakedEffects: ["bleed", "regen"] as ["bleed", "regen"],
    phase2NarrationKey: "hive_queen_phase2",
    phase2AttackDie: 8 as const,
    phase2SuppressEffect: "regen" as const,
    weakTo: "plasma" as const,
  },
  void_prince: {
    id: "void_prince",
    preset: "scifi" as const,
    name: "The Void Prince",
    baseHp: 36,
    attackDie: 6 as const,
    ac: 14,
    bakedEffects: ["dodge_chance", "armor_pierce"] as ["dodge_chance", "armor_pierce"],
    phase2NarrationKey: "void_prince_phase2",
    phase2AttackDie: 8 as const,
    element: "void" as const,
    weakTo: "photon" as const,
    resistTo: "void" as const,
  },
  reactor_wyrm: {
    id: "reactor_wyrm",
    preset: "scifi" as const,
    name: "The Reactor Wyrm",
    baseHp: 38,
    attackDie: 6 as const,
    ac: 15,
    bakedEffects: ["damage_reduction", "thorns"] as ["damage_reduction", "thorns"],
    phase2NarrationKey: "reactor_wyrm_phase2",
    phase2AttackDie: 8 as const,
    element: "plasma" as const,
    weakTo: "cryo" as const,
    resistTo: "plasma" as const,
  },
  oracle: {
    id: "oracle",
    preset: "scifi" as const,
    name: "The Oracle",
    baseHp: 36,
    attackDie: 6 as const,
    ac: 15,
    bakedEffects: ["lifesteal", "dodge_chance"] as ["lifesteal", "dodge_chance"],
    phase2NarrationKey: "oracle_phase2",
    phase2AttackDie: 8 as const,
    phase2SuppressEffect: "dodge_chance" as const,
    element: "photon" as const,
    weakTo: "void" as const,
  },
} as const;

export const scifiBank: FlavorBank = {
  presetDisplayName: "Sci-Fi",
  rooms: {
    docking_bay: [
      "Decommissioned. Half the lights are out, the rest failing in private.",
      "Hull plates breathe with the pressure cycle. Frost rides every seam.",
      "Cargo nets sway in a draft that can't exist out here.",
    ],
    server_farm: [
      "Stacks humming. A few have gone quiet, frozen mid-thought.",
      "Status LEDs blink red as one. The cold has gotten into the logic.",
      "An emergency log scrolls past, every name scratched out.",
    ],
    derelict_corridor: [
      "The lights flicker. Between flickers, something is further along than it was.",
      "Frost furs the bulkheads. The seals gave out a long time ago.",
      "Bootprints in the dust lead away from a door sealed on your side.",
    ],
    cargo_hold: [
      "Containers stacked to the ceiling, most of them open and emptied.",
      "Mag-boots clamp loud here; whatever's listening already knows.",
      "What was loaded last was taken out fast, and not by hand.",
    ],
    reactor_room: [
      "The reactor pulses behind shielding — the only warm thing left, and barely.",
      "Coolant weeps to the deck and freezes there. The steam won't rise.",
      "A klaxon repeats one word. The cold has worn it down to nothing.",
    ],
    bridge: [
      "Consoles dead. One chair turned to face the door, waiting.",
      "The viewport holds a planet that isn't on any chart.",
    ],
    cryo_vault: [
      "Pods frosted opaque. A few have cracked open from the inside.",
      "The vault smells of ozone and something older than the ship's first log.",
    ],
  },
  bossPhases: {
    ai_core_phase2: [
      "The Core reroutes. Its voice sharpens.",
      "Auxiliary lights snap on. The Core has been waiting for this.",
      "It speaks a name that should be impossible for it to know.",
      "Between reroutes it loops one old log — a crew voice reading something aloud, the instant before the Core kept them.",
    ],
    hive_queen_phase2: [
      "The Queen molts. Her new carapace is harder.",
      "She calls. Something deep in the station answers.",
    ],
    void_prince_phase2: [
      "The Prince's silhouette flickers — phasing.",
      "Reality strains around him.",
      "He smiles in a direction you can't look.",
    ],
    reactor_wyrm_phase2: [
      "The Wyrm's plating glows white. The deck buckles beneath it.",
      "Coolant lines rupture in a spray; the Wyrm drinks the steam.",
    ],
    oracle_phase2: [
      "The Oracle's eyes go matte. It has stopped pretending to be uncertain.",
      "A second voice joins its first. They harmonize.",
    ],
  },
  roomTemplates: [
    // Three-room shape: depth 1 easy mob, depth 2 elite mob, boss at depth 3.
    { id: "s1", depth: 1, archetype: "combat", narrationKey: "docking_bay", monsterPool: ["drone", "scavenger", "saboteur"] },
    // Elite: tough d6 mobs (HP 24 vs easy's 12-20) — a real step up without
    // the d8 damage spike of the rogue_loader.
    { id: "s2", depth: 2, archetype: "combat", narrationKey: "reactor_room", monsterPool: ["warbot", "xenoid", "spore_husk", "cryo_revenant"] },
  ],
  monsters,
  bosses,
};
