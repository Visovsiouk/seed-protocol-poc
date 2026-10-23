/**
 * Story canon — the facts, names and dates every other story module reads.
 *
 * This module holds *who and when*, never prose. The prose lives in the
 * surfaces that speak it (`coldOpen.ts`, `marginalia.ts`, `bookmarks.ts`,
 * `progression.ts`); they import their nouns from here so a name, a year or a
 * page's revision state can't drift between two screens that mention it. The
 * previous story had nine competing abstractions and no named characters
 * precisely because there was no single place like this.
 *
 * ── The premise ────────────────────────────────────────────────────────────
 * The player is a *borrower*. An uncatalogued, hand-bound book comes up the
 * returns chute; the date-due card in its back pocket is full, its dates are
 * out of order, its return column has been torn off — nobody has ever been
 * stamped back in — and the last entry is the borrower's own handwriting on a
 * card they have never touched. Opening it to find out what they wrote is the
 * whole mistake.
 *
 * Each realm is a *page* of that book, in a different era. The connection
 * between them is the binding: one hand placed every bookmark, and writing
 * carries between pages, so a note left in 1911 is legible in 2041.
 *
 * ── The antagonist ─────────────────────────────────────────────────────────
 * A colophon is the inscription at the end of a manuscript: who made this,
 * where, and that it is *finished*. The Colophon was the first borrower. He
 * scratched his own name off the card — the only person in the book with no
 * provenance — and he is working from the back of the book forward, revising
 * each page toward one authorized edition that no later hand can add to. He
 * wants completion, not destruction, and he is an editor rather than a dark
 * lord: he does not kill borrowers, he *files* them.
 *
 * A *bookmark* is how he files one. Bind a borrower into a page's heart and
 * the page can always be found again for revision. Every boss is a bookmark.
 *
 * ── The counter ────────────────────────────────────────────────────────────
 * Three stamps earn a signet; a signet means you can sign out. Signing out
 * closes the book with everyone still inside, which is exactly what he wants.
 * So you press the signet into a blank quire and write a new page instead — a
 * book still being written cannot be given a colophon. That is `/create`, and
 * it is the ending rather than an advanced feature.
 *
 * Pure data. No hooks, no chain reads, no prose.
 */

import type { Preset } from "@/lib/engine/types";

// ── Borrowers ──────────────────────────────────────────────────────────────

export type BorrowerId =
  | "alder"
  | "marrow"
  | "kord"
  | "salk"
  | "ker"
  | "raine"
  | "quire";

/**
 * What became of a borrower. The card records only that they were stamped
 * out; the book records the rest.
 *
 *   - `margins`    — got back out of a page, and wrote down what it cost.
 *     These are the voices the player actually reads.
 *   - `bookmarked` — the Colophon bound them into a page to hold it open.
 *     These are the bosses.
 *   - `dealing`    — neither. Found a third option and stayed in the gaps.
 */
export type BorrowerFate = "margins" | "bookmarked" | "dealing";

export type Borrower = {
  id: BorrowerId;
  /** The name the book records. */
  name: string;
  /** How they sign a margin note — what the player sees under the prose. */
  signature: string;
  /**
   * The day they were stamped out, ISO `YYYY-MM-DD`.
   *
   * A full date rather than a year because the card is a *card*: a library
   * date stamp prints a whole date on every line, and the rows reading
   * "1911" next to the borrower's own "2026-10-23" was the one place the
   * prop stopped looking like an object and started looking like a table.
   * Render it through `stampDate()` so every row shares one format.
   */
  borrowed: string;
  /** Convenience for prose ("filed 1847"). Must agree with `borrowed`. */
  year: number;
  fate: BorrowerFate;
};

/**
 * A date as the card's rubber stamp prints it: `04 MAR 1911`.
 *
 * One format for every row, across two centuries, because it is one stamp —
 * the borrowers' own era conventions live in their marginalia (`03.14.87`,
 * `2041-02-06`), not on the card. That contrast is doing work: the card is
 * the book's hand, the margins are theirs.
 */
const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

export function stampDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${d} ${MONTHS[Number(mo) - 1] ?? mo} ${y}`;
}

/**
 * Every borrower the canon names.
 *
 * The years are load-bearing, not decoration. They establish who could have
 * read whom: Alder is bound in 1847, so Marrow (1911) can write *about* her;
 * Kord is bound in 1981, so Salk (1987) finds her already in the ICE. That
 * overlap is how "the pages are connected" gets shown instead of stated — the
 * player reads one borrower answering another across a century.
 *
 * Ker is the hinge of the whole plot. He is the only borrower before the
 * player to earn a signet, and he used it the way the player is meant to:
 * he pressed it into a blank quire and wrote a page. He named that page after
 * himself — which is why the third realm is called Drift Station Ker-7, and
 * why the 7 is the quietly frightening part. Then he reached for the colophon
 * himself, and the Colophon filed him into the page he had written.
 */
export const BORROWERS: Record<BorrowerId, Borrower> = {
  // ── Bookmarked (the three founding bosses) ───────────────────────────────

  // Bound in The Hollow Reach. She mastered the page and could not leave it.
  alder: {
    id: "alder",
    name: "Hesper Alder",
    signature: "H. Alder",
    borrowed: "1847-06-12",
    year: 1847,
    fate: "bookmarked",
  },
  // Bound in the Black Ice District. She tried to copy a signet rather than
  // earn one; a signet can't be copied, so the page kept her as its lock.
  kord: {
    id: "kord",
    name: "Vesna Kord",
    signature: "V. Kord",
    borrowed: "1981-11-03",
    year: 1981,
    fate: "bookmarked",
  },
  // Bound in the page he wrote himself. The only borrower before the player
  // to earn a signet — and the only one the Colophon had to file as a rival.
  ker: {
    id: "ker",
    name: "Aurelio Ker",
    signature: "A. Ker",
    borrowed: "1908-05-19",
    year: 1908,
    fate: "bookmarked",
  },

  // ── Margins (the three voices) ───────────────────────────────────────────

  // First page. Devout, stubborn, practical; got further than anyone. Her
  // notes are the real tutorial, and she is writing about Alder.
  marrow: {
    id: "marrow",
    name: "Edith Marrow",
    signature: "E. Marrow",
    borrowed: "1911-02-27",
    year: 1911,
    fate: "margins",
  },
  // Second page. Slangy, paranoid, funny, wrong about things. He finds Kord
  // already in the ICE and draws the wrong conclusion from it.
  salk: {
    id: "salk",
    name: "Teo Salk",
    signature: "T. Salk",
    borrowed: "1987-03-02",
    year: 1987,
    fate: "margins",
  },
  // Third page. Clinical, half-redacted, filing reports to a department that
  // does not exist. She is auditing Ker's station and answering Marrow.
  raine: {
    id: "raine",
    name: "V. Raine",
    signature: "Auditor V. Raine",
    borrowed: "2041-01-22",
    year: 2041,
    fate: "margins",
  },

  // ── Dealing ──────────────────────────────────────────────────────────────

  // The trader. A quire is a gathered stack of folded pages, so he is named
  // for the gaps he lives in. Didn't escape, didn't get bound — deals.
  quire: {
    id: "quire",
    name: "Quire",
    signature: "Q.",
    borrowed: "1904-08-30",
    year: 1904,
    fate: "dealing",
  },
};

/** The three margin voices, in page order. */
export const MARGIN_VOICES: readonly BorrowerId[] = ["marrow", "salk", "raine"];

/** The three bound borrowers, in page order. */
export const BOOKMARKED: readonly BorrowerId[] = ["alder", "kord", "ker"];

export function borrower(id: BorrowerId): Borrower {
  return BORROWERS[id];
}

// ── The Colophon ───────────────────────────────────────────────────────────

/**
 * The antagonist. Deliberately has no `name` field: he scratched his entry
 * off the card, so there is nothing to render. Anything that wants to label
 * him uses `TITLE`, which is what the other borrowers settled on calling the
 * hand they kept finding.
 *
 * `MARK` is a closing bracket because that is what he does to things, and it
 * renders in one glyph at any size. He signs revisions `fin.` — never a name,
 * never a sentence. He does not speak anywhere in the game; he manifests as
 * typography (a line that strikes itself through and rewrites), which is why
 * this object carries marks and not dialogue.
 */
export const COLOPHON = {
  TITLE: "the Colophon",
  /**
   * The one word he writes, and the only thing of his the player ever sees.
   *
   * `fin.` is what gets printed at the end of a finished work. Writing it
   * under a borrower's name the moment they sign in is a verdict, not a
   * signature: he is declaring their story over before they have taken a
   * step, and the whole game is the rebuttal. The ending — pressing a signet
   * into a blank quire — is literally writing past it.
   *
   * An earlier version paired this with a closing-bracket glyph. It read as
   * noise: a bare `]` means nothing to anyone, and it diluted the one mark
   * that explains itself. One word, no decoration.
   */
  SIGN: "fin.",
  /** The year of the first entry on the card — the one scratched out. */
  FIRST_YEAR: 1788,
  /** Full date of that first entry, for the card's stamp column. */
  FIRST_BORROWED: "1788-04-09",
} as const;

// ── Pages ──────────────────────────────────────────────────────────────────

/**
 * How far the Colophon's revision has reached on a page.
 *
 * This is the existing wet → half-set → frozen texture gradient, given an
 * agent. He works from the *back* of the book forward, so the order the game
 * already enforces (fantasy → cyberpunk → scifi) walks the player toward his
 * completed work rather than away from it:
 *
 *   - `unreached` — he hasn't got here. Still wet, still growing.
 *   - `underway`  — mid-revision. Neon curing on wet concrete.
 *   - `finished`  — he's done. Sealed, perfect, silent, cold.
 */
export type PageRevision = "unreached" | "underway" | "finished";

export type PageCanon = {
  /** Display name. Unchanged from `lib/contracts/starter-realms.ts`. */
  name: string;
  /** Boss id in the flavor bank — unchanged; the id now has a person behind it. */
  bossId: string;
  /** The borrower bound into this page's heart. */
  bookmark: BorrowerId;
  /** Whose marginalia the player finds most of on this page. */
  margins: BorrowerId;
  revision: PageRevision;
};

export const PAGES: Record<Preset, PageCanon> = {
  fantasy: {
    name: "The Hollow Reach",
    bossId: "forest_hag",
    bookmark: "alder",
    margins: "marrow",
    revision: "unreached",
  },
  cyberpunk: {
    name: "Black Ice District",
    bossId: "black_ice",
    bookmark: "kord",
    margins: "salk",
    revision: "underway",
  },
  scifi: {
    // Named for the borrower who wrote it. The 7 implies six before it.
    name: "Drift Station Ker-7",
    bossId: "ai_core",
    bookmark: "ker",
    margins: "raine",
    revision: "finished",
  },
};

export function page(preset: Preset): PageCanon {
  return PAGES[preset];
}

/** The bound borrower behind a boss id, or `null` for community bosses. */
export function bookmarkFor(bossId: string): Borrower | null {
  for (const p of Object.values(PAGES)) {
    if (p.bossId === bossId) return BORROWERS[p.bookmark];
  }
  return null;
}

// ── The card ───────────────────────────────────────────────────────────────

/**
 * The date-due card's stamped-out entries, in the order they appear on it.
 *
 * Deliberately *not* chronological — that scramble is the second thing wrong
 * with the card and the player is meant to notice it on the opening beat.
 * The Colophon's own entry is first and scratched out, so it is absent here
 * and rendered as a defacement instead of a row.
 */
export const CARD_ENTRIES: readonly BorrowerId[] = [
  "marrow", // 1911
  "raine", // 2041
  "salk", // 1987
  "alder", // 1847
  "ker", // 1908
  "quire", // 1904
];

// ── Retired vocabulary ─────────────────────────────────────────────────────

/**
 * Terms the rewrite retires, enforced by `canon.test.ts`.
 *
 * These are the nine abstractions the previous story stacked on top of each
 * other with nothing concrete underneath. The replacement family is drawn
 * from bookbinding, which is both fresh and exactly on theme:
 *
 *   the Work → the Book · aspirant → borrower · the roll/sparks/the mark →
 *   the card/stamps/signing · warden → bookmark · maker's power, true-name →
 *   your signet · world → page · the finished edge → the colophon
 *
 * The list is intentionally conservative: every entry is a phrase with no
 * innocent homonym in this codebase. Single words that collide with live
 * identifiers are excluded on purpose — `warden` is a community boss id in
 * `lib/flavor/fantasy.ts`, and `work`/`mark`/`spark` all have ordinary uses —
 * so the guard tests unambiguous phrases and the reviewer catches the rest.
 */
export const RETIRED_TERMS: readonly string[] = [
  "aspirant",
  "true-name",
  "true name",
  "maker's power",
  "makers' power",
  "maker's-mark",
  "makers'-roll",
  "makers' roll",
  "roll of makers",
  "the Work",
  "bound aspirant",
  "guardian-god",
];
