"use client";

/**
 * 4-Act onboarding banner shown above the play frame.
 *
 *   Act 1  — first run, no clears. The card has been signed and nothing
 *            else has happened yet.
 *   Act 2  — one stamp: the binding changed your findings' accent.
 *   Act 3  — two stamps: one page left, and it is the finished one.
 *   Act 4  — three stamps. The signet is on offer, and this is the first
 *            surface that tells the player other borrowers exist.
 *   Act 5  — signet pressed: hide entirely.
 *
 * ── This file was missed by the terminology migration ──────────────────────
 * Every act above was still in the pre-rewrite register — a different word for
 * the player, for a page, for a stamp and for a bookmark, none of them canon.
 * None of it was catchable: the load-bearing words are all excluded from
 * `RETIRED_TERMS` as ambiguous (see the ceiling note in `canon.ts`), so the
 * component sweep could not see a single one.
 *
 * ── Act 4 used to describe a gate that does not exist ──────────────────────
 * It told the player the Seed would not settle until they had cleared up to
 * three *other borrowers'* pages, and `TutorialProgress` carries
 * `communityClears` / `communityRealmCount` to support exactly that. But the
 * Altar's button is gated on `eligibleForSeed`, which is `starterClears >= 3`
 * and nothing else — so the requirement was stated on screen and never
 * applied, and a player who believed it would go and do unnecessary work.
 *
 * The branching is kept, because *whether anyone has added a page* and
 * *whether you have been down one* are the best hooks in the game for saying
 * other players exist. What is gone is the claim that any of it is required.
 * If that gate is ever made real, this copy is where it gets re-promised.
 *
 * Presentational only; the caller passes a `TutorialProgress` derived
 * from on-chain reads (`useTutorialProgress`) or `emptyTutorialProgress()`.
 */

import type { TutorialProgress } from "@/lib/tutorial/progress";

type Props = {
  progress: TutorialProgress;
  /** Wired only at Act 4 when `eligibleForSeed` is true. */
  onClaimSeed?: () => void;
  /** User-dismissible per session (collapsed; still visible as a strip). */
  onDismiss?: () => void;
  dismissed?: boolean;
};

type ActCopy = {
  eyebrow: string;
  title: string;
  body: string;
  /** Optional secondary line surfaced under the body — used at Act 4
   *  to spell out the community-realm requirement when relevant. */
  guidance?: string;
};

function copyFor(progress: TutorialProgress): ActCopy | null {
  switch (progress.act) {
    case 1:
      return {
        eyebrow: "You read your way in",
        title: "A bell, a wet laugh, and mud under your hand.",
        body:
          "You don't remember walking here — only the card you signed and the page that " +
          "went wet around you. Go down and meet what's waiting: whatever you strip from " +
          "the dead is yours to carry out, which is the easy half. The Hollow Reach has " +
          "kept everyone who got this far before you.",
      };
    case 2:
      return {
        eyebrow: "One stamp on the card",
        title: "Wet stone thins to rain on concrete.",
        body:
          "Most who go down stay down — filed into the page they fell in, holding it open " +
          "so he can find it again. You didn't. What you carried came up with you; the " +
          "binding only changed its accent. One stamp pressed, two pages below.",
      };
    case 3:
      return {
        eyebrow: "Two stamps",
        title: "One page left, humming behind frost and glass.",
        body:
          "The last one is the coldest, because he reached it first and sealed it — the " +
          "writing there is finished and nothing in it moves. Something is still running " +
          "behind the frost anyway. Go down and tear the bookmark out before it keeps you " +
          "too.",
      };
    case 4: {
      const added = progress.communityRealmCount;

      // Nobody has pressed a signet yet — this wallet would be the first page
      // in the book that he did not write.
      if (added === 0) {
        return {
          eyebrow: "The card is full",
          title: "Three stamps, and nothing added to the book yet.",
          body:
            "Three of his own pages took your mark, so the book has to take your name. " +
            "The Altar will cut you a signet for it: one, soulbound, spent the moment you " +
            "use it, and worth exactly one page. Nobody has pressed one yet — the registry " +
            "holds only his three.",
          guidance:
            "Press yours into a blank quire and it is the first page in here he has to " +
            "come back for.",
        };
      }

      // Pages exist that borrowers added, and this one hasn't been down any.
      if (progress.communityClears === 0) {
        return {
          eyebrow: "The card is full, and the book has grown",
          title: "Other hands have been adding pages while you walked.",
          body:
            `The registry holds ${added} ${added === 1 ? "page" : "pages"} he did not ` +
            "write — borrowers like you, each one spending the single signet they get. " +
            "Your own is ready at the Altar and it does not wait on them. But those are " +
            "where this book is actually getting longer.",
          guidance:
            "Go down somebody else's page and it gives up more to whoever comes next. " +
            "Yours will want the same traffic.",
        };
      }

      // Has been down pages borrowers wrote. The strongest footing for the
      // signet beat: they have seen the thing they are about to join.
      return {
        eyebrow: "His three, and somebody else's",
        title: "You have been down pages he never wrote.",
        body:
          "So you already know what you are about to make: a page with your name on it, " +
          "open to strangers, giving up more each time one of them goes down it. The Altar " +
          "will cut your signet. One, and never another.",
        guidance:
          "A book still being written cannot be given a colophon. No single hand can keep " +
          "it that way.",
      };
    }
    case 5:
      return null;
  }
}

export function TutorialOverlay({
  progress,
  onClaimSeed,
  onDismiss,
  dismissed,
}: Props) {
  const copy = copyFor(progress);
  if (!copy) return null;

  if (dismissed) {
    return (
      <button
        type="button"
        onClick={onDismiss}
        className="text-xs uppercase tracking-widest opacity-70 hover:opacity-100 transition self-start"
      >
        {copy.eyebrow} — show
      </button>
    );
  }

  const showCtaCount =
    progress.starterClears > 0 && progress.act < 4;

  return (
    <section
      aria-label="Tutorial guidance"
      className="flex flex-col gap-2 p-4 rounded-md"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--color-preset-accent)",
      }}
    >
      <header className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] uppercase tracking-widest opacity-70">
          {copy.eyebrow}
        </span>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-[11px] opacity-65 hover:opacity-100 transition"
          >
            Hide
          </button>
        )}
      </header>
      <h2 className="text-lg font-semibold">{copy.title}</h2>
      <p className="text-sm opacity-80 leading-relaxed">{copy.body}</p>
      {copy.guidance && (
        <p className="text-sm opacity-70 leading-relaxed">{copy.guidance}</p>
      )}
      {showCtaCount && (
        <p className="text-xs opacity-65">
          Doors closed behind you: {progress.starterClears} / 3
        </p>
      )}
      {progress.eligibleForSeed && onClaimSeed && (
        <div className="flex">
          <button
            type="button"
            onClick={onClaimSeed}
            className="rounded-md px-4 py-2 text-sm font-medium transition"
            style={{
              background: "var(--color-preset-accent)",
              color: "var(--color-preset-bg)",
            }}
          >
            Claim the Seed
          </button>
        </div>
      )}
    </section>
  );
}
