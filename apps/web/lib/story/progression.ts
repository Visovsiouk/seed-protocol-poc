/**
 * Realm-by-realm story progression.
 *
 * The PoC frames Fantasy as Genesis — the player's first run is locked
 * to The Hollow Reach. From there the player walks the realms in a
 * strict linear chain: each starter realm only opens once the previous
 * one's clearReceipt is in the player's wallet on-chain (the
 * `TutorialProgress.cleared` list is derived from those receipts —
 * see `lib/reads/boss-clears.ts`).
 *
 * Pure: takes a `TutorialProgress` snapshot and returns per-preset
 * lock state plus narrative copy. No hooks, no chain reads.
 */

import type { Preset } from "@/lib/engine/types";
import type { TutorialProgress } from "@/lib/tutorial/progress";

/**
 * Canonical play order. Each realm requires every prior realm cleared
 * before it unlocks. Genesis (index 0) is always playable.
 */
export const REALM_ORDER: readonly Preset[] = ["fantasy", "scifi", "cyberpunk"];

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
 * Short lock-tease shown on a card the player can't yet enter. Kept
 * deliberately diegetic — no "complete X to unlock Y" UI language.
 */
export function lockTeaseFor(preset: Preset): string {
  if (preset === "scifi") {
    return "A signal you cannot hear yet. The Reach must fall first.";
  }
  if (preset === "cyberpunk") {
    return "Wet neon behind a door that won't open. Not until the Drift goes dark.";
  }
  return "";
}

/**
 * Hero copy variants for the landing page. We swap based on whether
 * the player has cleared Genesis yet — pre-Genesis is a single
 * focused entry point, post-Genesis is the full picker with all
 * realms (starter + creator) in play.
 */
export const STORY_HERO_GENESIS = {
  eyebrow: "Genesis · The Hollow Reach",
  title: "Every world begins in a forest.",
  body:
    "You wake in mud. A bell tolls somewhere ahead, and the Hag is laughing. " +
    "The Reach is the first skin the Seed ever wore — and the only door open " +
    "to you tonight. Walk it down. Two more skins will wake when she falls.",
} as const;

export const STORY_HERO_OPEN = {
  eyebrow: "The Seed is splitting",
  title: "Any realm with a boss is a shard of the Seed.",
  body:
    "Starter realms. Realms other players have raised. A boss is a boss — " +
    "every clear is a fragment recovered. Three distinct realms, one Seed " +
    "made whole.",
} as const;

/**
 * Per-preset post-clear interstitial copy, keyed by *which clear this
 * was for the player*. `clearOrder` is 1-based: 1 = first realm
 * cleared, 2 = second, 3 = third.
 */
export type Interstitial = {
  eyebrow: string;
  title: string;
  body: string;
  /**
   * Primary CTA. Post-Genesis we route the player back to the realm
   * picker so they can see *every* available door — including realms
   * other players have raised — rather than hard-coding two starters.
   */
  cta:
    | { kind: "open-picker"; label: string }
    | { kind: "claim-seed"; label: string }
    | { kind: "none" };
};

export function interstitialFor(args: {
  justCleared: Preset;
  progress: TutorialProgress;
}): Interstitial {
  const { justCleared, progress } = args;
  const distinct = progress.distinctClears;

  if (justCleared === "fantasy" && distinct === 1) {
    return {
      eyebrow: "Genesis · The Reach falls",
      title: "Her laughter splinters into static.",
      body:
        "The Hag drops to one knee, and the Reach drops with her. The wet wood " +
        "thins. Beneath it is steel. Beneath the steel is neon. Beneath that — " +
        "doors you've never seen, raised by hands that aren't yours. The Seed was " +
        "never one thing. Go find the next shard.",
      cta: { kind: "open-picker", label: "Open the realm picker" },
    };
  }

  if (distinct === 2) {
    if (justCleared === "scifi") {
      return {
        eyebrow: "Shard II · The Core goes dark",
        title: "A thread of code unspools toward wetter ground.",
        body:
          "The Drift Station's reactor cools to a whisper, and somewhere in that " +
          "whisper is a routing table. One last address — could be neon, could be " +
          "stone, could be a door someone else built last week. The Seed wants to " +
          "be whole, and you are most of the way there.",
        cta: { kind: "open-picker", label: "Find the last shard" },
      };
    }
    if (justCleared === "cyberpunk") {
      return {
        eyebrow: "Shard II · The ICE shatters",
        title: "The contract burns in your hand.",
        body:
          "Black ICE bleeds blue across the wet street. In the smoke you can hear " +
          "an old engine spinning up — a colony ship, maybe, or a lich's furnace, " +
          "or a stranger's experiment. One realm remains. The Seed is nearly whole.",
        cta: { kind: "open-picker", label: "Find the last shard" },
      };
    }
    // Fantasy cleared as the second realm (creator realm cleared first).
    return {
      eyebrow: "Shard II · The Reach falls",
      title: "Two skins shed. One remains.",
      body:
        "The Hag's bones bleach white in the rain. Somewhere far above this forest " +
        "another door is unlocking. One realm remains.",
      cta: { kind: "open-picker", label: "Find the last shard" },
    };
  }

  if (distinct >= 3) {
    return {
      eyebrow: "Shard III · The Seed remembers",
      title: "Three realms remember you. Claim the Seed.",
      body:
        "Three doors closed behind you. Three bosses dead. The Seed has counted " +
        "every step. Mint your Seed SBT to take the keys to realm authorship.",
      cta: { kind: "claim-seed", label: "Claim Seed SBT" },
    };
  }

  return {
    eyebrow: "Realm cleared",
    title: "The realm is yours.",
    body: "Pick the next door.",
    cta: { kind: "open-picker", label: "Open the realm picker" },
  };
}
