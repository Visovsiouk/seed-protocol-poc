"use client";

/**
 * The date-due card's stamped-out entries — the other borrowers.
 *
 * This is the opening's central prop and the game's progress tracker in
 * embryo: four things are wrong with the card, and three of them are visible
 * here without a word of narration.
 *
 *   1. It's **full** — decades of borrowers, none of them in the system.
 *   2. The dates are **out of order** (`CARD_ENTRIES` is deliberately not
 *      chronological; `canon.test.ts` asserts the scramble).
 *   3. The **return column has been torn off** — so every row is stamped out
 *      and not one is stamped back in. Rendered as a real ragged tear with
 *      the header clipped mid-word, because "RETURNED" being half-present is
 *      more unsettling than it being absent.
 *
 * The fourth — the borrower's own handwriting on the last line — arrives as
 * `freshRow`, revealed by the opening's second gated act.
 *
 * The Colophon's entry is the top row and is *not* in `CARD_ENTRIES`: he
 * scratched himself off, so he renders as a defacement rather than a name.
 * That he is the only borrower with no provenance is his whole weakness, and
 * it is on screen from the first time the card is seen.
 *
 * Phase 2a's `DueDateCard` composes this together with the player's own
 * stamps; this half knows nothing about the player.
 */

import { BORROWERS, CARD_ENTRIES, COLOPHON, stampDate } from "@/lib/story/canon";

/** Ragged right edge where the return column was torn away. */
const TEAR =
  "polygon(0 0, 100% 0, 62% 7%, 93% 15%, 58% 23%, 88% 32%, 64% 41%, 95% 50%, 60% 58%, 90% 67%, 57% 75%, 92% 84%, 63% 92%, 86% 100%, 0 100%)";

export function CardEntries({
  /** The borrower's own entry, revealed by the "look closer" act. */
  freshRow,
  /** Whether that entry carries a signature yet. */
  signed = false,
  /**
   * The date stamped on the borrower's own row.
   *
   * Supplied by the caller rather than read from `Date` here, because this
   * renders during SSR and a clock read would differ between the server and
   * hydration pass — the exact mismatch class documented in
   * `app/play/[preset]/page.tsx`. Callers compute it after mount. Falls back
   * to "tonight" when absent, which is also the honest answer when there is
   * no clock to read.
   */
  freshDate,
  className,
}: {
  freshRow?: boolean;
  signed?: boolean;
  freshDate?: string;
  className?: string;
}) {
  return (
    <div
      className={[
        "relative overflow-hidden rounded-[2px] border border-[var(--border-1)]",
        "bg-[color-mix(in_oklab,var(--color-preset-fg)_7%,transparent)]",
        "font-mono text-[11px] leading-none",
        className ?? "",
      ].join(" ")}
    >
      {/* Torn strip: what's left of the RETURNED column. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-10 border-l border-dashed border-[var(--border-2)] bg-[color-mix(in_oklab,var(--color-preset-fg)_5%,transparent)]"
        style={{ clipPath: TEAR }}
      >
        <span className="absolute left-1 top-2 text-[9px] uppercase tracking-[0.2em] opacity-40">
          RET
        </span>
      </div>

      <table className="w-[calc(100%-2.5rem)] border-collapse">
        <caption className="sr-only">
          Date-due card. The return column has been torn off, so no borrower is
          stamped back in.
        </caption>
        <thead>
          <tr className="text-[9px] uppercase tracking-[0.2em] opacity-55">
            <th scope="col" className="px-2 py-1.5 text-left font-normal">
              Date
            </th>
            <th scope="col" className="px-2 py-1.5 text-left font-normal">
              Borrower
            </th>
          </tr>
        </thead>
        <tbody>
          {/* The first entry. He took his own name off it. */}
          <tr className="border-t border-[var(--border-1)]/60">
            <td className="whitespace-nowrap px-2 py-1.5 tabular-nums opacity-45">
              {stampDate(COLOPHON.FIRST_BORROWED)}
            </td>
            <td className="px-2 py-1.5">
              <span className="sr-only">
                Name scratched out, going through the paper.
              </span>
              <span
                aria-hidden
                className="inline-block h-[0.9em] w-24 bg-[repeating-linear-gradient(105deg,currentColor_0_1px,transparent_1px_3px)] opacity-45"
              />
            </td>
          </tr>

          {CARD_ENTRIES.map((id) => {
            const b = BORROWERS[id];
            return (
              <tr key={id} className="border-t border-[var(--border-1)]/60">
                <td className="whitespace-nowrap px-2 py-1.5 tabular-nums opacity-70">
                  {stampDate(b.borrowed)}
                </td>
                <td className="px-2 py-1.5">
                  <span className="font-[family-name:var(--font-margin)] text-[15px] opacity-80">
                    {b.signature}
                  </span>
                </td>
              </tr>
            );
          })}

          {freshRow && (
            <tr className="border-t border-[var(--border-2)]">
              {/* Same stamp as every row above it — it is the same stamp.
                  Only the ink is different, because this one is today. */}
              <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-[var(--color-preset-accent)]">
                {freshDate ? stampDate(freshDate) : "TONIGHT"}
              </td>
              <td className="px-2 py-1.5">
                {signed ? (
                  <span className="inline-flex items-center gap-2">
                    {/* Deliberately not a name. The borrower is identified by
                        their mark — the wallet sigil, once there's a wallet —
                        and at this point in the story they haven't got one
                        yet. An illegible hand you nonetheless recognise is
                        also just truer to the moment. */}
                    <span
                      className="font-[family-name:var(--font-margin)] text-[17px] text-[var(--color-preset-accent)]"
                      aria-label="your own handwriting"
                    >
                      ✗⁓⁓
                    </span>
                    {/* He countersigns: the word printed at the end of a
                        finished work, written under a borrower who has only
                        just started. It is a verdict, not a signature. */}
                    <span
                      className="font-mono text-[10px] italic tracking-[0.18em] text-[var(--color-danger)] opacity-85"
                      aria-label={`countersigned: ${COLOPHON.SIGN}`}
                    >
                      {COLOPHON.SIGN}
                    </span>
                  </span>
                ) : (
                  <span className="font-[family-name:var(--font-margin)] text-[17px] opacity-55">
                    <span className="sr-only">
                      Your own handwriting, unsigned.
                    </span>
                    <span aria-hidden>⁓</span>
                  </span>
                )}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
