import { describe, expect, it } from "vitest";
import type { Preset } from "@/lib/engine/types";
import { epitaphFallback, epitaphId, type EpitaphFacts } from "./epitaph-bank";
import { noteSignature } from "./marginalia";
import { RETIRED_TERMS } from "./canon";

const SEED = "0x3333333333333333333333333333333333333333333333333333333333333333" as const;

function facts(over: Partial<EpitaphFacts> = {}): EpitaphFacts {
  return {
    runSeed: SEED,
    preset: "fantasy",
    depth: 2,
    killedBy: "Giant Rat",
    wasBookmark: false,
    turns: 4,
    carried: 1,
    ...over,
  };
}

/** Every shape the composer can be asked for, for the sweep assertions. */
function allShapes(): EpitaphFacts[] {
  const out: EpitaphFacts[] = [];
  const presets: Preset[] = ["fantasy", "cyberpunk", "scifi"];
  for (const preset of presets) {
    for (const depth of [1, 2, 3, 7]) {
      for (const wasBookmark of [true, false]) {
        for (const turns of [0, 1, 2, 11]) {
          for (const carried of [0, 1, 3]) {
            // Vary the seed so every opener template gets exercised.
            const hex = `${preset.length}${depth}${turns}${carried}`.padStart(64, "7");
            out.push(
              facts({
                runSeed: `0x${hex}` as `0x${string}`,
                preset,
                depth,
                wasBookmark,
                turns,
                carried,
                killedBy: wasBookmark ? "The Forest Hag" : "Giant Rat",
              }),
            );
          }
        }
      }
    }
  }
  return out;
}

describe("epitaph — composition", () => {
  it("is written in the player's own hand, not attributed to a borrower", () => {
    // The whole beat is that *your* note joins the margins. Signing it with
    // somebody else's name would quietly undo it.
    const note = epitaphFallback(facts());
    expect(note.by).toBeUndefined();
    expect(noteSignature(note)).toBe("your own hand");
  });

  it("is deterministic in the run's facts", () => {
    expect(epitaphFallback(facts())).toEqual(epitaphFallback(facts()));
  });

  it("different deaths read differently", () => {
    const a = epitaphFallback(facts({ depth: 1 }));
    const b = epitaphFallback(facts({ depth: 3 }));
    expect(a.text).not.toBe(b.text);
    expect(a.id).not.toBe(b.id);
  });

  it("ids are stable and derived from the facts, not a clock", () => {
    expect(epitaphId(facts())).toBe(epitaphId(facts()));
    expect(epitaphId(facts({ depth: 3 }))).not.toBe(epitaphId(facts()));
  });

  it("names what killed you, and says so differently for a bookmark", () => {
    const byMonster = epitaphFallback(facts({ killedBy: "Giant Rat" }));
    expect(byMonster.text).toContain("Giant Rat");

    const byBookmark = epitaphFallback(
      facts({ wasBookmark: true, killedBy: "The Forest Hag" }),
    );
    expect(byBookmark.text).toContain("The Forest Hag");
    expect(byBookmark.text).toContain("bookmark");
  });

  it("reports what was lost, including the nothing case", () => {
    expect(epitaphFallback(facts({ carried: 3 })).text).toContain("3");
    expect(epitaphFallback(facts({ carried: 0 })).text).toContain("carrying nothing");
  });

  /**
   * The composer concatenates clauses, which is exactly the shape of code
   * that produces "the The Hollow Reach" and "The Forest Hag..". Both of
   * those shipped to the browser before this test existed, so it sweeps every
   * combination rather than spot-checking one.
   */
  it("never doubles an article, a full stop, or a space", () => {
    for (const f of allShapes()) {
      const { text } = epitaphFallback(f);
      expect(text, `doubled article: ${text}`).not.toMatch(/\bthe The\b/i);
      expect(text, `doubled stop: ${text}`).not.toMatch(/\.\./);
      expect(text, `doubled space: ${text}`).not.toMatch(/ {2}/);
      expect(text, `space before stop: ${text}`).not.toMatch(/ \./);
      expect(text, `leading/trailing space: ${text}`).toBe(text.trim());
    }
  });

  it("always reads as whole sentences", () => {
    for (const f of allShapes()) {
      const { text } = epitaphFallback(f);
      expect(text).toMatch(/^[A-Z{]/);
      expect(text.trim()).toMatch(/[.!?]$/);
      // No unsubstituted template holes.
      expect(text).not.toContain("{");
      expect(text).not.toContain("}");
    }
  });

  it("stays inside the margin's length budget", () => {
    for (const f of allShapes()) {
      const { text } = epitaphFallback(f);
      expect(text.length, `${text.length} chars: ${text}`).toBeLessThanOrEqual(260);
    }
  });

  it("uses none of the retired vocabulary", () => {
    const prose = allShapes()
      .map((f) => epitaphFallback(f).text)
      .join(" ")
      .toLowerCase();
    for (const term of RETIRED_TERMS) {
      expect(prose, `retired term "${term}"`).not.toContain(term.toLowerCase());
    }
  });

  it("handles a depth past the written ordinals without emitting NaN", () => {
    const deep = epitaphFallback(facts({ depth: 23 }));
    expect(deep.text).not.toContain("undefined");
    expect(deep.text).not.toContain("NaN");
  });
});
