"use client";

/**
 * The narrative beat rendered inside the run-over panel of
 * `<EncounterFrame/>` after a boss falls: the eyebrow/title/body from the
 * story layer, the stamp this clear pressed into the card, and — when
 * another founding page just came unsealed — its name.
 *
 * ── Why it carries no button ───────────────────────────────────────────────
 * The way out of this screen lives in `RunOverPanel`, which hosts this one.
 * There is exactly one exit and it is always rendered, so a clear with no
 * story content (a trial-mode realm, say) can never strand the player. The
 * label still comes from `story.cta.label` — the page reads it off the same
 * `Interstitial` it passes here and hands it down as `bossReturnLabel`.
 *
 * The screen itself is player-gated: `EncounterFrame` used to dwell on it for
 * 3.5 seconds and then route home on a timer, which meant the biggest payoff
 * in the game was the one beat nobody got to the end of. Presentational, like
 * `DefeatOverlay` — the caller owns the story and the navigation.
 */

import { motion, useReducedMotion } from "framer-motion";
import type { Preset } from "@/lib/engine/types";
import type { Interstitial } from "@/lib/story/progression";
import { EASE_OUT } from "@/lib/ui/motion";
import { PAGES } from "@/lib/story/canon";
import { PlayerSigil } from "@/components/art/PlayerSigil";
import { Stamp } from "@/components/ui";

/**
 * The card slot this clear just filled. Absent for a creator page — the card
 * has exactly three slots and they belong to the founding pages.
 */
export type ClearStamp = {
  /** Whose ink the stamp is pressed in. */
  preset: Preset;
  /** Display name of the page, for the stamp's label. */
  page: string;
  /** Slots filled including this one. */
  count: number;
  /** Slots on the card. */
  total: number;
};

type Props = {
  story: Interstitial;
  stamp?: ClearStamp;
  /** The borrower's crest is their address, drawn. See `PlayerSigil`. */
  address?: `0x${string}`;
};

export function RealmClearedInterstitial({ story, stamp, address }: Props) {
  const reduced = useReducedMotion();

  return (
    <section
      aria-label="Story · realm cleared"
      className="flex flex-col gap-4 p-5 rounded-md relative overflow-hidden bg-[linear-gradient(135deg,var(--surface-2),var(--surface-1))] border border-dashed border-[var(--color-preset-accent)]"
    >
      <header className="flex items-baseline justify-between gap-3">
        <Stamp>{story.eyebrow}</Stamp>
        {stamp && <ShardTrack filled={stamp.count} total={stamp.total} />}
      </header>
      <h3 className="text-lg font-semibold leading-snug text-[var(--color-preset-accent)]">
        {story.title}
      </h3>
      <p className="text-sm opacity-85 leading-relaxed">{story.body}</p>

      {stamp && (
        <StampPress stamp={stamp} address={address} reduced={!!reduced} />
      )}

      {/*
        What `cta.nextPreset` is actually for. It used to be typed, tested and
        never rendered; naming the page that just came unsealed is the whole
        of its job — the player still picks it at the base, because picking is
        half the reward for having unsealed it.
      */}
      {story.cta.kind === "warp-next" && (
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] opacity-60">
          One more way down has come unsealed: {PAGES[story.cta.nextPreset].name}.
        </p>
      )}
    </section>
  );
}

/**
 * The press itself, landing a beat after the prose.
 *
 * Same idiom as `DueDateCard`'s slots and `GenesisLedger`'s plates: the
 * wrapper carries `data-preset`, which re-resolves `--color-preset-accent` to
 * that page's hue through the normal cascade, and `PlayerSigil` strokes in
 * `currentColor` — so the crest comes out in the page's ink with no new prop.
 *
 * Motion is written as explicit `initial`/`animate` rather than a variants
 * object, because this is a transform animation and `withReducedMotion`
 * flattens scalar opacity only: a `scale`/`rotate` variant pushed through it
 * fails *open* (see `lib/ui/motion.ts`). `initial={false}` under reduced
 * motion renders the resting, tilted, fully-visible state directly.
 */
function StampPress({
  stamp,
  address,
  reduced,
}: {
  stamp: ClearStamp;
  address?: `0x${string}`;
  reduced: boolean;
}) {
  const remaining = stamp.total - stamp.count;

  return (
    <div
      data-preset={stamp.preset}
      className="flex items-center gap-3"
      style={{ color: "var(--color-preset-accent)" }}
    >
      {/* The crest is decorative here: the line beside it already says which
          page took the mark and what is left, which is a better announcement
          than "The Hollow Reach — stamped". `DueDateCard` labels its own
          crests instead, because there the slots carry no prose. */}
      <div
        aria-hidden
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[3px] border border-dashed border-current/35"
      >
        <motion.span
          className="block"
          // A rubber stamp is never square to the page — the resting tilt
          // matches slot 1 of `DueDateCard`, so the same mark looks pressed by
          // the same hand on both surfaces.
          initial={reduced ? false : { opacity: 0, scale: 1.7, rotate: -16 }}
          animate={{ opacity: 1, scale: 1, rotate: -2.5 }}
          transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.45 }}
        >
          <PlayerSigil address={address} size={34} />
        </motion.span>
      </div>
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] opacity-70">
        {remaining <= 0
          ? `${stamp.page} takes your mark. The card is full.`
          : `${stamp.page} takes your mark. ${remaining} more to earn a signet.`}
      </p>
    </div>
  );
}

/**
 * Three glyphs that fill as the card takes stamps. Diegetic progress
 * indicator — replaces the bare "1/3 realms" label.
 */
function ShardTrack({ filled, total }: { filled: number; total: number }) {
  return (
    <div
      aria-label={`Stamps on the card: ${filled} of ${total}`}
      className="flex items-center gap-1.5"
    >
      {Array.from({ length: total }, (_, i) => {
        const lit = i < filled;
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
