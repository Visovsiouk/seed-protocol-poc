/**
 * Cold-open beats — "The Uncatalogued Return".
 *
 * A night shift in a library's returns room. A hand-bound book comes up the
 * chute that isn't in the catalogue; procedure says check the back pocket for
 * a date-due card. The card is full, its dates are out of order, its return
 * column has been torn off — nobody has ever been stamped back in — and the
 * last entry is the borrower's own handwriting on a card they have never
 * touched. They sign it to see what they wrote. That is the whole mistake.
 *
 * ── Why it is shaped like this ─────────────────────────────────────────────
 * The previous opening was five pages of two 60–80 word paragraphs: ~800
 * words of cosmology before the player touched the game, in one unbroken
 * register. It did not get read. This one carries the same information in a
 * quarter of the words, and it earns attention three ways the old one
 * couldn't:
 *
 *   1. **Concrete against cosmic.** A chute, a rubber stamp, a card pocket.
 *      The old opening was cosmic imagery against cosmic stakes, so nothing
 *      registered as strange. Here the strangeness has something to be
 *      strange *against*.
 *   2. **The player acts three times.** Pull the card, read their own
 *      handwriting, sign it. Three `gate: "interaction"` beats that will not
 *      advance until the act is performed — so the trap closes on something
 *      they did, not something they read about.
 *   3. **The antagonist is an absence, not an announcement.** Every borrower
 *      on the card can be traced except the first, who scratched himself off
 *      it; and once the player signs, a hand that isn't theirs writes `fin.`
 *      underneath. Two gaps in an artifact the player is holding. No villain
 *      is named anywhere in the opening.
 *
 * Marrow's beat is the only one in a voice other than the Book's: the player
 * meets a former borrower, dated and signed, before gameplay — so that when
 * marginalia starts dropping in runs, the form is already familiar.
 *
 * ── Budget ─────────────────────────────────────────────────────────────────
 * Every beat's body is **≤ 25 words total**, enforced by `coldOpen.test.ts`.
 * A word budget rather than a beat count is deliberate: the failure being
 * guarded against is long undirected prose creeping back, and a beat count
 * doesn't detect that.
 *
 * Pure data so `ColdOpenBook` stays presentational and the beats can be
 * asserted against.
 */

import type { CinematicBeat } from "./types";

/**
 * A cold-open page is just a `CinematicBeat` — the cinematic player reads the
 * optional `voice`/`gate`/`wash`/`timing` annotations below to turn the pages
 * into a felt, timed, interactive sequence instead of a click-through.
 */
export type ColdOpenBeat = CinematicBeat;

export const COLD_OPEN_BOOK: readonly ColdOpenBeat[] = [
  {
    stamp: "The returns room",
    body: [
      "Night shift. The chute coughs up one more book, then goes quiet.",
      "This one has no barcode.",
    ],
    cta: "Pick it up",
    timing: { lineStagger: true },
  },
  {
    stamp: "Uncatalogued",
    body: [
      "No accession number. No spine label. Nothing in the system matches it.",
      "Someone bound this by hand.",
    ],
    cta: "Check the back pocket",
    timing: { lineStagger: true, hold: { line: 1 } },
  },
  {
    // Gate 1 — the player pulls the card out of the pocket themselves.
    stamp: "Procedure",
    body: ["An unidentified return gets checked for its date-due card. So: check."],
    cta: "Pull the card",
    gate: "interaction",
    timing: { lineStagger: true },
  },
  {
    stamp: "The card",
    body: [
      "Full. Both columns, stamped across decades — and out of order.",
      "1911 above 2041. Below that, 1987.",
    ],
    cta: "Go on",
    timing: { lineStagger: true, hold: { line: 1 } },
  },
  {
    stamp: "The return column",
    body: [
      "Someone has torn the return column off. A clean vertical tear.",
      "Every borrower stamped out. Not one stamped back in.",
    ],
    cta: "Go on",
    wash: "void",
    timing: { lineStagger: true, hold: { line: 1 } },
  },
  {
    // The player meets a margin voice before gameplay, so the form reads as
    // familiar the first time a note drops in a run.
    stamp: "In the margin",
    voice: "margin",
    body: [
      "Don't waste the hours I wasted hunting for the return line. It is gone. Plan around it.",
    ],
    footnote: "E. Marrow · 1911",
    cta: "Keep reading",
    timing: { lineStagger: true },
  },
  {
    // The first borrower, and the only one with nothing to trace him by.
    //
    // Two earlier versions tried to animate this: the line wrote itself, was
    // struck through, and rewrote, so the player would "meet the antagonist as
    // an edit happening while they read." It did not communicate — a struck
    // line with no established convention behind it reads as a typo or as UI
    // noise, in either direction, and a device that needs a design document to
    // parse is a failed device. The whole revision apparatus was removed with
    // it rather than left dead.
    //
    // What survived is the fact, stated plainly, with the card right below it
    // showing the same scratch. The *absence* is the characterisation: every
    // other borrower on that card can be traced, and he made sure he can't be.
    // That is also his weakness, and it is on screen before gameplay starts.
    stamp: "The topmost entry",
    body: [
      "The topmost entry is dated 1788. Everyone under it signed their name.",
      "Not this one. Scratched out, hard enough to go through the paper.",
    ],
    cta: "Go on",
    wash: "danger",
    timing: { lineStagger: true, hold: { line: 1 }, fadeOutToBlack: true },
  },
  {
    // Gate 2 — the player chooses to look at the last entry.
    stamp: "The last entry",
    body: ["The last entry is not a stamp. It is handwriting.", "It is yours."],
    cta: "Look closer",
    gate: "interaction",
    timing: { lineStagger: true, hold: { line: 1 } },
  },
  {
    // Gate 3 — the mistake. Offered as a real choice, because forcing it at
    // the exact moment the story claims the player made a mistake is what
    // makes a mistake feel like somebody else's. Refusing is the better beat:
    // the card is already signed in your hand, dated tonight, which is the
    // hook from page one paying off. See `ColdOpenBook`'s `refused` branch.
    stamp: "Signing",
    body: [
      "Dated tonight, on a card you have never touched.",
      "There is a pen. Nobody is making you pick it up.",
    ],
    cta: "Sign the card",
    gate: "interaction",
    wash: "warm",
    timing: { lineStagger: true },
  },
  {
    stamp: "The other side",
    body: [
      "The returns room is on the other side of the book now.",
      "The door it was behind is a page.",
    ],
    footnote: "you are inside it",
    cta: "Begin",
    timing: { lineStagger: true, hold: { line: 1 } },
  },
] as const;

/**
 * localStorage key recording that the player has consumed the cold-open.
 * On returning visits, the landing surfaces the base directly.
 *
 * Versioned so a content rewrite can re-introduce the opening — bumped to
 * `.v4` for "The Uncatalogued Return". The prefix is also normalised here:
 * this was the last key still on the bare `seed-protocol:` namespace while
 * every other key in the app (`codex-flags`, `codex-seen`, `equipped`,
 * `audio`, `deployment-id`) uses `seed-protocol-poc:`.
 *
 * Deliberately NOT in `DEPLOYMENT_SCOPED_KEYS` (lib/persistence/deployment-
 * guard.ts): a chain reset must not make a returning player re-read the book.
 */
export const COLD_OPEN_STORAGE_KEY = "seed-protocol-poc:cold-open-consumed.v4";
