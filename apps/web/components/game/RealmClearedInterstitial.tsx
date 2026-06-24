"use client";

/**
 * Inline narrative beat rendered inside the run-over panel of
 * `<EncounterFrame/>` after a boss falls. Purely narrative now: it shows
 * the per-clear eyebrow/title/body from `interstitialFor()` and the shard
 * track, then `<EncounterFrame/>` auto-routes the player back to the base
 * once the clear settles (see its boss-return effect). No CTAs and no
 * navigation live here — the gear-translation moment moved to realm entry,
 * and the Seed claim moved to the chest in the base.
 */

import type { Preset } from "@/lib/engine/types";
import type { TutorialProgress } from "@/lib/tutorial/progress";
import { interstitialFor } from "@/lib/story/progression";
import { Stamp } from "@/components/ui";

type Props = {
  justCleared: Preset;
  /** Projected tutorial progress *including* the clear that just happened. */
  projected: TutorialProgress;
};

export function RealmClearedInterstitial({ justCleared, projected }: Props) {
  const story = interstitialFor({ justCleared, progress: projected });
  const shards = projected.starterClears;

  return (
    <section
      aria-label="Story · realm cleared"
      className="flex flex-col gap-4 p-5 rounded-md relative overflow-hidden bg-[linear-gradient(135deg,var(--surface-2),var(--surface-1))] border border-dashed border-[var(--color-preset-accent)]"
    >
      <header className="flex items-baseline justify-between gap-3">
        <Stamp>{story.eyebrow}</Stamp>
        <ShardTrack shards={shards} />
      </header>
      <h3 className="text-lg font-semibold leading-snug text-[var(--color-preset-accent)]">
        {story.title}
      </h3>
      <p className="text-sm opacity-85 leading-relaxed">{story.body}</p>
      <p className="text-xs uppercase tracking-widest opacity-55">
        Returning to the base…
      </p>
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
                lit ? "var(--color-preset-accent)" : "var(--border-2)"
              }`,
              boxShadow: lit ? "0 0 10px var(--color-preset-accent)" : "none",
            }}
          />
        );
      })}
    </div>
  );
}
