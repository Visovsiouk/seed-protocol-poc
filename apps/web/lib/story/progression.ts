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

export const STORY_HERO_OPEN = {
  eyebrow: "The card is spent",
  title: "Three stamps, and a signet of your own. Don't sign out — write.",
  body:
    "You went down three pages and carried yourself back out of all three, so the book had to " +
    "admit your name. That is what a signet is. It will let you sign out, and signing out shuts " +
    "the book behind you with everyone still inside — which is exactly what he has been working " +
    "toward for two hundred years. So press it into a blank quire instead. A book that is still " +
    "being written cannot be given a colophon, and every page another hand adds is one more he " +
    "has to come back for.",
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

  // First page (fantasy) → cyberpunk. Hesper Alder, 1847: the one who stayed.
  if (justCleared === "fantasy" && starterClears === 1) {
    return {
      eyebrow: "Page one · the Reach lets go · Hesper Alder, filed 1847",
      title: "She goes down without a fight she believes in.",
      body:
        "For one breath the wet wood lets her be a woman again — someone who mastered this " +
        "page in 1847 and could not bear to leave it. I only wanted to keep it, she says. " +
        "Then you tear the bookmark out, and the page stops being findable. Your mark goes " +
        "on the card: one stamp, and the first thing you have that he cannot revise.",
      cta: { kind: "warp-next", label: "Go down", nextPreset: "cyberpunk" },
    };
  }

  // Second page (cyberpunk) → scifi. Vesna Kord, 1981: the one who copied.
  if (justCleared === "cyberpunk" && starterClears === 2) {
    return {
      eyebrow: "Page two · the ICE shatters · Vesna Kord, filed 1981",
      title: "The last of her forks goes dark mid-handshake.",
      body:
        "Alder stayed. This one tried to copy a signet instead of earning one — and a signet " +
        "is the one thing that cannot be duplicated, so the district kept her as its own " +
        "lock. Every fork she split off wore a face you could have worn. Second stamp. The " +
        "neon here is still wet, which means he has not finished with this page yet.",
      cta: { kind: "warp-next", label: "Go down", nextPreset: "scifi" },
    };
  }

  // Third page (sci-fi) → end of arc. Aurelio Ker, 1908: the one who finished.
  // Whether the claim actually lights up is decided by the gate at the caller;
  // this just hands off the right shape and lets the parent gate it.
  if (justCleared === "scifi" && starterClears >= 3) {
    return {
      eyebrow: "Page three · the core goes quiet · Aurelio Ker, filed 1908",
      title: "He shows you the last line he was writing, and the line just stops.",
      body:
        "Ker earned a signet and used it exactly as you are about to: he wrote this page and " +
        "put his own name on it. Then he reached for the colophon — and the only other hand " +
        "that ever wanted to write it filed him into his own work. There were six stations " +
        "before this one. Third stamp. The card is full, and the Altar is where it gets read.",
      cta: { kind: "claim-seed", label: "Take it to the Altar" },
    };
  }

  // Any community-realm clear, or out-of-band starter clears post-arc.
  return {
    eyebrow: "Bookmark torn out",
    title: "Another page that has stopped being findable.",
    body:
      "Whatever was holding this one open wore a mortal's face for a breath on the way down — " +
      "someone who came this far and did not carry themselves back out. This page was written " +
      "by a hand like yours, which is why he has to come back for it at all. Its findings are " +
      "yours to carry up, and the registry still has pages nobody has reached the bookmark of.",
    cta: { kind: "open-picker", label: "Back to the base" },
  };
}
