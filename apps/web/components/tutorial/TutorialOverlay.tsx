"use client";

/**
 * 3-Act onboarding banner shown above the play frame.
 * The copy and CTA change with `progress.act`:
 *
 *   Act 1  — first run, no clears: explain dungeon → loot → equip loop.
 *   Act 2  — one realm cleared: introduce the Seed (you must clear three
 *            distinct realms before you can claim it).
 *   Act 3  — two cleared: same message tightened, "one more realm".
 *   Act 4  — three+ cleared, no Seed yet: surface the Claim CTA.
 *   Act 5  — has Seed: hide the overlay entirely (post-tutorial play).
 *
 * The component is presentational; it doesn't fetch anything itself. The
 * caller passes a `TutorialProgress` derived from on-chain reads (Phase
 * 2C) or `emptyTutorialProgress()` during 2B dev.
 */

import type { TutorialProgress } from "@/lib/tutorial/progress";

type Props = {
  progress: TutorialProgress;
  /**: route to the Seed claim flow. */
  onClaimSeed?: () => void;
  /** User-dismissible per session (collapsed; still visible as a strip). */
  onDismiss?: () => void;
  dismissed?: boolean;
};

type ActCopy = {
  eyebrow: string;
  title: string;
  body: string;
};

function copyFor(progress: TutorialProgress): ActCopy | null {
  switch (progress.act) {
    case 1:
      return {
        eyebrow: "Genesis · The Hollow Reach",
        title: "Every world begins in a forest.",
        body:
          "You wake in mud. A bell is tolling somewhere ahead, and the Hag is laughing. " +
          "The Reach is Genesis — the first skin the Seed ever wore. Six rooms down, " +
          "then her. Clear her and two more realms will open their eyes.",
      };
    case 2:
      return {
        eyebrow: "Act 2 · The Seed splits",
        title: "Two skins woke when she fell. Pick one.",
        body:
          "A derelict station and a neon district both know your name now. Either door " +
          "is yours — your loot crosses every threshold the protocol holds. Two more " +
          "realms cleared and the Seed SBT is yours to claim.",
      };
    case 3:
      return {
        eyebrow: "Act 3 · One skin remains",
        title: "One last door.",
        body:
          "Two realms remember you. The third is humming behind glass. One more boss, " +
          "one more receipt, and the Seed is whole — and with it, the keys to author " +
          "your own realm under the protocol.",
      };
    case 4:
      return {
        eyebrow: "Act 4 · Claim the Seed",
        title: "Three realms remember you. The Seed is whole.",
        body:
          "Forest, station, district — every skin the Seed wore now knows your shape. " +
          "Mint your Seed SBT to take the keys to realm authorship and the protocol's " +
          "deeper surface.",
      };
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
        className="text-xs uppercase tracking-widest opacity-60 hover:opacity-100 transition self-start"
      >
        {copy.eyebrow} — show tutorial
      </button>
    );
  }

  return (
    <section
      aria-label="Tutorial guidance"
      className="flex flex-col gap-2 p-4 rounded-md"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid var(--color-preset-accent)",
      }}
    >
      <header className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] uppercase tracking-widest opacity-60">
          {copy.eyebrow}
        </span>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-[11px] opacity-50 hover:opacity-100 transition"
          >
            Hide
          </button>
        )}
      </header>
      <h2 className="text-lg font-semibold">{copy.title}</h2>
      <p className="text-sm opacity-80 leading-relaxed">{copy.body}</p>
      {progress.distinctClears > 0 && progress.act < 4 && (
        <p className="text-xs opacity-50">
          Realms cleared: {progress.distinctClears} / 3
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
            Claim Seed SBT
          </button>
        </div>
      )}
    </section>
  );
}
