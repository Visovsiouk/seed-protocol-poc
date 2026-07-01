/**
 * Realm-by-realm story progression.
 *
 * The PoC's first-time experience is a forced linear walk through three
 * realms: fantasy → cyberpunk → sci-fi. The player picks each from the
 * base, clears its boss, and is returned to the base with the next realm
 * unsealed. The cross-genre gear translation now plays on *entry* into a
 * realm (see `GearTranslationScreen`); the per-clear copy below is purely
 * narrative.
 *
 * Pure: takes a `TutorialProgress` snapshot and returns per-preset lock
 * state plus narrative copy. No hooks, no chain reads.
 */

import type { Preset } from "@/lib/engine/types";
import type { TutorialProgress } from "@/lib/tutorial/progress";

/**
 * Canonical play order for the three starters. Each realm requires
 * every prior realm cleared before it unlocks. fantasy (index 0) is the
 * forced entry point after the cold-open branding scene.
 *
 * Order: fantasy → cyberpunk → sci-fi. This is also the finishing
 * gradient — wet, least-finished, most alive → hardening, half-set →
 * frozen, finished, dead — so the arc caps at the coldest world.
 */
export const REALM_ORDER: readonly Preset[] = ["fantasy", "cyberpunk", "scifi"];

export type RealmLockState =
  | "genesis-locked"    // First realm in REALM_ORDER — entry point, always playable
  | "cleared"           // Player has cleared this realm already
  | "unlocked"          // Available, not yet cleared (previous in chain is cleared)
  | "locked-pre-prev";  // Previous realm in the chain isn't cleared yet

export function lockStateFor(
  preset: Preset,
  progress: TutorialProgress,
): RealmLockState {
  const cleared = progress.cleared.some((c) => c.preset === preset);
  if (cleared) return "cleared";

  const idx = REALM_ORDER.indexOf(preset);
  if (idx <= 0) return "genesis-locked";

  const prev = REALM_ORDER[idx - 1]!;
  const prevCleared = progress.cleared.some((c) => c.preset === prev);
  return prevCleared ? "unlocked" : "locked-pre-prev";
}

export function isPlayable(state: RealmLockState): boolean {
  return state === "genesis-locked" || state === "unlocked" || state === "cleared";
}

/**
 * Returns the next preset the player is meant to walk into, given how
 * many starters they've cleared. Returns `null` once all three are
 * down (caller should switch to the post-arc picker).
 */
export function nextStarterFor(starterClears: number): Preset | null {
  if (starterClears >= REALM_ORDER.length) return null;
  return REALM_ORDER[starterClears] ?? null;
}

/**
 * Short lock-tease shown on a card the player can't yet enter, used
 * only on the post-arc picker (pre-arc the picker is hidden entirely).
 * Diegetic; no "complete X to unlock Y" UI language. The tease just
 * gestures at the order, not at stakes.
 */
export function lockTeaseFor(preset: Preset): string {
  if (preset === "cyberpunk") {
    return "Rain on setting neon, a world half-hardened. Someone down here tried to take a name that wasn't hers instead of earning one, and the gate she tried to crack is the gate she became.";
  }
  if (preset === "scifi") {
    return "Frost over a world sealed perfect and dead. Someone out here finished their making and tried to finish all of it — the cold is where that ambition stopped.";
  }
  return "";
}

/**
 * One-line stakes copy shown beneath a realm card on the picker. All
 * three starters are permadeath — a fall ends the run and forfeits every
 * unbanked finding. The copy stays per-preset so each realm names the
 * cost in its own voice.
 */
export function stakesNoteFor(preset: Preset): string {
  if (preset === "fantasy") {
    return "Fall here and the Reach binds you — sets you into its wet wood to hold the door, the way it bound the one laughing ahead. What you hadn't carried out stays down with you.";
  }
  if (preset === "cyberpunk") {
    return "Fall here and the district binds you — sets your face into its ICE to guard the next runner from the same shortcut. Everything you hadn't carried out stays in the dark.";
  }
  if (preset === "scifi") {
    return "Fall here and the station binds you — sets you into the cold to wait out the next climber. It vents everything still in your hands into the vacuum.";
  }
  return "";
}

export const STORY_HERO_OPEN = {
  eyebrow: "The doors stand open",
  title: "You named yourself where they could not. Now keep the Work open.",
  body:
    "You went down three worlds and carried yourself back out all three times — and at the " +
    "Altar you cut your own name into the roll, in the place where the bound aspirants' names " +
    "trail off unfinished. That name is a maker's power. It buys no rest: a world stays alive " +
    "only while climbers keep attempting it, and a world no one attempts hardens and cools " +
    "toward the finished, dead edge. Raise a world of your own and you take on the same charge " +
    "the wardens broke under — keep it attempted, or watch your making dim. The registry fills " +
    "with worlds other hands have raised, each one a mortal who chose to make instead of be " +
    "bound. Add yours.",
} as const;

/**
 * Per-preset post-clear interstitial copy.
 *
 * `warp-next` carries the next preset so the interstitial can render
 * the equipped-gear translation card before sending the player on.
 * `claim-seed` only fires once the two-tier gate is satisfied (3
 * starter clears + min(3, communityRealmCount) community clears).
 * `open-picker` is the post-arc default for ad-hoc clears.
 */
export type Interstitial = {
  eyebrow: string;
  title: string;
  body: string;
  cta:
    | { kind: "warp-next"; label: string; nextPreset: Preset }
    | { kind: "open-picker"; label: string }
    | { kind: "claim-seed"; label: string }
    | { kind: "none" };
};

export function interstitialFor(args: {
  justCleared: Preset;
  progress: TutorialProgress;
}): Interstitial {
  const { justCleared, progress } = args;
  const starterClears = progress.starterClears;

  // First door (fantasy) → warp to cyberpunk. Ruin: the one who CLUNG.
  if (justCleared === "fantasy" && starterClears === 1) {
    return {
      eyebrow: "Door I · the Reach falls · the one who clung",
      title: "She goes down without a fight she believes in.",
      body:
        "For one breath the Reach lets her be a woman again — an aspirant who finished this " +
        "world and could not bear to leave it, who stayed to tend it until it wore her like " +
        "a face. I only wanted to keep it, the wet wood says, in her voice. Then the Reach " +
        "takes her back, and the world begins to harden: under the moss is rain on setting " +
        "concrete. A spark kindles against the mark on your hand — the first of three, and " +
        "the mark burns a little less unfinished. One ruin read. Two to go. Carry out " +
        "what's yours; she is the proof of what it costs to love the made thing more than " +
        "the making.",
      cta: { kind: "warp-next", label: "Go down", nextPreset: "cyberpunk" },
    };
  }

  // Second door (cyberpunk) → warp to sci-fi. Ruin: the one who STOLE.
  if (justCleared === "cyberpunk" && starterClears === 2) {
    return {
      eyebrow: "Door II · the ICE shatters · the one who stole",
      title: "The last of her forks goes dark mid-handshake.",
      body:
        "Where the Hag clung, this one reached. A runner who tried to take a name that " +
        "wasn't hers — to copy a maker's power and skip the climb. A true-name can't be " +
        "taken; it knew her by the soul and bound her as the lock on the world's own gate. " +
        "Every copy she split off wore a face you could have worn, and not one of them was " +
        "the one that carried itself out. A second spark finds the mark, and the neon " +
        "hardens toward frost. Two of three now. She is the proof a name can't be stolen — " +
        "one more world, where someone tried to end it instead.",
      cta: { kind: "warp-next", label: "Go down", nextPreset: "scifi" },
    };
  }

  // Third door (sci-fi) → end of arc. Ruin: the one who tried to END the Work.
  // Whether the Name claim actually lights up is decided by the gate at the
  // caller; this just hands off the right shape and lets the parent gate it.
  if (justCleared === "scifi" && starterClears >= 3) {
    return {
      eyebrow: "Door III · the Core goes quiet · the one who would end it",
      title: "It shows you the last line it was writing, and the line just stops.",
      body:
        "The oldest bound aspirant, and the only one who ever earned its name before you. " +
        "It made. It finished its world. And then it tried to finish the Work itself — to " +
        "write the last line and hold all of creation still and perfect and dead, so no new " +
        "maker could ever add to it. The cold took it here, at the finished edge, where its " +
        "ambition ran out. Its whisper drops below hearing and the third spark settles " +
        "against the mark. You carry all three up now — not a Name yet, only the sparks that " +
        "kindle it. Three ruins read: one who clung, one who stole, one who would have ended " +
        "it. The base has an Altar where the three sparks kindle whole. Climb. You already " +
        "know what the wardens did wrong.",
      cta: { kind: "claim-seed", label: "Climb to the Altar" },
    };
  }

  // Any community-realm clear, or out-of-band starter clears post-arc.
  return {
    eyebrow: "Realm cleared",
    title: "Another world mastered, another bound aspirant laid down.",
    body:
      "The warden falls and for a breath wears a mortal's face — someone who came this far, " +
      "reached for a name, and was bound into the world instead of carrying themselves out. " +
      "This world was raised by a hand like yours and stays alive only while hands like yours " +
      "keep attempting it; you just kept it alive a little longer. Its findings are yours to " +
      "carry up. The base is still above; the registry still has worlds no one has gone down " +
      "to the warden of yet.",
    cta: { kind: "open-picker", label: "Climb back to the base" },
  };
}
