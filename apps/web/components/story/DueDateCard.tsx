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
import { usePlayerRealms } from "@/lib/reads/hooks";
import { BORROWERS, stampDate } from "@/lib/story/canon";
import { shortAddress } from "@/lib/utils";
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
          Return column torn. Nobody has ever been stamped back in.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Stamp tone="muted">Before you</Stamp>
        <CardEntries freshRow={card.signed} signed={card.signed} />
      </div>

      <BesideYou />
    </div>
  );
}

/**
 * The rows that are not finished yet.
 *
 * `CardEntries` above is the borrowers who came *before* — six names across two
 * centuries, every one stamped out and not one stamped back in. This is the
 * other half of the same fact, and the story had no account of it anywhere:
 * every live player is a borrower too, holding the same book at the same time.
 * Their pages are in the registry under their own address, and one of them will
 * read the player's line the way the player reads the margins.
 *
 * ── Why there is no total here ─────────────────────────────────────────────
 * The Base already counts quires added (`BookThickness` in `RealmSelector`),
 * and it counts them from the *on-chain registry* while these rows come from
 * the *registration db*. A realm that was deployed but never registered
 * through `/create` is in the first and not the second, so the two numbers can
 * legitimately disagree. Printing both near each other would read as a bug, so
 * this surface shows rows and lets the Base own the arithmetic.
 */
function BesideYou() {
  const { data, isLoading, isError } = usePlayerRealms();

  // Newest first. `listPlayerRealms` returns `ORDER BY created_at ASC` and a
  // Map preserves that, so this re-sorts rather than trusting the order.
  // `createdAt` is unix seconds — see `insertPlayerRealm` in realm-db.ts.
  const recent = data
    ? [...data.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 3)
    : [];

  return (
    <div className="flex flex-col gap-2">
      <Stamp tone="muted">Beside you</Stamp>

      {isLoading ? (
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] opacity-50">
          Reading the registry…
        </p>
      ) : isError ? (
        /*
         * An unreadable registry is not an empty one, and this distinction is
         * not pedantry: `/api/realm/list` fans out a chain read per realm to
         * resolve tiers, so it returns 500 whenever the node is unreachable —
         * which is the *normal* state with no local chain running. Without this
         * branch the card confidently told the player nobody had added a page
         * while the db held several. Found in a browser, not by the suite.
         */
        <p className="text-[11px] leading-relaxed opacity-65">
          The registry will not read right now, so there is no telling who else
          is holding this book.
        </p>
      ) : recent.length === 0 ? (
        <p className="text-[11px] leading-relaxed opacity-65">
          No borrower has added a page yet. The rows under yours are still
          blank — which has never been true of this card for long.
        </p>
      ) : (
        <>
          {/*
           * `table-fixed` is load-bearing, not tidiness. Under the default
           * auto layout the table ignores `w-full` and grows to its content's
           * min-content width — a long page name took it to 481px inside a
           * 341px dock, and because this wrapper is `overflow-hidden` the
           * column was *clipped* rather than ellipsised, so `truncate` below
           * never fired. Fixed layout makes the 100% real and the column
           * widths definite, which is what `truncate` needs to work at all.
           * `CardEntries` gets away with auto layout only because a signature
           * is always short.
           */}
          <div className="overflow-hidden rounded-[2px] border border-[var(--border-1)] bg-[color-mix(in_oklab,var(--color-preset-fg)_7%,transparent)] font-mono text-[11px] leading-none">
            <table className="w-full table-fixed border-collapse">
              <caption className="sr-only">
                Pages other borrowers have added, newest first.
              </caption>
              <thead>
                <tr className="text-[9px] uppercase tracking-[0.2em] opacity-55">
                  <th
                    scope="col"
                    className="w-[6.25rem] px-2 py-1.5 text-left font-normal"
                  >
                    Added
                  </th>
                  <th scope="col" className="px-2 py-1.5 text-left font-normal">
                    Page
                  </th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr
                    key={r.address}
                    className="border-t border-[var(--border-1)]/60"
                  >
                    <td className="whitespace-nowrap px-2 py-1.5 align-top tabular-nums opacity-70">
                      {stampDate(formatStampDate(r.createdAt))}
                    </td>
                    <td className="min-w-0 px-2 py-1.5">
                      <span className="block truncate opacity-85">
                        {r.name}
                      </span>
                      <span className="mt-1 block truncate text-[9px] opacity-55">
                        {shortAddress(r.owner)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] leading-relaxed opacity-60">
            Added while you were down there, by hands you will never meet. One
            of them will read your line the way you read{" "}
            {BORROWERS.marrow.name}&apos;s.
          </p>
        </>
      )}
    </div>
  );
}
