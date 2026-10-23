import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MARGIN_NOTES, marginAt, noteById } from "./marginalia";
import { BORROWERS, RETIRED_TERMS } from "./canon";

const SEED_A = "0x1111111111111111111111111111111111111111111111111111111111111111" as const;
const SEED_B = "0x2222222222222222222222222222222222222222222222222222222222222222" as const;

/** A spread of synthetic seeds for distribution checks. */
function seeds(n: number): `0x${string}`[] {
  return Array.from({ length: n }, (_, i) => {
    const hex = (i + 1).toString(16).padStart(64, "0");
    return `0x${hex}` as `0x${string}`;
  });
}

describe("marginalia — the bank", () => {
  it("every note has an id, text, date and a borrower the canon knows", () => {
    for (const n of MARGIN_NOTES) {
      expect(n.id).toMatch(/.+/);
      expect(n.text).toMatch(/.+/);
      expect(n.date).toMatch(/.+/);
      // Every note in the *bank* has a named author — `by` is only optional
      // so the player's own epitaph can be unattributed, and that note is
      // composed at runtime rather than living here.
      expect(n.by, `${n.id} has no author`).toBeDefined();
      expect(BORROWERS[n.by!], `unknown borrower "${n.by}" on ${n.id}`).toBeDefined();
    }
  });

  it("ids are unique — they key both localStorage and React", () => {
    const ids = MARGIN_NOTES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("notes stay short enough to actually get read", () => {
    // The whole reason marginalia exists is that 160-word paragraphs didn't
    // get read, so length is the thing worth guarding — and length means
    // words, not sentences.
    //
    // An earlier version of this capped sentences too, and it was simply the
    // wrong rule: Salk and Raine are *characterised* by clipped fragments
    // ("he FILES you. you get a slot."), and short sentences make a note
    // more readable, not less. It also miscounted — Raine's citations
    // ("E. Marrow, 1911. T. Salk, 1987.") split into a sentence apiece.
    // Capping density would have flattened two of the four voices to satisfy
    // a proxy for a constraint that `words` already measures directly.
    for (const n of MARGIN_NOTES) {
      const words = n.text.trim().split(/\s+/).length;
      expect(words, `${n.id} is ${words} words`).toBeLessThanOrEqual(32);
      // Secondary guard on what the margin actually has to fit on screen.
      expect(n.text.length, `${n.id} is ${n.text.length} chars`).toBeLessThanOrEqual(190);
    }
  });

  it("uses none of the retired vocabulary", () => {
    const prose = MARGIN_NOTES.map((n) => n.text).join(" ").toLowerCase();
    for (const term of RETIRED_TERMS) {
      expect(prose, `retired term "${term}" survived`).not.toContain(term.toLowerCase());
    }
  });

  it("names the antagonist at most once, and only ever as a guess", () => {
    // The proper noun ("the Colophon") is somebody's *theory* about what is
    // doing this, and at most one borrower gets to float it — nobody hands
    // the player a clean definition, because the mystery is the engagement.
    //
    // The common noun is a different word and stays free: a colophon is the
    // inscription at the end of a manuscript saying the work is finished,
    // and borrowers reaching for one is the thing the whole plot turns on.
    // Conflating the two would ban the metaphor along with the spoiler.
    const asName = MARGIN_NOTES.filter((n) => /\bthe Colophon\b/.test(n.text));
    expect(
      asName.length,
      `named outright in: ${asName.map((n) => n.id).join(", ")}`,
    ).toBeLessThanOrEqual(1);
  });

  it("draws on every margin voice, so the bank reads as several people", () => {
    const writers = new Set(MARGIN_NOTES.map((n) => n.by));
    expect(writers.size).toBeGreaterThanOrEqual(4);
  });

  it("resolves a note by id, and declines an unknown one", () => {
    expect(noteById(MARGIN_NOTES[0]!.id)?.id).toBe(MARGIN_NOTES[0]!.id);
    expect(noteById("nope")).toBeUndefined();
  });
});

describe("marginalia — the draw", () => {
  it("is deterministic in (seed, depth)", () => {
    for (let depth = 1; depth <= 4; depth++) {
      const a = marginAt({ runSeed: SEED_A, depth, preset: "fantasy" });
      const b = marginAt({ runSeed: SEED_A, depth, preset: "fantasy" });
      expect(a).toEqual(b);
    }
  });

  it("different depths of the same run draw independently", () => {
    const perDepth = [1, 2, 3, 4, 5, 6].map(
      (depth) => marginAt({ runSeed: SEED_A, depth, preset: "fantasy" })?.id ?? null,
    );
    // Not all the same value — otherwise depth isn't reaching the sub-seed.
    expect(new Set(perDepth).size).toBeGreaterThan(1);
  });

  it("different runs draw independently at the same depth", () => {
    const a = seeds(60).map((s) => marginAt({ runSeed: s, depth: 1, preset: "fantasy" })?.id ?? null);
    expect(new Set(a).size).toBeGreaterThan(1);
  });

  it("tags the find with the page it surfaced on, not the writer's page", () => {
    // This is the mechanism behind "the book carries their writing between
    // pages": the pool is global, so a 1911 note can turn up in 2041.
    const find = marginAt({ runSeed: SEED_B, depth: 1, preset: "scifi" });
    if (find) expect(find.foundOn).toBe("scifi");
  });

  it("the pool is global — notes surface on pages their writer never saw", () => {
    const onScifi = new Set(
      seeds(400)
        .map((s) => marginAt({ runSeed: s, depth: 2, preset: "scifi" })?.by)
        .filter(Boolean),
    );
    // Marrow wrote in 1911 and never set foot on the station.
    expect(onScifi.has("marrow")).toBe(true);
  });

  it("every note in the bank is reachable", () => {
    const seen = new Set<string>();
    for (const s of seeds(1500)) {
      for (const depth of [1, 2, 3]) {
        const f = marginAt({ runSeed: s, depth, preset: "fantasy" });
        if (f) seen.add(f.id);
      }
    }
    const unreachable = MARGIN_NOTES.filter((n) => !seen.has(n.id)).map((n) => n.id);
    expect(unreachable, `unreachable notes: ${unreachable.join(", ")}`).toEqual([]);
  });

  it("surfaces a note often enough to be a reason to look, rarely enough to be a find", () => {
    const sample = seeds(1200);
    const hits = sample.filter(
      (s) => marginAt({ runSeed: s, depth: 1, preset: "fantasy" }) !== null,
    ).length;
    const rate = hits / sample.length;
    expect(rate).toBeGreaterThan(0.4);
    expect(rate).toBeLessThan(0.7);
  });

  it("does not mutate its arguments", () => {
    const args = { runSeed: SEED_A, depth: 2, preset: "fantasy" as const };
    const snapshot = JSON.stringify(args);
    marginAt(args);
    expect(JSON.stringify(args)).toBe(snapshot);
  });

  it("returns a fresh object each call, so a caller can't poison the bank", () => {
    const a = marginAt({ runSeed: SEED_A, depth: 1, preset: "fantasy" });
    const b = marginAt({ runSeed: SEED_A, depth: 1, preset: "fantasy" });
    if (a && b) {
      expect(a).not.toBe(b);
      a.text = "tampered";
      expect(noteById(a.id)!.text).not.toBe("tampered");
    }
  });
});

describe("marginalia — the engine firewall", () => {
  it("does not import the engine barrel", () => {
    // The draw must never be able to perturb a loot or combat roll. It builds
    // its own `Rng` from a domain-separated sub-seed and imports only the
    // pure `createRng` constructor — never `lib/engine/index`, which is where
    // the run/step machinery lives. Asserted on the source because this is a
    // structural guarantee, not a behavioural one.
    const src = readFileSync(join(__dirname, "marginalia.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["']@\/lib\/engine["']/);
    expect(src).not.toMatch(/from\s+["']@\/lib\/engine\/index["']/);
    expect(src).not.toMatch(/from\s+["']\.\.\/engine["']/);
  });

  it("uses a domain separator, so it can never collide with engine sub-seeds", () => {
    const src = readFileSync(join(__dirname, "marginalia.ts"), "utf8");
    expect(src).toContain('"margin"');
  });
});
