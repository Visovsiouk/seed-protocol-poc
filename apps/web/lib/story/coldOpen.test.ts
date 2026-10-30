import { describe, expect, it } from "vitest";
import { COLD_OPEN_BOOK, COLD_OPEN_STORAGE_KEY } from "./coldOpen";
import { RETIRED_TERMS } from "./canon";

/**
 * These assertions encode the *design brief* rather than the current content,
 * because the regression worth guarding against is specific: the opening this
 * replaced was five beats of two 60–80 word paragraphs — ~800 words before
 * the player touched the game — and it crept there one reasonable-seeming
 * sentence at a time. A beat count would not have caught that. A per-beat
 * word budget does.
 */

/** Max words in a single beat's body. The brief is 15–25. */
const WORD_BUDGET = 25;

function words(lines: readonly string[]): number {
  return lines.join(" ").trim().split(/\s+/).filter(Boolean).length;
}

function wordCount(beat: (typeof COLD_OPEN_BOOK)[number]): number {
  return words(beat.body);
}

/**
 * `afterGate` is budgeted separately rather than summed into `body`.
 *
 * It is a second screen-state of the same beat, not more of the first: the
 * player reads the body, performs the act, and *then* the consequence appears.
 * Summing the two would make any gated beat with an aftermath blow a 25-word
 * ceiling by construction — which would push an author toward writing the
 * prose somewhere this file cannot see it, i.e. straight back into the bug
 * these assertions exist to catch.
 *
 * It does have to be counted *somewhere*. This prose lived as JSX inside
 * `ColdOpenBook`'s renderFrame until a manual walkthrough caught it, and the
 * signing beat was putting ~74 words on screen against a ceiling of 25.
 */
function afterGateCount(beat: (typeof COLD_OPEN_BOOK)[number]): number {
  return beat.afterGate ? words(beat.afterGate) : 0;
}

describe("cold-open — the uncatalogued return", () => {
  it("is a short sequence, not a wall of pages", () => {
    expect(COLD_OPEN_BOOK.length).toBeGreaterThanOrEqual(8);
    expect(COLD_OPEN_BOOK.length).toBeLessThanOrEqual(10);
  });

  it("every beat stays inside the word budget", () => {
    for (const beat of COLD_OPEN_BOOK) {
      const n = wordCount(beat);
      expect(
        n,
        `"${beat.stamp}" is ${n} words; the budget is ${WORD_BUDGET}`,
      ).toBeLessThanOrEqual(WORD_BUDGET);
    }
  });

  it("a gated beat's aftermath also stays inside the budget", () => {
    // The hole this closes: prose written into the player component instead of
    // the beat data was never counted. Any beat carrying `afterGate` is held
    // to the same per-screen ceiling as its body.
    for (const beat of COLD_OPEN_BOOK) {
      const n = afterGateCount(beat);
      expect(
        n,
        `"${beat.stamp}" aftermath is ${n} words; the budget is ${WORD_BUDGET}`,
      ).toBeLessThanOrEqual(WORD_BUDGET);
    }
  });

  it("only a gated beat may carry an aftermath", () => {
    // `afterGate` renders when the gate is satisfied, so on an ungated beat it
    // would either never show or show immediately — both silently wrong.
    for (const beat of COLD_OPEN_BOOK) {
      if (beat.afterGate?.length) {
        expect(beat.gate, `"${beat.stamp}" has afterGate but no gate`).toBe(
          "interaction",
        );
      }
    }
  });

  it("the whole opening reads in well under the old one's word count", () => {
    // The previous version was ~800 words. Stated as a hard ceiling so a
    // future edit can't drift back toward it beat by beat. Counts aftermath
    // prose too — every word the player actually reads.
    const total = COLD_OPEN_BOOK.reduce(
      (n, b) => n + wordCount(b) + afterGateCount(b),
      0,
    );
    expect(total).toBeLessThan(250);
  });

  it("every beat carries the ledger shape the component renders", () => {
    for (const beat of COLD_OPEN_BOOK) {
      expect(beat.stamp).toMatch(/.+/);
      expect(beat.cta).toMatch(/.+/);
      expect(beat.body.length).toBeGreaterThan(0);
      for (const para of beat.body) {
        expect(para).toMatch(/.+/);
      }
    }
  });

  it("asks the player to act three times", () => {
    // `ColdOpenBook` maps the gated beats, in order, onto pull → read → sign.
    // Three is load-bearing: a fourth gate would have no act behind it.
    const gated = COLD_OPEN_BOOK.filter((b) => b.gate === "interaction");
    expect(gated).toHaveLength(3);
  });

  it("the signing is the last thing the player does", () => {
    // The opening's turn is that the mistake is *performed*, so the final
    // gate must come after every other gate and leave only the landing beat.
    const gateIndices = COLD_OPEN_BOOK.flatMap((b, i) =>
      b.gate === "interaction" ? [i] : [],
    );
    const lastGate = gateIndices[gateIndices.length - 1]!;
    expect(lastGate).toBe(COLD_OPEN_BOOK.length - 2);
  });

  it("introduces a margin voice before gameplay, with a signature", () => {
    // So the form is already familiar the first time a note drops in a run.
    const margins = COLD_OPEN_BOOK.filter((b) => b.voice === "margin");
    expect(margins.length).toBeGreaterThanOrEqual(1);
    for (const beat of margins) {
      expect(beat.footnote, "a margin note must be signed").toMatch(/.+/);
    }
  });

  it("never names the antagonist", () => {
    // He is introduced as a gap in the artifact — the one date-due entry with
    // no name — and never as a noun. An earlier version tried to introduce
    // him as a typographic effect (a line striking itself through and
    // rewriting mid-read); it didn't communicate and was cut along with the
    // machinery, so this is now the only assertion guarding the approach.
    const prose = COLD_OPEN_BOOK.flatMap((b) => [...b.body, b.stamp, b.footnote ?? ""])
      .join(" ")
      .toLowerCase();
    expect(prose).not.toContain("colophon");
  });

  it("every held line points at a line that exists", () => {
    for (const beat of COLD_OPEN_BOOK) {
      const held = beat.timing?.hold?.line;
      if (held === undefined) continue;
      expect(held).toBeGreaterThanOrEqual(0);
      expect(held).toBeLessThan(beat.body.length);
    }
  });

  it("declares only known voices", () => {
    for (const beat of COLD_OPEN_BOOK) {
      if (beat.voice) {
        expect(["book", "margin"]).toContain(beat.voice);
      }
    }
  });

  it("uses none of the retired vocabulary", () => {
    const prose = COLD_OPEN_BOOK.flatMap((b) => [
      ...b.body,
      b.stamp,
      b.cta,
      b.footnote ?? "",
    ])
      .join(" ")
      .toLowerCase();

    for (const term of RETIRED_TERMS) {
      expect(prose, `retired term "${term}" survived`).not.toContain(
        term.toLowerCase(),
      );
    }
  });

  it("storage key is versioned and on the app's namespace", () => {
    // `.v4` re-introduces the opening for everyone after this rewrite. The
    // prefix is normalised: this was the last key on the bare
    // `seed-protocol:` namespace while every other key uses the full one.
    expect(COLD_OPEN_STORAGE_KEY).toBe("seed-protocol-poc:cold-open-consumed.v4");
    expect(COLD_OPEN_STORAGE_KEY).toMatch(/^seed-protocol-poc:/);
    expect(COLD_OPEN_STORAGE_KEY).toMatch(/\.v\d+$/);
  });
});
