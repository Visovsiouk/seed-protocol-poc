"use client";

/**
 * Inline narrative beat rendered inside the run-over panel of
 * `<EncounterFrame/>`. Three CTA shapes:
 *   - `warp-next`: forced linear hand-off to the next starter — defers
 *     to `<WarpInterstitial/>` so the gear-translation moment is
 *     surfaced before the player walks in.
 *   - `claim-seed`: end-of-arc; only fires `onClaimSeed` when the
 *     two-tier gate is actually satisfied (`eligibleForSeed`). When
 *     not eligible, copy guides the player toward the missing
 *     community-realm clears instead.
 *   - `open-picker`: post-arc ad-hoc clear; sends back to the picker.
 *
 * Copy + CTA shape come from `interstitialFor()` so the picker, this
 * component, and the tutorial overlay can't drift apart.
 */

import Link from "next/link";
import type { AssetCard, Preset } from "@/lib/engine/types";
import type { TutorialProgress } from "@/lib/tutorial/progress";
import { interstitialFor } from "@/lib/story/progression";
import { WarpInterstitial } from "./WarpInterstitial";

type Props = {
  justCleared: Preset;
  /** Projected tutorial progress *including* the clear that just happened. */
  projected: TutorialProgress;
  /** Equipped gear at the moment the boss fell — drives the warp translation pair. */
  equipped: { weapon?: AssetCard; armor?: AssetCard };
  /** Wired only when the player is eligible to claim. */
  onClaimSeed?: () => void;
};

export function RealmClearedInterstitial({
  justCleared,
  projected,
  equipped,
  onClaimSeed,
}: Props) {
  const story = interstitialFor({ justCleared, progress: projected });

  // Linear hand-off: defer entirely to the warp interstitial. The
  // story.cta carries `nextPreset` so this branch doesn't need to
  // know REALM_ORDER.
  if (story.cta.kind === "warp-next") {
    return (
      <WarpInterstitial
        fromPreset={justCleared}
        toPreset={story.cta.nextPreset}
        equipped={equipped}
      />
    );
  }

  const shards = projected.starterClears;
  const claimReady = projected.eligibleForSeed && !!onClaimSeed;
  const communityRequirement = Math.min(3, projected.communityRealmCount);
  const remainingCommunity = Math.max(
    0,
    communityRequirement - projected.communityClears,
  );

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

      {story.cta.kind === "claim-seed" && !claimReady && (
        <p className="text-sm opacity-75 leading-relaxed">
          {projected.communityRealmCount === 0
            ? "The registry is still empty of doors raised by other hands. The Seed will weigh you against them once they exist."
            : `${remainingCommunity} more community ${
                remainingCommunity === 1 ? "realm" : "realms"
              } to clear before the Seed will settle.`}
        </p>
      )}

      <div className="flex pt-1">
        {story.cta.kind === "claim-seed" && claimReady ? (
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
        ) : story.cta.kind === "claim-seed" && !claimReady ? (
          <Link
            href="/"
            className="rounded-md px-4 py-2 text-sm font-medium transition"
            style={{
              background: "var(--color-preset-accent)",
              color: "var(--color-preset-bg)",
            }}
          >
            Open the registry →
          </Link>
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
 * Three glyphs that fill as the player closes starter doors. Diegetic
 * progress indicator — replaces the bare "1/3 realms" label.
 */
function ShardTrack({ shards }: { shards: number }) {
  return (
    <div
      aria-label={`Starters cleared: ${shards} of 3`}
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
