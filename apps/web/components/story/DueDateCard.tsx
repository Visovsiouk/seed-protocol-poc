"use client";

/**
 * The date-due card, whole: the borrower's three stamp slots above the other
 * borrowers' entries.
 *
 * This is the game's progress tracker. It replaces copy like "a spark kindles
 * against the mark — the first of three" with an object: three slots, filled
 * or not, and a torn return column that never stops being visible. A player
 * can read where they are without reading a sentence.
 *
 * ── The stamps are the player's own crest ──────────────────────────────────
 * `sigilSpec` is address-only by contract — the crest is not derived *from*
 * your address, it *is* your address, drawn. So all three stamps are the same
 * shape, which is correct for a card (one borrower, three pages) but gives no
 * variety on its own. The variety comes from ink and angle instead:
 *
 *   - Ink: each slot wraps the crest in `data-preset`, which re-resolves
 *     `--color-preset-accent` to that page's hue through the normal cascade.
 *     `PlayerSigil` strokes in `currentColor`, so nothing needs a new prop —
 *     the wrapper's `color` is enough. Same idiom as `GenesisLedger`.
 *   - Angle: a per-slot rotation, because a rubber stamp is never square to
 *     the page.
 */

import { PlayerSigil } from "@/components/art/PlayerSigil";
import { CardEntries } from "@/components/story/CardEntries";
import { Stamp } from "@/components/ui";
import {
  signetLine,
  type CardStamp,
  type DueDateCard as DueDateCardModel,
} from "@/lib/story/card";

/** Hand-pressed, not machine-set. Indexed by slot. */
const TILT = ["-2.5deg", "1.8deg", "-1.2deg"];

function formatStampDate(ts: number | null): string {
  if (ts === null) return "";
  // UTC so the stamp reads the same on every machine — a date-due card is a
  // record, not a local clock, and a server/client split would be a
  // hydration mismatch waiting to happen.
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

function Slot({
  stamp,
  address,
}: {
  stamp: CardStamp;
  address?: `0x${string}`;
}) {
  const tilt = TILT[stamp.slot - 1] ?? "0deg";

  return (
    <div
      data-preset={stamp.preset}
      className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center"
      style={{ color: "var(--color-preset-accent)" }}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-[3px] border border-dashed border-current/35">
        {stamp.state === "stamped" ? (
          <span style={{ transform: `rotate(${tilt})` }} className="block">
            <PlayerSigil
              address={address}
              size={34}
              label={`${stamp.page} — stamped`}
            />
          </span>
        ) : (
          <span
            aria-hidden
            className="block h-[34px] w-[34px] rounded-full border border-dashed border-current/25"
          />
        )}
      </div>

      <span className="w-full truncate font-mono text-[9px] uppercase tracking-[0.14em] opacity-70">
        {stamp.page}
      </span>

      {stamp.state === "stamped" ? (
        <span className="font-mono text-[9px] tabular-nums opacity-55">
          {formatStampDate(stamp.ts)}
        </span>
      ) : (
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] opacity-40">
          {stamp.state === "open" ? "open" : "sealed"}
        </span>
      )}
    </div>
  );
}

export function DueDateCard({
  card,
  address,
}: {
  card: DueDateCardModel;
  address?: `0x${string}`;
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* The borrower's own line. */}
      <div className="flex items-baseline justify-between gap-3">
        <Stamp>Your entry</Stamp>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] opacity-60">
          {card.stampCount} / {card.stamps.length} stamped
        </span>
      </div>

      <div className="flex items-start gap-2">
        {card.stamps.map((s) => (
          <Slot key={s.preset} stamp={s} address={address} />
        ))}
      </div>

      {/* The signet: what three stamps buy, and what it's for. Shared with
          the Base's `CardStrip` so the same artifact can't count two ways. */}
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] opacity-65">
        {signetLine(card)}
      </p>

      {card.returnColumnTorn && (
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-danger)] opacity-75">
          Return column torn. No way to sign out.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Stamp tone="muted">Before you</Stamp>
        <CardEntries freshRow={card.signed} signed={card.signed} />
      </div>
    </div>
  );
}
