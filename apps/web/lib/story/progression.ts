/**
 * Realm-by-realm story progression.
 *
 * The PoC's first-time experience is a forced linear walk through three
 * doors: fantasy → cyberpunk → sci-fi. There is no picker pre-3-clear
 * and no protocol vocabulary on screen until the third boss falls. Each
 * realm-clear hands off to a warp interstitial (see `WarpInterstitial`)
 * that dramatizes the equipped gear translating into the next realm's
 * preset — same on-chain token, re-rendered against the new adapter.
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
 * Diegetic; no "complete X to unlock Y" UI language. All three realms
 * are seed-mercy now, so the tease just gestures at the order, not at
 * stakes.
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
 * three starters are seed-mercy — death rewinds the run to depth 1 and
 * the protocol re-grows the player from the same ground. Community
 * realms can still opt in to permadeath, so the copy stays per-preset.
 */
export function stakesNoteFor(preset: Preset): string {
  if (preset === "fantasy") {
    return "Death here is a long walk back through wet earth. The ground grows you again.";
  }
  if (preset === "cyberpunk") {
    return "Death here resolves to a respawn token. You wake on the same wet curb.";
  }
  if (preset === "scifi") {
    return "Death here trips a quiet reboot. The corridor remembers nothing.";
  }
  return "";
}

export const STORY_HERO_OPEN = {
  eyebrow: "The doors stand open",
  title: "Three doors closed behind you. The rest are up to you.",
  body:
    "Starter realms remain walkable; the bazaar has goods you couldn't see before; " +
    "realms other hands have raised line the registry. The protocol is still weighing " +
    "you, and it will keep doing so until the Seed itself is in your hand.",
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
        "The Hag drops to one knee, and the Reach drops with her. The wet wood thins. " +
        "Beneath it is rain on concrete. A shard catches the light in your hand. The " +
        "ground here remembers you. Carry what's yours.",
      cta: { kind: "warp-next", label: "Walk forward", nextPreset: "cyberpunk" },
    };
  }

  // Second door (cyberpunk) → warp to sci-fi.
  if (justCleared === "cyberpunk" && starterClears === 2) {
    return {
      eyebrow: "Door II · the ICE shatters",
      title: "Blue smoke peels back from a longer corridor.",
      body:
        "The contract burns in your hand. Behind the neon, a hum that isn't an engine " +
        "and isn't a furnace. One more door. The shards on your belt are heavier than " +
        "they look, and they'll travel.",
      cta: { kind: "warp-next", label: "Walk forward", nextPreset: "scifi" },
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
        "The reactor's whisper drops below hearing. You step out onto a registry full " +
        "of doors raised by other hands. The protocol has counted every step. What " +
        "you've earned is waiting; what's left depends on what comes next.",
      cta: { kind: "claim-seed", label: "See what's waiting" },
    };
  }

  // Any community-realm clear, or out-of-band starter clears post-arc.
  return {
    eyebrow: "Realm cleared",
    title: "The realm is yours.",
    body: "Pick the next door.",
    cta: { kind: "open-picker", label: "Open the realm picker" },
  };
}
