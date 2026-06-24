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
 * forced entry point after the cold-open Book scene.
 *
 * Order: fantasy → cyberpunk → sci-fi. The cyberpunk middle step is
 * the deliberate tonal pivot — neon over wet stone — and sci-fi caps
 * the arc with the longest tonal stretch from the start.
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
    return "Rain on neon, behind a door that opens only after the Reach falls.";
  }
  if (preset === "scifi") {
    return "A signal threading toward something that hasn't begun yet.";
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
    return "Death here is final. The wet earth keeps you, and keeps what you hadn't carried out.";
  }
  if (preset === "cyberpunk") {
    return "Death here is final. The district keeps you, and everything you hadn't carried out stays in the dark.";
  }
  if (preset === "scifi") {
    return "Death here is final. The station keeps you, and vents everything still in hand.";
  }
  return "";
}

export const STORY_HERO_OPEN = {
  eyebrow: "The doors stand open",
  title: "Three doors closed behind you. The rest are up to you.",
  body:
    "The founding doors stay walkable, the market shows goods it kept hidden before, and " +
    "the registry fills with doors other hands have raised. You read your way this far; " +
    "what comes next, you write.",
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

  // First door (fantasy) → warp to cyberpunk.
  if (justCleared === "fantasy" && starterClears === 1) {
    return {
      eyebrow: "Door I · the Reach falls",
      title: "Her laughter splinters into static.",
      body:
        "The Hag drops to one knee, and for a breath her face is only a face — someone " +
        "who walked this far and was kept. Then the Reach drops with her. The wet wood " +
        "thins; beneath it is rain on concrete. A shard settles warm against the mark on " +
        "your hand: the first third of something. Two doors down to go. Carry what's yours.",
      cta: { kind: "warp-next", label: "Go down", nextPreset: "cyberpunk" },
    };
  }

  // Second door (cyberpunk) → warp to sci-fi.
  if (justCleared === "cyberpunk" && starterClears === 2) {
    return {
      eyebrow: "Door II · the ICE shatters",
      title: "Blue smoke peels back from a longer corridor.",
      body:
        "Black ICE goes dark, and in the last of its light it almost wears a face you " +
        "could have worn. A second shard finds the mark, warmer than the first — two " +
        "thirds now, and the cold ahead is older than either. One more door down. What " +
        "you carry will travel; the protocol sees to that.",
      cta: { kind: "warp-next", label: "Go down", nextPreset: "scifi" },
    };
  }

  // Third door (sci-fi) → end of arc. Whether the Seed claim actually
  // lights up is decided by the gate at the caller; this just hands
  // off the right shape and lets the parent gate the button.
  if (justCleared === "scifi" && starterClears >= 3) {
    return {
      eyebrow: "Door III · the Core goes quiet",
      title: "Three doors closed behind you.",
      body:
        "The Core's whisper drops below hearing, and the last thing it shows you is a " +
        "reader's face — the one it used to be, kept here to keep the door. The third " +
        "shard settles warm against the mark; you carry all three up now. They are not " +
        "the Seed yet — only the Seed in pieces. The base has an Altar where shards are " +
        "pressed whole, and it will weigh whether the three you've brought are enough. " +
        "Climb. Let it weigh you.",
      cta: { kind: "claim-seed", label: "Climb to the Altar" },
    };
  }

  // Any community-realm clear, or out-of-band starter clears post-arc.
  return {
    eyebrow: "Realm cleared",
    title: "Another door walked, another dialect read.",
    body:
      "The warden falls and the world thins behind you. This door was raised by a hand " +
      "like yours — read clean now, its findings yours to carry up. The base is still " +
      "above; the registry still has doors you haven't opened.",
    cta: { kind: "open-picker", label: "Climb back to the base" },
  };
}
