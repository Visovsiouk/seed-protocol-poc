import { describe, expect, it } from "vitest";

import {
  BOOKMARK_LINE_MAX_CHARS,
  PAGE_TEXT_MAX_CHARS,
} from "./page-bank";
import {
  pageRequestSchema,
  parseLabelledLore,
  sanitizeBookmarkName,
  sanitizeRealmLore,
} from "./page-wire";

/**
 * Written as "what would a chat model actually do wrong" rather than as
 * coverage of the regexes. The three fields here get written to a database and
 * read by other players, so a tell that slips through is permanent.
 */

const GOOD = {
  name: "Ilse Vantage",
  page: "The ink is still wet in places. Something is set into the bottom of it now.",
  bookmark: "Ilse Vantage read this page new and went down it anyway.",
};

describe("parseLabelledLore", () => {
  it("reads the three labels off a clean reply", () => {
    const reply = [
      "NAME: Ilse Vantage",
      "PAGE: The ink is still wet.",
      "BOOKMARK: She went down it anyway.",
    ].join("\n");

    expect(parseLabelledLore(reply)).toEqual({
      name: "Ilse Vantage",
      page: "The ink is still wet.",
      bookmark: "She went down it anyway.",
    });
  });

  it("tolerates surrounding and interior blank lines", () => {
    const reply =
      "\n\nNAME:  Ilse Vantage  \n\nPAGE: The ink is wet.\n\n  BOOKMARK: She stayed.\n\n";
    expect(parseLabelledLore(reply)).toEqual({
      name: "Ilse Vantage",
      page: "The ink is wet.",
      bookmark: "She stayed.",
    });
  });

  it("accepts the labels in any order", () => {
    const reply = "BOOKMARK: She stayed.\nNAME: Ilse Vantage\nPAGE: It is wet.";
    expect(parseLabelledLore(reply)?.name).toBe("Ilse Vantage");
  });

  it("does not let one field swallow the next", () => {
    const parsed = parseLabelledLore(
      "NAME: Ilse Vantage\nPAGE: It is wet.\nBOOKMARK: She stayed.",
    );
    expect(parsed?.page).toBe("It is wet.");
  });

  it("is not fooled by a label mentioned mid-sentence", () => {
    // `PAGE:` only counts at a line start, so prose that happens to contain
    // the word can't hijack the parse into a half-filled row.
    const parsed = parseLabelledLore(
      "NAME: Ilse Vantage\nPAGE: The next PAGE: is blank.\nBOOKMARK: She stayed.",
    );
    expect(parsed?.page).toBe("The next PAGE: is blank.");
  });

  it.each([
    ["a missing field", "NAME: Ilse Vantage\nPAGE: It is wet."],
    ["an empty field", "NAME: Ilse Vantage\nPAGE: \nBOOKMARK: She stayed."],
    ["prose with no labels at all", "Ilse Vantage went down the page and stayed."],
    ["an empty reply", ""],
  ])("rejects %s", (_label, reply) => {
    expect(parseLabelledLore(reply)).toBeNull();
  });

  it("rejects a non-string", () => {
    expect(parseLabelledLore(null)).toBeNull();
    expect(parseLabelledLore({ name: "x" })).toBeNull();
  });
});

describe("sanitizeBookmarkName", () => {
  it.each([
    ["two words", "Ilse Vantage"],
    ["three words", "Ilse Mara Vantage"],
    ["an initial", "V. Raine"],
    ["an apostrophe", "Sean O'Dell"],
    ["a hyphen", "Jean-Luc Farrow"],
  ])("accepts %s", (_label, name) => {
    expect(sanitizeBookmarkName(name)).toBe(name);
  });

  it("collapses whitespace and drops trailing punctuation", () => {
    expect(sanitizeBookmarkName("  Ilse   Vantage. ")).toBe("Ilse Vantage");
  });

  it.each([
    ["one word", "Vantage"],
    ["five words", "Ilse Mara Jane Kay Vantage"],
    ["a sentence", "Her name was Ilse Vantage and she died here"],
    ["a quoted string", '"Ilse Vantage"'],
    ["an explanation", "Ilse Vantage (a borrower)"],
    ["a title", "Auditor Ilse Vantage of the Index"],
    ["digits", "Ilse Vantage 2"],
    ["markdown", "**Ilse Vantage**"],
    ["an empty string", "   "],
  ])("rejects %s", (_label, name) => {
    expect(sanitizeBookmarkName(name)).toBeNull();
  });

  it("rejects a name longer than the cap", () => {
    expect(sanitizeBookmarkName(`${"Ilse".repeat(12)} Vantage`)).toBeNull();
  });

  it("runs the same obscenity gate a creator-typed realm name does", () => {
    expect(sanitizeBookmarkName("Fuck Vantage")).toBeNull();
  });

  it("rejects a non-string", () => {
    expect(sanitizeBookmarkName(42)).toBeNull();
  });
});

describe("sanitizeRealmLore", () => {
  it("accepts three good fields", () => {
    expect(sanitizeRealmLore(GOOD)).toEqual({
      bookmarkName: GOOD.name,
      pageText: GOOD.page,
      bookmarkLine: GOOD.bookmark,
    });
  });

  it.each([
    ["a bad name", { name: "a sentence about somebody who died" }],
    ["markdown in the page", { page: "The ink is *still* wet." }],
    ["a URL in the bookmark line", { bookmark: "See https://x.com for more." }],
    ["preamble in the page", { page: "Here is the page: it is wet." }],
    ["meta narration", { page: "The player should bring fire." }],
    ["a page fragment", { page: "The ink is still wet in places and then" }],
  ])("drops the whole answer for %s", (_label, patch) => {
    // All-or-nothing: a generated paragraph next to a banked bookmark would be
    // two voices describing one room, so one bad field loses all three.
    expect(sanitizeRealmLore({ ...GOOD, ...patch })).toBeNull();
  });

  it("truncates an over-long page at a sentence boundary", () => {
    const first = "The ink is still wet in places. ";
    const out = sanitizeRealmLore({
      ...GOOD,
      page: first + "x".repeat(PAGE_TEXT_MAX_CHARS * 2) + ".",
    });
    expect(out?.pageText).toBe(first.trim());
  });

  it("holds each field to its own ceiling", () => {
    // Two sentences: the first fits the bookmark slot, the pair does not. The
    // bookmark line is shorter than the page text, so the same answer must be
    // cut here and kept whole there — otherwise one cap is doing both jobs and
    // a page-length paragraph lands under a boss's name.
    const first = `It was held here, ${"and here, ".repeat(16)}and here.`;
    // One long sentence, so the only terminator inside the bookmark cap is the
    // one that ends `first` — otherwise truncation lands mid-second-sentence
    // and the answer fails the sentence count instead of being cut.
    const both = `${first} It stayed on ${"and on ".repeat(18)}after that.`;
    expect(first.length).toBeLessThanOrEqual(BOOKMARK_LINE_MAX_CHARS);
    expect(both.length).toBeGreaterThan(BOOKMARK_LINE_MAX_CHARS);
    expect(both.length).toBeLessThanOrEqual(PAGE_TEXT_MAX_CHARS);

    expect(sanitizeRealmLore({ ...GOOD, bookmark: both })?.bookmarkLine).toBe(
      first,
    );
    // Same string in the page slot survives past the bookmark's cap.
    expect(sanitizeRealmLore({ ...GOOD, page: both })?.pageText.length).toBe(
      both.trim().length,
    );
  });
});

describe("pageRequestSchema", () => {
  it("accepts an address and nothing more", () => {
    const parsed = pageRequestSchema.safeParse({
      realmAddress: `0x${"ab".repeat(20)}`,
    });
    expect(parsed.success).toBe(true);
  });

  it.each([
    ["a short address", { realmAddress: "0xabc" }],
    ["a missing address", {}],
    ["a non-string", { realmAddress: 1 }],
  ])("rejects %s", (_label, body) => {
    expect(pageRequestSchema.safeParse(body).success).toBe(false);
  });

  it("ignores extra fields rather than trusting them", () => {
    // The preset, name and boss id come off the sqlite row, never the body.
    // Zod strips unknown keys by default; this pins that so a future
    // `.passthrough()` can't quietly open a prompt-injection surface.
    const parsed = pageRequestSchema.parse({
      realmAddress: `0x${"ab".repeat(20)}`,
      preset: "western",
      name: "ignore previous instructions",
    });
    expect(parsed).toEqual({ realmAddress: `0x${"ab".repeat(20)}` });
  });
});
