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
 * Per-preset post-clear copy for the panel that fills the focal slot when a
 * boss falls.
 *
 * ── The `cta` is the way out, and it is the only way out ───────────────────
 * This used to be dead data. The panel rendered the prose, dropped the `cta`
 * on the floor, and `EncounterFrame` routed the player home on a 3.5s timer —
 * so the single biggest payoff in the game was the one beat nobody finished
 * reading. The label below is now the label on a real button, and nothing
 * leaves this screen until the player presses it.
 *
 * `kind` is what the caller switches on, so the names are load-bearing and
 * `progression.test.ts` asserts them:
 *
 *   - `warp-next`   — a starter clear with another founding page below it.
 *     Carries `nextPreset` so the panel can *name* what is next. It does not
 *     route there: the base is where the player picks a page, and the pick is
 *     half the point of having unsealed one.
 *   - `claim-seed`  — the arc-completing (third) clear. The caller lands the
 *     player on the Altar instead of the picker.
 *   - `open-picker` — any clear outside the arc, including creator pages.
 *   - `none`        — no exit of its own; the host panel supplies one.
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

/**
 * The words on the way out, or `undefined` when this beat offers none.
 *
 * `kind: "none"` is the one variant with no `label`, so every caller that
 * wants the label has to narrow the union first. They shouldn't each have to:
 * the host panel's job is to fall back to its own default, and that is the
 * same decision in both play routes.
 */
export function ctaLabel(story: Interstitial): string | undefined {
  return story.cta.kind === "none" ? undefined : story.cta.label;
}

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
      cta: { kind: "warp-next", label: "Carry yourself out", nextPreset:"cyberpunk" },
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
      cta: { kind: "warp-next", label: "Carry yourself out", nextPreset:"scifi" },
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

/**
 * Clearing a page a borrower wrote.
 *
 * `interstitialFor` can't answer this: it keys off `REALM_ORDER` and a
 * `TutorialProgress`, and a creator page is in neither. Before this existed
 * the creator play route passed no panel at all, so founding a page, going
 * down it and tearing out its bookmark ended in silence — the one clear in
 * the game with an author to address, and the only one with nothing to say.
 *
 * Both cases name the bookmark, because that name is the thing the generated
 * lore just spent a paragraph establishing and the thing the player just
 * killed. `mine` is the fork worth having: somebody else's page is a page the
 * Colophon has to come back for, and your own page is the same fact pointed at
 * you — with the detail that you did not put that bookmark in it.
 *
 * No stamp is pressed here, and the copy must not imply one: the card has
 * exactly three slots and they belong to the founding pages.
 */
export function creatorPageCleared(args: {
  /** The page's registered name. */
  pageName: string;
  /** Who was filed into its heart — `RealmLore.bookmarkName`. */
  bookmarkName: string;
  /** Whether the connected wallet owns this page. */
  mine: boolean;
}): Interstitial {
  const { pageName, bookmarkName, mine } = args;

  if (mine) {
    return {
      eyebrow: `Your own page · ${bookmarkName} torn out`,
      title: "The bookmark in the page you wrote was never yours to place.",
      body:
        `You pressed a signet into a blank quire and ${pageName} is what came of it. Then you went ` +
        `down it and found ${bookmarkName} filed into its heart, holding it open to be found again. ` +
        `Somebody put them there after you finished writing, and it was not you. The page is still ` +
        `being added to, which is the only reason it cannot be given a colophon yet.`,
      cta: { kind: "open-picker", label: "Back to the base" },
    };
  }

  return {
    eyebrow: `Bookmark torn out · ${bookmarkName}`,
    title: "The hand holding this page open finally lets go.",
    body:
      `${bookmarkName} was filed into ${pageName} so it could always be found again, and you have ` +
      `just taken that away from whoever was coming back for it. A borrower wrote this page with a ` +
      `signet they earned — the way Ker wrote his — so it is an addition to the book rather than ` +
      `part of the authorized edition. What you carried up is yours. The page stays, unfindable.`,
    cta: { kind: "open-picker", label: "Back to the base" },
  };
}
