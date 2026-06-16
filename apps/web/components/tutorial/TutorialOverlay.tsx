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
        eyebrow: "You wake somewhere",
        title: "There is a bell, and a laugh, and mud under your hand.",
        body:
          "You don't remember walking here. Something is waiting in the dark ahead. " +
          "Walk into it — the ground will hold you, and what falls from what you kill " +
          "is yours to carry.",
      };
    case 2:
      return {
        eyebrow: "Another door opens",
        title: "The forest closed. Somewhere else opens.",
        body:
          "What you carried here came with you. The shape of it changed; the weight " +
          "didn't. Walk forward.",
      };
    case 3:
      return {
        eyebrow: "One last door",
        title: "Two doors closed. One hums behind glass.",
        body:
          "You know how this goes by now. Cross the threshold, find the thing at the " +
          "end, and bring it down. Then you'll see what kind of thing you've become.",
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
          eyebrow: "Act 4 · The Seed",
          title: "Three doors closed behind you. The Seed is whole.",
          body:
            "Forest, district, reactor — every skin the protocol wore now knows your " +
            "shape. The registry is still empty of doors raised by other hands, and so " +
            "there is nothing more to weigh you against. The Seed is yours.",
          guidance:
            "Once others raise their realms, later pilgrims will be asked to walk " +
            "through them too. You arrived first.",
        };
      }
      // Community realms exist, but the pilgrim hasn't cleared enough yet.
      if (communityRemaining > 0) {
        return {
          eyebrow: "Act 4 · The Seed waits",
          title: "Three of the protocol's doors remember you.",
          body:
            "But the registry has grown since you started walking. Other hands have " +
            "raised doors of their own, and the Seed will weigh you against them " +
            "before it settles.",
          guidance:
            communityRemaining === 1
              ? "Clear one more realm raised by another pilgrim, and the Seed will be yours."
              : `Clear ${communityRemaining} more realms raised by other pilgrims, and the Seed will be yours.`,
        };
      }
      // Both tiers satisfied — Claim CTA appears.
      return {
        eyebrow: "Act 4 · The Seed",
        title: "You have walked through every door the protocol asked of you.",
        body:
          "Three starters, and the pilgrims who came before. The Seed has weighed you " +
          "and settled. Take it.",
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
