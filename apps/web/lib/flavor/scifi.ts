/**
 * Sci-fi preset flavor bank — minimal PoC bank.
 *
 * expands this to full breadth. For we ship
 * a working bank: 6 monsters, 3 bosses, enough room narration to run a
 * playable demo session without recycling lines within a single run.
 */

import type { FlavorBank } from "./types";

const monsters = {
  drone: {
    id: "drone",
    name: "Patrol Drone",
    hp: 8,
    attackDie: 4,
    ac: 12,
    attackVerbs: [
      "strafes you with laser-fire for {dmg}",
      "pulses an EM burst that scorches you for {dmg}",
    ],
  },
  scavenger: {
    id: "scavenger",
    name: "Hull Scavenger",
    hp: 14,
    attackDie: 6,
    ac: 12,
    attackVerbs: [
      "swings a torque-wrench for {dmg}",
      "lashes out with a sparking grip for {dmg}",
    ],
  },
  drifter: {
    id: "drifter",
    name: "Void Drifter",
    hp: 18,
    attackDie: 6,
    ac: 13,
    attackVerbs: [
      "phases through cover and tears you for {dmg}",
      "wraps you in cold static for {dmg}",
    ],
  },
  warbot: {
    id: "warbot",
    name: "Decommissioned Warbot",
    hp: 26,
    attackDie: 8,
    ac: 14,
    attackVerbs: [
      "stomps and rakes for {dmg}",
      "fires a salvo for {dmg}",
    ],
  },
  xenoid: {
    id: "xenoid",
    name: "Xenoid",
    hp: 22,
    attackDie: 8,
    ac: 13,
    attackVerbs: [
      "ripples and slashes for {dmg}",
      "extrudes a barbed limb that pierces you for {dmg}",
    ],
  },
  exo_hunter: {
    id: "exo_hunter",
    name: "Exo Hunter",
    hp: 32,
    attackDie: 10,
    ac: 15,
    attackVerbs: [
      "fires a railgun shot for {dmg}",
      "closes and chains a melee strike for {dmg}",
    ],
  },
} as const;

const bosses = {
  ai_core: {
    id: "ai_core",
    preset: "scifi" as const,
    name: "The AI Core",
    baseHp: 70,
    attackDie: 8 as const,
    ac: 14,
    bakedEffects: ["multi_hit", "crit_chance"] as ["multi_hit", "crit_chance"],
    phase2NarrationKey: "ai_core_phase2",
    phase2AttackDie: 10 as const,
  },
  hive_queen: {
    id: "hive_queen",
    preset: "scifi" as const,
    name: "The Hive Queen",
    baseHp: 75,
    attackDie: 8 as const,
    ac: 14,
    bakedEffects: ["bleed", "regen"] as ["bleed", "regen"],
    phase2NarrationKey: "hive_queen_phase2",
    phase2AttackDie: 10 as const,
    phase2SuppressEffect: "regen" as const,
  },
  void_prince: {
    id: "void_prince",
    preset: "scifi" as const,
    name: "The Void Prince",
    baseHp: 80,
    attackDie: 10 as const,
    ac: 15,
    bakedEffects: ["dodge_chance", "armor_pierce"] as ["dodge_chance", "armor_pierce"],
    phase2NarrationKey: "void_prince_phase2",
    phase2AttackDie: 12 as const,
  },
} as const;

export const scifiBank: FlavorBank = {
  presetDisplayName: "Sci-Fi",
  rooms: {
    docking_bay: [
      "Decommissioned. Half the lights are out.",
      "Hull plates breathe gently with the station's pressure cycle.",
    ],
    server_farm: [
      "Server stacks hum. A few have stopped humming.",
      "Status LEDs blink red in unison. That can't be good.",
    ],
    derelict_corridor: [
      "The corridor lights flicker. Something else moves between flickers.",
      "Frost on the bulkheads. The seals failed long ago.",
    ],
    cargo_hold: [
      "Containers stacked to the ceiling. Many are open.",
      "Magnetic boots clamp loudly here. Stealth is not an option.",
    ],
    reactor_room: [
      "The reactor pulses behind shielding. The air is warm and metallic.",
    ],
  },
  bossPhases: {
    ai_core_phase2: [
      "The Core reroutes. Its voice sharpens.",
      "Auxiliary lights snap on. The Core has been waiting for this.",
    ],
    hive_queen_phase2: [
      "The Queen molts. Her new carapace is harder.",
      "She calls. Something deep in the station answers.",
    ],
    void_prince_phase2: [
      "The Prince's silhouette flickers — phasing.",
      "Reality strains around him.",
    ],
  },
  combatVerbs: ["fire", "strike", "burst", "lunge"],
  hazardSuccess: [
    "The system reads green. You're through.",
    "You override the alert in time.",
  ],
  hazardFailure: [
    "The system bites back. You absorb the worst of it.",
    "Sparks and smoke. You lose ground.",
  ],
  discoveryRefund: [
    "A cache of credits, untouched.",
    "An unspent emergency kit.",
  ],
  discoveryLore: [
    "A crew log, half-corrupted.",
    "A serial number, scratched into the wall by a hand that wanted to be remembered.",
  ],
  weaponAdjectives: [
    "Plasma-Core",
    "Railgun",
    "Pulse",
    "Ion-Bound",
    "Salvage-Forged",
    "Quantum",
  ],
  weaponNouns: ["Rifle", "Blade", "Carbine", "Lance", "Sidearm"],
  armorAdjectives: [
    "Mark IV",
    "Ablative",
    "Hardshell",
    "Smart-Mesh",
    "Reactor-Lined",
  ],
  armorNouns: ["Suit", "Vest", "Plate", "Mesh", "Carapace"],
  roomTemplates: [
    { id: "s1", depth: 1, archetype: "combat", narrationKey: "docking_bay", monsterPool: ["drone", "scavenger"] },
    { id: "s2", depth: 2, archetype: "combat", narrationKey: "server_farm", monsterPool: ["drone", "drifter"] },
    { id: "s3", depth: 2, archetype: "hazard", narrationKey: "derelict_corridor" },
    { id: "s4", depth: 3, archetype: "combat", narrationKey: "cargo_hold", monsterPool: ["scavenger", "drifter", "warbot"] },
    { id: "s5", depth: 3, archetype: "discovery", narrationKey: "server_farm" },
    { id: "s6", depth: 4, archetype: "combat", narrationKey: "reactor_room", monsterPool: ["warbot", "xenoid"] },
    { id: "s7", depth: 5, archetype: "combat", narrationKey: "reactor_room", monsterPool: ["xenoid", "exo_hunter"] },
  ],
  monsters,
  bosses,
};
