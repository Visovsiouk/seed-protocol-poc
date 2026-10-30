import { afterEach, describe, expect, it, vi } from "vitest";
import { crossingId, loadCrossings, markCrossing } from "./crossings-local";

/**
 * Mirrors `epitaphs-local.test.ts` case for case — the three story stores
 * share a shape and a failure posture, so they share a test shape too. The
 * additions here are the ones specific to keying on an ordered pair of pages
 * rather than on a run: a second crossing in the same direction is the same
 * fact, the reverse direction is a different one, and a row carrying a preset
 * the canon doesn't know must never reach the Book (which indexes `PAGES` by
 * it and would render `undefined` as a page name).
 */

const KEY = "seed-protocol-poc:crossings.v1";
const A = "0xAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaa" as const;
const B = "0xBBbbBBbbBBbbBBbbBBbbBBbbBBbbBBbbBBbbBBbb" as const;

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("crossings-local", () => {
  it("records a crossing with both ends and a time", () => {
    markCrossing(A, "fantasy", "cyberpunk");
    expect(loadCrossings(A)).toEqual([
      {
        id: "fantasy>cyberpunk",
        from: "fantasy",
        to: "cyberpunk",
        at: expect.any(Number),
      },
    ]);
  });

  it("is idempotent on the ordered pair — carrying a second sword isn't a second fact", () => {
    markCrossing(A, "fantasy", "cyberpunk");
    markCrossing(A, "fantasy", "cyberpunk");
    markCrossing(A, "fantasy", "cyberpunk");
    expect(loadCrossings(A)).toHaveLength(1);
  });

  it("keeps the first crossing's date, not the latest", () => {
    // `at` is the one the player remembers; a re-descent must not re-date it.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    markCrossing(A, "fantasy", "cyberpunk");
    const first = loadCrossings(A)[0]!.at;
    vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));
    markCrossing(A, "fantasy", "cyberpunk");
    expect(loadCrossings(A)[0]!.at).toBe(first);
  });

  it("treats the reverse direction as its own crossing", () => {
    markCrossing(A, "fantasy", "cyberpunk");
    markCrossing(A, "cyberpunk", "fantasy");
    expect(loadCrossings(A).map((c) => c.id)).toEqual([
      "fantasy>cyberpunk",
      "cyberpunk>fantasy",
    ]);
  });

  it("keeps crossings in the order they happened", () => {
    markCrossing(A, "fantasy", "cyberpunk");
    markCrossing(A, "cyberpunk", "scifi");
    markCrossing(A, "fantasy", "scifi");
    expect(loadCrossings(A).map((c) => c.id)).toEqual([
      "fantasy>cyberpunk",
      "cyberpunk>scifi",
      "fantasy>scifi",
    ]);
  });

  it("drops a page crossing into itself — nothing crossed", () => {
    markCrossing(A, "fantasy", "fantasy");
    expect(loadCrossings(A)).toEqual([]);
  });

  it("stays bounded: three pages give six ordered pairs and no more", () => {
    // This is why there's no cap and no log pruning. Creator pages draw from
    // the same three presets, so founding realms can't change it.
    const presets = ["fantasy", "cyberpunk", "scifi"] as const;
    for (const from of presets) {
      for (const to of presets) {
        markCrossing(A, from, to);
        markCrossing(A, from, to);
      }
    }
    expect(loadCrossings(A)).toHaveLength(6);
  });

  it("namespaces by player", () => {
    markCrossing(A, "fantasy", "cyberpunk");
    markCrossing(B, "cyberpunk", "scifi");
    expect(loadCrossings(A).map((c) => c.id)).toEqual(["fantasy>cyberpunk"]);
    expect(loadCrossings(B).map((c) => c.id)).toEqual(["cyberpunk>scifi"]);
  });

  it("is case-insensitive on the address, like the codex stores", () => {
    markCrossing(A, "fantasy", "cyberpunk");
    expect(loadCrossings(A.toLowerCase() as `0x${string}`)).toHaveLength(1);
  });

  it("returns nothing for an unknown player or no wallet", () => {
    markCrossing(A, "fantasy", "cyberpunk");
    expect(loadCrossings(B)).toEqual([]);
    expect(loadCrossings(undefined)).toEqual([]);
  });

  it("a disconnected crossing is a silent no-op rather than a throw", () => {
    expect(() => markCrossing(undefined, "fantasy", "cyberpunk")).not.toThrow();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("refuses a preset the canon doesn't know", () => {
    // The Book indexes `PAGES[row.from]` for a page name, so an unknown
    // preset would render `undefined` into the panel.
    markCrossing(A, "medieval" as "fantasy", "cyberpunk");
    markCrossing(A, "fantasy", "steampunk" as "scifi");
    expect(loadCrossings(A)).toEqual([]);
  });

  it("tolerates corrupt JSON", () => {
    window.localStorage.setItem(KEY, "{not json");
    expect(loadCrossings(A)).toEqual([]);
    // And recovers: the next write replaces the garbage.
    markCrossing(A, "fantasy", "cyberpunk");
    expect(loadCrossings(A)).toHaveLength(1);
  });

  it("tolerates a structurally wrong payload", () => {
    window.localStorage.setItem(KEY, JSON.stringify(["fantasy>cyberpunk"]));
    expect(loadCrossings(A)).toEqual([]);
  });

  it("tolerates a non-array entry for a player", () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ [A.toLowerCase()]: "fantasy>cyberpunk" }),
    );
    expect(loadCrossings(A)).toEqual([]);
  });

  it("filters malformed rows rather than handing them to the renderer", () => {
    const good = {
      id: "fantasy>cyberpunk",
      from: "fantasy",
      to: "cyberpunk",
      at: 1_700_000_000,
    };
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        [A.toLowerCase()]: [
          good,
          42,
          null,
          { id: "x" },
          { id: "y", from: "nowhere", to: "cyberpunk", at: 1 },
          { id: "z", from: "fantasy", to: "cyberpunk" },
        ],
      }),
    );
    expect(loadCrossings(A)).toEqual([good]);
  });

  it("doesn't let a malformed row survive the next write", () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ [A.toLowerCase()]: [{ id: "junk" }] }),
    );
    markCrossing(A, "fantasy", "cyberpunk");
    expect(loadCrossings(A).map((c) => c.id)).toEqual(["fantasy>cyberpunk"]);
  });

  it("stays quiet when storage throws — a lost record must not break a descent", () => {
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
    expect(() => markCrossing(A, "fantasy", "cyberpunk")).not.toThrow();
    expect(() => loadCrossings(A)).not.toThrow();
    expect(loadCrossings(A)).toEqual([]);
  });
});

describe("crossingId", () => {
  it("is directional", () => {
    expect(crossingId("fantasy", "cyberpunk")).not.toBe(
      crossingId("cyberpunk", "fantasy"),
    );
  });
});
