import { describe, expect, it } from "vitest";

import {
  countSentences,
  sanitizeProse,
  truncateAtSentence,
} from "./prose-filter";

/**
 * Sentence boundaries, which is where this filter was wrong.
 *
 * Counting and truncating each had their own idea of what ends a sentence, and
 * the gap between them was load-bearing in both directions: quoted dialogue
 * walked through the sentence cap, and an abbreviation's period could become
 * the cut point for a fragment that then passed every remaining check. Both
 * are regression cases here rather than coverage of the regex.
 */

describe("countSentences", () => {
  it("counts a sentence that ends inside a closing quote", () => {
    // The bug: `."` was a sentence end for truncation but not for counting,
    // so this read as 3 and cleared a 3-sentence cap it should have failed.
    expect(
      countSentences(
        'He said "run." I did not. The door shut behind me. Nothing followed.',
      ),
    ).toBe(4);
  });

  it("agrees with the unquoted equivalent", () => {
    expect(countSentences("One. Two. Three. Four.")).toBe(4);
  });

  it.each([
    ["an ellipsis", "It went on... and then it stopped.", 2],
    ["an interrobang", "What was that?! Nothing answered.", 2],
  ])("counts %s as one ending", (_label, text, want) => {
    expect(countSentences(text)).toBe(want);
  });

  it.each([
    ["an initial", "Filed by V. Raine in the spring. Nothing since."],
    ["a title", "Dr. Vantage signed for it. Nobody else did."],
  ])("does not count the period in %s", (_label, text) => {
    expect(countSentences(text)).toBe(2);
  });

  it("treats prose with no terminator as one sentence", () => {
    // The caller's end-of-sentence check is what rejects this, not the count.
    expect(countSentences("the lamp guttered out")).toBe(1);
  });

  it("counts nothing in empty input", () => {
    expect(countSentences("   ")).toBe(0);
  });
});

describe("truncateAtSentence", () => {
  it("returns text already within the cap untouched", () => {
    expect(truncateAtSentence("Short enough.", 400)).toBe("Short enough.");
  });

  it("cuts at the last complete sentence", () => {
    expect(truncateAtSentence("First one here. Second one here. Third.", 20)).toBe(
      "First one here.",
    );
  });

  it("keeps a closing quote with the terminator it belongs to", () => {
    const text = `He said "run." ${"x".repeat(60)} and then the door shut for good.`;
    expect(truncateAtSentence(text, 40)).toBe('He said "run."');
  });

  it("refuses a window whose only ending is an abbreviation", () => {
    // This is the case with a permanent consequence: a page whose only period
    // inside the cap belongs to an initial would otherwise be cut to
    // "...written by V.", which ends in a terminator and counts as one
    // sentence — so it passes the rest of the filter and gets persisted.
    const filler =
      "the lamp guttered and the damp got into the signatures and nobody came back for it ".repeat(
        5,
      );
    const page = `${filler}written by V. Raine who never returned to collect what was owed`;
    expect(page.length).toBeGreaterThan(400);
    expect(truncateAtSentence(page, 400)).toBeNull();
  });

  it("returns null when no sentence fits at all", () => {
    expect(truncateAtSentence("a".repeat(500), 400)).toBeNull();
  });
});

describe("sanitizeProse", () => {
  it("enforces the sentence cap against quoted dialogue", () => {
    // The whole point of the shared definition: this used to come back as
    // four sentences of prose against a three-sentence limit.
    expect(
      sanitizeProse(
        'He said "run." I did not. The door shut behind me. Nothing followed.',
        { maxChars: 240, maxSentences: 3 },
      ),
    ).toBeNull();
  });

  it("still accepts three sentences with dialogue in them", () => {
    const ok = 'He said "run." I did not. The door shut behind me.';
    expect(sanitizeProse(ok, { maxChars: 240, maxSentences: 3 })).toBe(ok);
  });
});
