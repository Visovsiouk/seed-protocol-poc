"use client";

/**
 * 4-Act onboarding banner shown above the play frame.
 *
 *   Act 1  — first run, no clears: pure diegetic voice. No protocol
 *            vocabulary at all (no "Seed", no "shards", no "Genesis",
 *            no "claim"). The player just woke up; the world hasn't
 *            named itself yet.
 *   Act 2  — one starter cleared: still diegetic — "another door".
 *   Act 3  — two starters cleared: "one last door".
 *   Act 4  — three starters cleared: protocol vocabulary surfaces for
 *            the first time. The two-tier Seed gate is explained:
 *              · 0 community realms in the registry → claim now
 *              · N community realms, not yet enough community clears →
 *                "clear M more" guidance, no CTA
 *              · gate satisfied → Claim Seed CTA
 *   Act 5  — has Seed: hide entirely.
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
          "You don't remember walking here — only the page that went wet, the ink that " +
          "climbed into your hand, the floor that stopped being a floor. The mark is warm " +
          "now, and it has started to count. Go down and meet what's waiting: what you " +
          "strip from the dead is yours to carry out — until the Reach takes it back, and " +
          "you with it. It has kept everyone who came this far before you.",
      };
    case 2:
      return {
        eyebrow: "The Reach keeps its dead — you walked out",
        title: "Wet stone thins to rain on concrete.",
        body:
          "Most who go down stay down, rewritten into the dark they fell in. You didn't. " +
          "What you carried came with you — the protocol only changed its accent. One " +
          "shard rests against the mark; two doors left below. Go down.",
      };
    case 3:
      return {
        eyebrow: "Two doors closed",
        title: "One door left, humming behind frost and glass.",
        body:
          "Two shards now, and the cold ahead is older than both — the dialect the protocol " +
          "spoke first, where the writing barely holds. Go down, find what the dead station " +
          "grew around its core, and break it before it keeps you too. Then you'll see what " +
          "you've become.",
      };
    case 4: {
      const communityRequirement = Math.min(3, progress.communityRealmCount);
      const communityRemaining = Math.max(
        0,
        communityRequirement - progress.communityClears,
      );
      // First-ever pilgrim — nobody has raised a community realm yet.
      // The Seed settles immediately.
      if (progress.communityRealmCount === 0) {
        return {
          eyebrow: "The three become one",
          title: "Three doors closed. The Seed is whole.",
          body:
            "Forest, district, reactor — every dialect the protocol speaks now knows your " +
            "shape. The three shards close against the mark and stop being shards: a Seed, " +
            "warm and whole, the thing the wardens died reaching for. No other hands have " +
            "raised doors yet, so there is nothing left to weigh you against. It's yours.",
          guidance:
            "You read your way in and walked your way out — the first to. When others " +
            "raise realms, later pilgrims will walk through them too. You were first.",
        };
      }
      // Community realms exist, but the pilgrim hasn't cleared enough yet.
      if (communityRemaining > 0) {
        return {
          eyebrow: "The Seed waits on you",
          title: "Three of the protocol's doors remember you.",
          body:
            "But the registry has grown while you walked. Other hands have raised doors " +
            "of their own, and the Seed won't settle until it has weighed you against " +
            "them too.",
          guidance:
            communityRemaining === 1
              ? "Go down one more realm raised by another pilgrim, and the Seed is yours."
              : `Go down ${communityRemaining} more realms raised by other pilgrims, and the Seed is yours.`,
        };
      }
      // Both tiers satisfied — Claim CTA appears.
      return {
        eyebrow: "Every door, walked",
        title: "You've gone down every door the protocol asked of you.",
        body:
          "Three founding realms, and the doors other pilgrims raised after. The shards " +
          "are one now; the Seed has weighed you and settled. Take it — then start writing " +
          "realms of your own.",
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
