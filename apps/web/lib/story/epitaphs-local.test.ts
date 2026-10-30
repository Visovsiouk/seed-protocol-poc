import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEpitaphs, markEpitaphWritten } from "./epitaphs-local";
import { epitaphFallback } from "./epitaph-bank";
import type { MarginNote } from "./marginalia";

/**
 * Mirrors `margins-local.test.ts` case for case — the two adapters share a
 * shape and a failure posture, so they should share a test shape too. The
 * additions here are the ones specific to storing whole notes rather than
 * ids: a corrupt row must not reach the renderer, and the prose must come
 * back exactly as it went in (that is the whole reason this store keeps the
 * rendered note instead of the facts).
 */

const KEY = "seed-protocol-poc:epitaphs.v1";
const A = "0xAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaa" as const;
const B = "0xBBbbBBbbBBbbBBbbBBbbBBbbBBbbBBbbBBbbBBbb" as const;

/** A real epitaph, composed the way `EncounterFrame` composes one. */
function noteAt(depth: number, over: Partial<MarginNote> = {}): MarginNote {
  const note = epitaphFallback({
    runSeed: `0x${"ab".repeat(32)}` as `0x${string}`,
    preset: "fantasy",
    depth,
    killedBy: "Forest Hag",
    wasBookmark: true,
    turns: 5,
    carried: 2,
  });
  return { ...note, ...over };
}

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe("epitaphs-local", () => {
  it("round-trips a note verbatim", () => {
    const note = noteAt(3);
    markEpitaphWritten(A, note);
    expect(loadEpitaphs(A)).toEqual([note]);
  });

  it("keeps the prose byte-identical across a reload", () => {
    // The reason this store holds the note and not the facts: a model-sourced
    // epitaph cannot be recomposed, so re-reading the Book must replay the
    // exact words the player was shown when they died.
    const note = noteAt(3, { text: "A line only a model would have written." });
    markEpitaphWritten(A, note);
    expect(loadEpitaphs(A)[0]!.text).toBe(
      "A line only a model would have written.",
    );
  });

  it("keeps deaths in the order they happened", () => {
    markEpitaphWritten(A, noteAt(1));
    markEpitaphWritten(A, noteAt(2));
    markEpitaphWritten(A, noteAt(3));
    expect(loadEpitaphs(A).map((n) => n.id)).toEqual([
      noteAt(1).id,
      noteAt(2).id,
      noteAt(3).id,
    ]);
  });

  it("is idempotent on id — a reloaded defeat screen doesn't duplicate", () => {
    const note = noteAt(3);
    markEpitaphWritten(A, note);
    markEpitaphWritten(A, note);
    markEpitaphWritten(A, note);
    expect(loadEpitaphs(A)).toHaveLength(1);
  });

  it("treats two different deaths as two notes", () => {
    markEpitaphWritten(A, noteAt(2));
    markEpitaphWritten(A, noteAt(5));
    expect(loadEpitaphs(A)).toHaveLength(2);
  });

  it("replaces the prose when the same death is written with new words", () => {
    // `epitaphId` hashes the run's facts, not the text, so the bank note and a
    // generated one share an id. Dropping the second write meant the bank line
    // won the race and the Book showed words the player never read — the drift
    // this store holds prose to prevent.
    const bank = noteAt(3);
    markEpitaphWritten(A, bank);
    markEpitaphWritten(A, { ...bank, text: "What the model actually said." });

    const rows = loadEpitaphs(A);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.text).toBe("What the model actually said.");
  });

  it("keeps a corrected note in the position the death happened", () => {
    markEpitaphWritten(A, noteAt(1));
    markEpitaphWritten(A, noteAt(2));
    markEpitaphWritten(A, noteAt(3));
    markEpitaphWritten(A, { ...noteAt(2), text: "Rewritten by the model." });

    const rows = loadEpitaphs(A);
    expect(rows.map((n) => n.id)).toEqual([
      noteAt(1).id,
      noteAt(2).id,
      noteAt(3).id,
    ]);
    expect(rows[1]!.text).toBe("Rewritten by the model.");
  });

  it("does not touch storage when the words are unchanged", () => {
    const note = noteAt(3);
    markEpitaphWritten(A, note);
    const setItem = vi.spyOn(window.localStorage, "setItem");
    try {
      markEpitaphWritten(A, note);
      expect(setItem).not.toHaveBeenCalled();
    } finally {
      setItem.mockRestore();
    }
  });

  it("namespaces by player", () => {
    markEpitaphWritten(A, noteAt(1));
    markEpitaphWritten(B, noteAt(2));
    expect(loadEpitaphs(A).map((n) => n.id)).toEqual([noteAt(1).id]);
    expect(loadEpitaphs(B).map((n) => n.id)).toEqual([noteAt(2).id]);
  });

  it("is case-insensitive on the address, like the codex stores", () => {
    markEpitaphWritten(A, noteAt(1));
    expect(loadEpitaphs(A.toLowerCase() as `0x${string}`)).toHaveLength(1);
  });

  it("returns nothing for an unknown player or no wallet", () => {
    markEpitaphWritten(A, noteAt(1));
    expect(loadEpitaphs(B)).toEqual([]);
    expect(loadEpitaphs(undefined)).toEqual([]);
  });

  it("a disconnected death is a silent no-op rather than a throw", () => {
    expect(() => markEpitaphWritten(undefined, noteAt(1))).not.toThrow();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("refuses to store something that isn't a note", () => {
    // Guards the renderer, which reads `.text` unconditionally.
    markEpitaphWritten(A, {} as MarginNote);
    markEpitaphWritten(A, { id: "e-1" } as MarginNote);
    expect(loadEpitaphs(A)).toEqual([]);
  });

  it("tolerates corrupt JSON", () => {
    window.localStorage.setItem(KEY, "{not json");
    expect(loadEpitaphs(A)).toEqual([]);
    // And recovers: the next write replaces the garbage.
    markEpitaphWritten(A, noteAt(1));
    expect(loadEpitaphs(A)).toHaveLength(1);
  });

  it("tolerates a structurally wrong payload", () => {
    window.localStorage.setItem(KEY, JSON.stringify(["e-01"]));
    expect(loadEpitaphs(A)).toEqual([]);
  });

  it("tolerates a non-array entry for a player", () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ [A.toLowerCase()]: "e-01" }),
    );
    expect(loadEpitaphs(A)).toEqual([]);
  });

  it("filters malformed rows rather than handing them to the renderer", () => {
    const good = noteAt(3);
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        [A.toLowerCase()]: [good, 42, null, { id: "e-2" }, { text: "no id" }],
      }),
    );
    expect(loadEpitaphs(A)).toEqual([good]);
  });

  it("stays quiet when storage throws — a lost note must not break a run", () => {
    const boom = () => {
      throw new Error("QuotaExceededError");
    };
    vi.stubGlobal("localStorage", {
      getItem: boom,
      setItem: boom,
      removeItem: boom,
      clear: () => {},
      key: () => null,
      length: 0,
    });
    expect(() => markEpitaphWritten(A, noteAt(1))).not.toThrow();
    expect(() => loadEpitaphs(A)).not.toThrow();
    expect(loadEpitaphs(A)).toEqual([]);
  });
});
