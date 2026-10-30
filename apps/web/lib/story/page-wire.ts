/**
 * The wire contract for `/api/story/page`, and the discipline that decides
 * whether a generated page's lore is allowed to be persisted.
 *
 * This surface differs from the epitaph in one way that drives everything
 * below: **its output is written to a database and read by other players.**
 * An epitaph is one person's death screen, seen once, regenerated freely. A
 * page's lore is a durable public artefact — it renders on the way into
 * somebody else's realm. So the filter here is the same filter plus two
 * things it doesn't need:
 *
 *   - **A name gate.** `bookmarkName` is the only generated string in this
 *     codebase that gets displayed as a proper noun, so it goes through the
 *     same `isCleanRealmName` obscenity matcher a creator-typed realm name
 *     does, and through a character allow-list on top. A model asked for a
 *     surname will occasionally answer with a sentence.
 *   - **All-or-nothing.** Three fields are accepted together or the whole
 *     answer is dropped. A page with a generated paragraph and a banked
 *     bookmark would be two voices describing one room.
 *
 * Pure: schemas and string work only, so both the route and its test can use
 * it without a database or a key.
 */

import { z } from "zod";
import { addressSchema } from "@/lib/validation/schemas";
import { isCleanRealmName } from "@/lib/ui/realm-name";
import { sanitizeProse } from "./prose-filter";
import {
  BOOKMARK_LINE_MAX_CHARS,
  BOOKMARK_LINE_MAX_SENTENCES,
  BOOKMARK_NAME_MAX_CHARS,
  PAGE_TEXT_MAX_CHARS,
  PAGE_TEXT_MAX_SENTENCES,
  type RealmLore,
} from "./page-bank";

/**
 * What the client sends: an address and nothing else.
 *
 * Deliberately not the preset, the name or the boss id — those are already in
 * the sqlite row, and reading them from there rather than from the body is
 * what makes this route safe to leave unauthenticated. The row existing is
 * proof that `/api/realm/register` already verified `owner()` and
 * `minters[delegate]` on-chain for this address. A caller who POSTs somebody
 * else's realm can only cause that realm to get the lore it was going to get
 * anyway, once, and a caller who POSTs an unregistered address gets a 404.
 */
export const pageRequestSchema = z.object({
  realmAddress: addressSchema,
});

export type PageRequest = z.infer<typeof pageRequestSchema>;

/** What the route answers. `source` is for tests and the network tab. */
export type PageResponse = {
  ok: true;
  lore: RealmLore;
};

/**
 * What the model is asked to produce, before any of it is trusted.
 *
 * Three labelled lines rather than JSON. The parse is a regex per label, which
 * cannot be broken by an unescaped quote or an apostrophe in a surname — and
 * a partial answer fails the same way a malformed one does, because all three
 * fields are required below.
 */
export const PAGE_LABELS = ["NAME", "PAGE", "BOOKMARK"] as const;

/**
 * Pull the three labelled fields out of a model reply.
 *
 * Tolerant about what surrounds the labels (leading blank lines, a stray
 * trailing newline) and strict about their presence. Returns the raw strings;
 * every one of them still has to survive `sanitizeRealmLore`.
 */
export function parseLabelledLore(
  raw: unknown,
): { name: string; page: string; bookmark: string } | null {
  if (typeof raw !== "string") return null;

  const field = (label: string): string | null => {
    // Anchored to a line start so a label mentioned mid-prose can't hijack the
    // parse, and stopped at the newline so one field can't swallow the next.
    const m = new RegExp(`^[ \\t]*${label}[ \\t]*:[ \\t]*(.+)$`, "im").exec(raw);
    return m ? m[1]!.trim() : null;
  };

  const name = field("NAME");
  const page = field("PAGE");
  const bookmark = field("BOOKMARK");
  if (!name || !page || !bookmark) return null;

  return { name, page, bookmark };
}

/**
 * A borrower's name, or `null`.
 *
 * Two to four words of letters, with the punctuation a real name carries
 * (`O'Dell`, `Jean-Luc`, `V. Raine`) and nothing else. The allow-list is doing
 * most of the work: it rejects a model that answers with a sentence, a label,
 * a quoted string or an explanation, all of which are commoner failures than
 * profanity. The obscenity matcher then catches what an allow-list cannot,
 * using the same gate a creator-typed realm name passes through so the two
 * public-facing proper nouns in this app are held to one standard.
 *
 * Known narrowing: the allow-list is ASCII, so a diacritic (`Zoë`, `Łukasz`)
 * is refused and the realm falls back to a banked name. Accepted rather than
 * widened — `\p{L}` would also admit scripts the rest of the story's
 * typography has never been laid out for, and the cost of a refusal here is
 * one perfectly good name from the bank instead.
 */
export function sanitizeBookmarkName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;

  const name = raw.replace(/\s+/g, " ").trim().replace(/[.,;:]+$/, "");
  if (name.length < 3 || name.length > BOOKMARK_NAME_MAX_CHARS) return null;

  // Each word: a letter, then letters/apostrophes/hyphens, optionally a single
  // trailing period so an initial (`V.`) is allowed.
  if (!/^[A-Za-z][A-Za-z'’-]*\.?(?: [A-Za-z][A-Za-z'’-]*\.?){1,3}$/.test(name)) {
    return null;
  }
  if (!isCleanRealmName(name)) return null;

  return name;
}

/**
 * Accept a model's three fields, or `null` meaning "use the bank".
 *
 * All-or-nothing by construction — there is no partial return — so a caller
 * cannot accidentally persist one generated field next to two banked ones.
 */
export function sanitizeRealmLore(parsed: {
  name: unknown;
  page: unknown;
  bookmark: unknown;
}): Omit<RealmLore, "source"> | null {
  const bookmarkName = sanitizeBookmarkName(parsed.name);
  if (!bookmarkName) return null;

  const pageText = sanitizeProse(parsed.page, {
    maxChars: PAGE_TEXT_MAX_CHARS,
    maxSentences: PAGE_TEXT_MAX_SENTENCES,
  });
  if (!pageText) return null;

  const bookmarkLine = sanitizeProse(parsed.bookmark, {
    maxChars: BOOKMARK_LINE_MAX_CHARS,
    maxSentences: BOOKMARK_LINE_MAX_SENTENCES,
  });
  if (!bookmarkLine) return null;

  return { pageText, bookmarkName, bookmarkLine };
}
