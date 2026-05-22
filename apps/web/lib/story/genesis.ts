/**
 * Per-preset seed-mercy narrative banks.
 *
 * Universal seed-mercy (Wave C) means all three starters share the same
 * death/respawn shape: the Seed grows the pilgrim back, the world
 * remembers, and the voice escalates with each return. The cadence of
 * the arc is the same across presets (confusion → recognition →
 * resolve → tired weight), but each preset speaks it in its own
 * vocabulary so the same engine branch reads as native to the realm.
 *
 * Two narrative ideas hang off this file:
 *
 *   1. **Seed mercy.** Death isn't final. Three banks (fantasy / cyberpunk /
 *      scifi); the engine picks by `state.preset`.
 *
 *   2. **The Pilgrim's Brand.** Long before the player, a fire-mage
 *      walked the Reach and burned. Her blade — or one of its sisters —
 *      is buried in the second clearing. The Hag is `weakTo: fire` for
 *      a reason. **Fantasy-only**: the brand is a story object tied to
 *      `forcedFirstWeaponElement: "fire"` on the fantasy starter.
 *
 * Pure data + selector functions. No engine state, no chain reads.
 * Imported by `lib/engine/index.ts` (mercy lines + brand drops) and
 * `lib/story/progression.ts` (mercy/finality copy on the realm cards).
 */

import type { Preset } from "../engine/types";

export type RespawnVoice = {
  death: string;
  respawn: readonly string[];
};

// The arc each preset bank walks:
//   attempt 2 → confusion. The world is wrong and you have been here.
//   attempt 3 → recognition. You taste copper / static / coolant.
//   attempt 4 → resolve. The antagonist is no longer amused.
//   attempt 5+ → tired weight. The realm itself is bored of you.

const FANTASY_VOICES: readonly RespawnVoice[] = [
  // attempt 2 — first death, first return
  {
    death:
      "Black blood on your tongue. The Hag laughs, and somewhere far below " +
      "the world remembers your name.",
    respawn: [
      "You wake in mud. The bell is tolling. You have been here before — " +
        "but only just.",
      "The Seed has grown you again, from its own root. The Reach will not " +
        "let you leave that easily.",
    ],
  },
  // attempt 3
  {
    death:
      "Your knees fold. The Hag turns away without looking. The Reach pulls " +
      "you back through the wet earth.",
    respawn: [
      "You wake in mud. The bell tolls. You taste copper, and then you taste " +
        "rain.",
      "The forest knows your gait now.",
    ],
  },
  // attempt 4
  {
    death:
      "You fall. The Hag does not laugh this time. She is taking notes.",
    respawn: [
      "You wake in mud. The bell is tolling. The Hag is waiting — and she " +
        "has stopped being amused.",
    ],
  },
  // attempt 5
  {
    death:
      "You fall. Somewhere behind the trees a second bell joins the first.",
    respawn: [
      "You wake in mud. The bell is tolling. The Reach is tired of you. " +
        "Be quick.",
    ],
  },
];

const FANTASY_VOICE_LATE: RespawnVoice = {
  death:
    "You fall. The Reach barely notices. It has done this before with you.",
  respawn: [
    "You wake in mud. The bell tolls. The Seed asks, without words, if this " +
      "is really how you want to keep spending it.",
  ],
};

const CYBERPUNK_VOICES: readonly RespawnVoice[] = [
  // attempt 2
  {
    death:
      "Your vision blooms white, then resolves into rain on a cracked HUD. " +
      "Somewhere a contract burns out a checksum.",
    respawn: [
      "You wake on wet asphalt. Neon is staining the puddles. The mark on " +
        "your hand is still there.",
      "The Seed has re-instantiated you. The district has not noticed yet. " +
        "Move.",
    ],
  },
  // attempt 3
  {
    death:
      "Static fills your mouth. Whatever killed you doesn't even bother to " +
      "log the kill. The pavement opens.",
    respawn: [
      "You wake on wet asphalt. Rain in your collar. You taste solder, then " +
        "you taste rain.",
      "The district has your gait on file now.",
    ],
  },
  // attempt 4
  {
    death:
      "You fall. The thing that did it pauses this time. It is taking " +
      "readings.",
    respawn: [
      "You wake on wet asphalt. The neon is brighter — or you are dimmer. " +
        "The district is waiting, and it has stopped being amused.",
    ],
  },
  // attempt 5
  {
    death:
      "You fall. Somewhere a second siren picks up the song of the first.",
    respawn: [
      "You wake on wet asphalt. The district is tired of you. Be quick.",
    ],
  },
];

const CYBERPUNK_VOICE_LATE: RespawnVoice = {
  death:
    "You fall. The district barely notices. It has done this before with you.",
  respawn: [
    "You wake on wet asphalt. The Seed asks, without words, if this is " +
      "really how you want to keep spending it.",
  ],
};

const SCIFI_VOICES: readonly RespawnVoice[] = [
  // attempt 2
  {
    death:
      "Coolant in your mouth. Somewhere a reactor cycle resets. The hull " +
      "exhales, and you exhale with it.",
    respawn: [
      "You wake on plating. A vent is breathing on your neck. The mark on " +
        "your hand is still there.",
      "The Seed has re-instantiated you. The reactor has not noticed yet. " +
        "Move.",
    ],
  },
  // attempt 3
  {
    death:
      "Your suit shrieks once and goes quiet. The thing that killed you " +
      "doesn't bother to confirm. The deck opens.",
    respawn: [
      "You wake on plating. You taste coolant, then you taste your own " +
        "breath in the helmet.",
      "The Core has your gait on file now.",
    ],
  },
  // attempt 4
  {
    death:
      "You fall. The drone-shape that did it pauses this time. It is taking " +
      "readings.",
    respawn: [
      "You wake on plating. The lights are colder — or you are. It is " +
        "waiting, and it has stopped being curious.",
    ],
  },
  // attempt 5
  {
    death:
      "You fall. Somewhere a second alarm sympathises with the first.",
    respawn: [
      "You wake on plating. The Core is tired of you. Be quick.",
    ],
  },
];

const SCIFI_VOICE_LATE: RespawnVoice = {
  death:
    "You fall. The Core barely notices. It has done this before with you.",
  respawn: [
    "You wake on plating. The Seed asks, without words, if this is really " +
      "how you want to keep spending it.",
  ],
};

const VOICE_BANK_BY_PRESET: Record<
  Preset,
  { early: readonly RespawnVoice[]; late: RespawnVoice }
> = {
  fantasy: { early: FANTASY_VOICES, late: FANTASY_VOICE_LATE },
  cyberpunk: { early: CYBERPUNK_VOICES, late: CYBERPUNK_VOICE_LATE },
  scifi: { early: SCIFI_VOICES, late: SCIFI_VOICE_LATE },
};

/**
 * Returns the respawn voice for the upcoming attempt (1-based) of the
 * given preset. The caller emits `voice.death` BEFORE the reset and
 * `voice.respawn` AFTER. Attempt 1 is the first run (no respawn yet);
 * attempt 2 is the first return after a death.
 */
export function respawnVoiceFor(
  preset: Preset,
  nextAttempt: number,
): RespawnVoice {
  const bank = VOICE_BANK_BY_PRESET[preset];
  const idx = nextAttempt - 2; // attempt 2 is bank.early[0]
  if (idx < 0) return bank.early[0]!; // defensive
  if (idx < bank.early.length) return bank.early[idx]!;
  return bank.late;
}

/**
 * Back-compat shim. Returns the fantasy voice — preserved for any
 * caller that hasn't been migrated to `respawnVoiceFor(preset, n)`.
 * Prefer `respawnVoiceFor` in new code.
 */
export function genesisRespawnVoice(nextAttempt: number): RespawnVoice {
  return respawnVoiceFor("fantasy", nextAttempt);
}

/**
 * Narration emitted ONCE per run when the player picks up the forced-fire
 * weapon drop in fantasy. Selected pseudo-deterministically from `pick`
 * (a uint32 derived from the loot rng) so the same run always reads the
 * same story.
 *
 * The brand is the same idea every time — a pilgrim died, her blade
 * remained — but the framing varies so consecutive respawns don't read
 * identically when the player finds another one.
 *
 * Fantasy-only — tied to `forcedFirstWeaponElement: "fire"` on the
 * fantasy starter realm config.
 */
const PILGRIM_BRAND_DROPS: readonly string[] = [
  "Under the moss, a blade wrapped in burnt cloth. The hilt is still warm. " +
    "Someone walked these rooms before you. They didn't walk back.",
  "A sword has been driven into the dirt to mark a grave. The wood around " +
    "it is charred. The name on the hilt is too faded to read.",
  "A scorched scabbard. The runes have melted into each other. Inside, the " +
    "blade is still hungry.",
  "A pilgrim's body kneels at the foot of an oak, long since dried to leather. " +
    "Her hand is wrapped around the grip. It opens for you.",
];

/**
 * Optional name override for the Pilgrim's Brand. The on-chain mint
 * encodes this as the asset's display name — the realm-themed
 * adjective/noun assembly is bypassed for this one drop so the card
 * actually reads as a story object.
 *
 * Variant pool kept small so two adjacent runs feel like sister blades,
 * not unrelated loot.
 */
const PILGRIM_BRAND_NAMES: readonly string[] = [
  "The Pilgrim's Brand",
  "Ember-Wake",
  "Ash-Vow",
  "The Bell-Caller",
];

function pickFrom<T>(pool: readonly T[], rngPick: number): T {
  const idx = ((rngPick % pool.length) + pool.length) % pool.length;
  return pool[idx]!;
}

/**
 * Resolve the pilgrim's brand drop for this run. `rngPick` is any
 * uint32 drawn from the loot rng — same seed in produces same brand out,
 * so the narration and the assigned name align with the existing run's
 * deterministic chain.
 */
export function pilgrimsBrand(rngPick: number): {
  name: string;
  narration: string;
} {
  return {
    name: pickFrom(PILGRIM_BRAND_NAMES, rngPick),
    // pick the narration off a different bit of the seed so two runs that
    // happen to land on the same name don't also share the same line
    narration: pickFrom(PILGRIM_BRAND_DROPS, rngPick >>> 8),
  };
}
