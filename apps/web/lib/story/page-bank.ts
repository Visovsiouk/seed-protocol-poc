/**
 * The lore of a page nobody at this keyboard wrote.
 *
 * ── What problem this solves ───────────────────────────────────────────────
 * `/create` is the story's ending: you press your signet into a blank quire
 * and write a new page, because a book still being written cannot be given a
 * colophon. That beat only lands if the page you made then *reads* like a page
 * of the book. Before this, a creator realm fell through to generic boss prose
 * and the ending blanked out — you authored a world and the world had nothing
 * to say about itself.
 *
 * ── The canon frame, which solves the "why is there already a boss" problem ─
 * A brand-new page having a monster at the bottom of it looks like game logic
 * leaking. It isn't: the Colophon is an editor, and editors come back for a
 * second edition. Every page a borrower writes is a page he has to return to,
 * and he returns the only way he knows — he files somebody into it to hold it
 * open. So the lore of a player realm is always the same three facts in a
 * different order: *someone wrote this recently*, *the ink is in such-and-such
 * a state*, and *it has already been found*. That is also, precisely, the
 * canon's stated reason the story can expand past this PoC without a retcon.
 *
 * ── Why a bank and not a template ──────────────────────────────────────────
 * Deterministic in the realm's own address, so a realm's lore is the same on
 * every machine, every reload, and for every visitor — nobody's page quietly
 * rewrites itself between sessions. Phase 3's model can put a better paragraph
 * in front of this for a page that knows its own *name* and genre, but this
 * bank is what ships with the flag off, so the fallback path is the one
 * exercised on every install without a key.
 *
 * Pure. No hooks, no `window`, no chain reads, no `lib/engine/index`.
 */

import { encodePacked, keccak256 } from "viem";
import { createRng } from "@/lib/engine/rng";
import type { Preset } from "@/lib/engine/types";

/** The facts a page's lore is derived from. All of them are already persisted. */
export type RealmLoreFacts = {
  /** The realm's own address — the whole entropy source. */
  realm: `0x${string}`;
  /** The creator-chosen display name. Already through the obscenity gate. */
  name: string;
  preset: Preset;
  /** Which shared boss id this realm's bookmark wears. */
  bossId: string;
};

/**
 * A page's lore. Three fields because there are exactly three places a
 * player-authored realm currently has nothing true to say:
 *
 *   - `pageText`     — the book describing the page, on the way in.
 *   - `bookmarkName` — who the thing at the bottom of it used to be.
 *   - `bookmarkLine` — how they ended up down there.
 *
 * `bookmarkLine` deliberately replaces only the *intro* of `bookmarkLore`.
 * The phase-2 `turn` line stays with the boss id, because that line is the
 * archetype's mirror ("this is you, if you stop") and it is the same mirror
 * whichever page the archetype turns up on.
 */
export type RealmLore = {
  pageText: string;
  bookmarkName: string;
  bookmarkLine: string;
  /** Where the prose came from. `"bank"` is the default and not a failure. */
  source: "model" | "bank";
};

/**
 * Ceilings, shared by the bank (which must respect them) and the filter.
 *
 * `PAGE_TEXT_MAX_CHARS` is derived, not chosen: the bank's own worst case is
 * the longest provenance sentence with a 64-character realm name interpolated
 * into it, plus the longest texture and found sentences — 372 characters. The
 * cap is that, rounded up for headroom, so the bank can never fail the filter
 * it shares with the model. Pinned by `page-bank.test.ts`.
 */
export const PAGE_TEXT_MAX_CHARS = 400;
export const PAGE_TEXT_MAX_SENTENCES = 3;
export const BOOKMARK_LINE_MAX_CHARS = 220;
export const BOOKMARK_LINE_MAX_SENTENCES = 2;
export const BOOKMARK_NAME_MAX_CHARS = 40;

// ── Names ──────────────────────────────────────────────────────────────────

/**
 * Forenames and surnames for borrowers the canon never named.
 *
 * Chosen to sit beside Hesper Alder, Vesna Kord and Aurelio Ker without
 * announcing an era — these people were stamped out across two centuries and
 * the card prints them all in the same hand. Nothing whimsical, nothing
 * bookbinding-pun: `Quire` is the one name in the canon that means its own
 * noun, and it works because it is the only one.
 */
const FORENAMES = [
  "Ilse", "Corin", "Vesper", "Tobias", "Mirren", "Anselm",
  "Juno", "Halvard", "Perpetua", "Emrys", "Signe", "Lazar",
] as const;

const SURNAMES = [
  "Vantage", "Ostrow", "Keel", "Farrow", "Bexley", "Thorne",
  "Linnet", "Halloran", "Pell", "Rask", "Strand", "Veck",
] as const;

// ── Page text ──────────────────────────────────────────────────────────────

/** Sentence 1: provenance. Every entry interpolates `{page}` exactly once. */
const PROVENANCE = [
  "{page} was written, not found — a borrower with a signet pressed it into a blank quire and the binding took it without complaint.",
  "{page} is a late addition: somebody earned a signet and spent it here, on a page that had not existed the week before.",
  "The quire that became {page} was blank inside living memory.",
  "{page} is one of the pages added after the first colophon was attempted and failed.",
] as const;

/**
 * Sentence 2: how far the revision has reached. Keyed on preset because that
 * gradient is the one thing a creator's genre choice already declares — the
 * same `unreached` → `underway` → `finished` texture the starter pages use,
 * said about a page the Colophon has not had a century to work on.
 */
const TEXTURE: Record<Preset, readonly string[]> = {
  fantasy: [
    "The ink is still wet in places, and what it describes is still growing while you stand in it.",
    "Nothing here has set yet; the page is adding rooms faster than anyone can read them.",
  ],
  cyberpunk: [
    "It cured half-set and stayed that way, every surface still deciding what it is.",
    "A revision reached it and stopped mid-line, which is the worst state a page can be left in.",
  ],
  scifi: [
    "It reads cold and finished, though no hand signed the end of it.",
    "The page is sealed and perfectly quiet, which is how you know somebody has already read it through.",
  ],
};

/** Sentence 3: why there is something at the bottom. */
const FOUND = [
  "It has already been found: there is a bookmark holding it open at the deepest room.",
  "An editor always comes back for a second edition, and he has been here once already.",
  "Something is set into the bottom of it now, so the page can always be found again.",
] as const;

// ── Bookmark line ──────────────────────────────────────────────────────────

/** Interpolates `{who}` once; `{page}` is optional per entry. */
const FILED = [
  "{who} came in after the page was written, reached the bottom of it, and was left there to hold it open.",
  "{who} read this page new and went down it anyway. The hand that files borrowers found a fresh entry worth making.",
  "{who} was the first to finish {page}. Finishing it is what got them filed into it.",
  "{who} wanted to know who had written this. They are part of the answer now.",
] as const;

/**
 * Compose a page's lore from its address.
 *
 * Domain-separated from everything else drawn off this realm (`"realm-lore"`),
 * so adding a pool entry here can never shift a loot roll or a margin find.
 */
export function realmPageFallback(facts: RealmLoreFacts): RealmLore {
  const rng = createRng(
    keccak256(
      encodePacked(["address", "string"], [facts.realm, "realm-lore"]),
    ),
  );

  // Drawn in a fixed order so adding an entry to a later pool doesn't reshuffle
  // an earlier one. Name first: it is the field most likely to be quoted.
  const bookmarkName = `${rng.pick(FORENAMES)} ${rng.pick(SURNAMES)}`;

  const pageText = [
    rng.pick(PROVENANCE).replace("{page}", facts.name),
    rng.pick(TEXTURE[facts.preset]),
    rng.pick(FOUND),
  ].join(" ");

  const bookmarkLine = rng
    .pick(FILED)
    .replace("{who}", bookmarkName)
    .replace("{page}", facts.name);

  return { pageText, bookmarkName, bookmarkLine, source: "bank" };
}
