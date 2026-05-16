"use client";

/**
 * Inline narrative beat rendered inside the run-over panel of
 * `<EncounterFrame/>`. Surfaces the post-clear story copy plus a
 * single primary CTA — either "open the picker" (so the player sees
 * every available door, starter or community) or "claim the Seed" on
 * the third clear.
 *
 * Copy + CTA shape come from `interstitialFor()` so the picker, this
 * component, and the tutorial overlay can't drift apart.
 */

import Link from "next/link";
import type { Preset } from "@/lib/engine/types";
import type { TutorialProgress } from "@/lib/tutorial/progress";
import { interstitialFor } from "@/lib/story/progression";

type Props = {
  justCleared: Preset;
  /** Projected tutorial progress *including* the clear that just happened. */
  projected: TutorialProgress;
  /** Wired only when the player is eligible to claim. */
  onClaimSeed?: () => void;
};

export function RealmClearedInterstitial({
  justCleared,
  projected,
  onClaimSeed,
}: Props) {
  const story = interstitialFor({ justCleared, progress: projected });

  const shards = projected.distinctClears;

  return (
    <section
      aria-label="Story · realm cleared"
      className="flex flex-col gap-4 p-5 rounded-md relative overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))",
        border: "1px dashed var(--color-preset-accent)",
      }}
    >
      <header className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] uppercase tracking-widest opacity-60">
          {story.eyebrow}
        </span>
        <ShardTrack shards={shards} />
      </header>
      <h3
        className="text-lg font-semibold leading-snug"
        style={{ color: "var(--color-preset-accent)" }}
      >
        {story.title}
      </h3>
      <p className="text-sm opacity-85 leading-relaxed">{story.body}</p>

      <div className="flex pt-1">
        {story.cta.kind === "claim-seed" && onClaimSeed ? (
          <button
            type="button"
            onClick={onClaimSeed}
            className="rounded-md px-4 py-2 text-sm font-medium transition"
            style={{
              background: "var(--color-preset-accent)",
              color: "var(--color-preset-bg)",
            }}
          >
            {story.cta.label}
          </button>
        ) : story.cta.kind === "open-picker" ? (
          <Link
            href="/"
            className="rounded-md px-4 py-2 text-sm font-medium transition"
            style={{
              background: "var(--color-preset-accent)",
              color: "var(--color-preset-bg)",
            }}
          >
            {story.cta.label} →
          </Link>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Three glyphs that fill as the player recovers shards. Diegetic
 * progress indicator — replaces the bare "1/3 realms" label.
 */
function ShardTrack({ shards }: { shards: number }) {
  return (
    <div
      aria-label={`Shards recovered: ${shards} of 3`}
      className="flex items-center gap-1.5"
    >
      {[0, 1, 2].map((i) => {
        const lit = i < shards;
        return (
          <span
            key={i}
            className="block transition"
            style={{
              width: 10,
              height: 10,
              transform: "rotate(45deg)",
              background: lit ? "var(--color-preset-accent)" : "transparent",
              border: `1px solid ${
                lit ? "var(--color-preset-accent)" : "rgba(255,255,255,0.25)"
              }`,
              boxShadow: lit
                ? "0 0 10px var(--color-preset-accent)"
                : "none",
            }}
          />
        );
      })}
    </div>
  );
}
