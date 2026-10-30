import { afterEach, describe, expect, it, vi } from "vitest";
import { loadFoundMargins, markMarginFound } from "./margins-local";

const KEY = "seed-protocol-poc:margins.v2";
const LEGACY_KEY = "seed-protocol-poc:margins.v1";
const A = "0xAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaa" as const;
const B = "0xBBbbBBbbBBbbBBbbBBbbBBbbBBbbBBbbBBbbBBbb" as const;

/** Just the ids, for the tests that don't care where a note turned up. */
const ids = (player: `0x${string}` | undefined) =>
  loadFoundMargins(player).map((f) => f.id);

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe("margins-local", () => {
  it("round-trips a find with the page it turned up on", () => {
    markMarginFound(A, "m-01", "scifi");
    expect(loadFoundMargins(A)).toEqual([{ id: "m-01", on: "scifi" }]);
  });

  it("records a find with no page as null rather than guessing", () => {
    markMarginFound(A, "m-01");
    expect(loadFoundMargins(A)).toEqual([{ id: "m-01", on: null }]);
  });

  it("keeps finds in the order they were made", () => {
    markMarginFound(A, "m-03", "fantasy");
    markMarginFound(A, "s-01", "cyberpunk");
    markMarginFound(A, "r-02", "scifi");
    expect(ids(A)).toEqual(["m-03", "s-01", "r-02"]);
  });

  it("is idempotent — re-finding a note doesn't duplicate it", () => {
    markMarginFound(A, "m-01", "fantasy");
    markMarginFound(A, "m-01", "fantasy");
    markMarginFound(A, "m-01", "fantasy");
    expect(ids(A)).toEqual(["m-01"]);
  });

  it("does not re-stamp an existing find with a different page", () => {
    // The first page it surfaced on is the true one; a later descent that
    // draws the same note must not rewrite history.
    markMarginFound(A, "m-01", "fantasy");
    markMarginFound(A, "m-01", "scifi");
    expect(loadFoundMargins(A)).toEqual([{ id: "m-01", on: "fantasy" }]);
  });

  it("namespaces by player", () => {
    markMarginFound(A, "m-01", "fantasy");
    markMarginFound(B, "s-02", "scifi");
    expect(ids(A)).toEqual(["m-01"]);
    expect(ids(B)).toEqual(["s-02"]);
  });

  it("is case-insensitive on the address, like the codex stores", () => {
    markMarginFound(A, "m-01", "fantasy");
    expect(ids(A.toLowerCase() as `0x${string}`)).toEqual(["m-01"]);
  });

  it("returns nothing for an unknown player or no wallet", () => {
    markMarginFound(A, "m-01", "fantasy");
    expect(loadFoundMargins(B)).toEqual([]);
    expect(loadFoundMargins(undefined)).toEqual([]);
  });

  it("a disconnected find is a silent no-op rather than a throw", () => {
    expect(() => markMarginFound(undefined, "m-01", "fantasy")).not.toThrow();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  // ── v1 → v2 ──────────────────────────────────────────────────────────────

  it("reads a v1 collection, reporting no page rather than inventing one", () => {
    // v1 stored bare ids. Those finds genuinely have no recorded page.
    window.localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify({ [A.toLowerCase()]: ["m-01", "s-02"] }),
    );
    expect(loadFoundMargins(A)).toEqual([
      { id: "m-01", on: null },
      { id: "s-02", on: null },
    ]);
  });

  it("a v1 player's collection survives their next find", () => {
    window.localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify({ [A.toLowerCase()]: ["m-01"] }),
    );
    markMarginFound(A, "r-02", "scifi");
    expect(loadFoundMargins(A)).toEqual([
      { id: "m-01", on: null },
      { id: "r-02", on: "scifi" },
    ]);
  });

  it("v1 does not resurrect a note already superseded in v2", () => {
    // Once v2 exists it is the only source — otherwise a player who un-found
    // nothing would still see v1 ghosts forever.
    window.localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify({ [A.toLowerCase()]: ["m-01", "s-02", "r-03"] }),
    );
    markMarginFound(A, "q-01", "fantasy");
    expect(ids(A)).toEqual(["m-01", "s-02", "r-03", "q-01"]);
    // And from here v2 alone answers.
    window.localStorage.removeItem(LEGACY_KEY);
    expect(ids(A)).toEqual(["m-01", "s-02", "r-03", "q-01"]);
  });

  // ── Hostile payloads ─────────────────────────────────────────────────────

  it("tolerates corrupt JSON", () => {
    window.localStorage.setItem(KEY, "{not json");
    expect(loadFoundMargins(A)).toEqual([]);
    // And recovers: the next write replaces the garbage.
    markMarginFound(A, "m-01", "fantasy");
    expect(ids(A)).toEqual(["m-01"]);
  });

  it("tolerates a structurally wrong payload", () => {
    window.localStorage.setItem(KEY, JSON.stringify(["m-01"]));
    expect(loadFoundMargins(A)).toEqual([]);
  });

  it("tolerates a non-array entry for a player", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ [A.toLowerCase()]: "m-01" }));
    expect(loadFoundMargins(A)).toEqual([]);
  });

  it("filters junk entries rather than handing them to the renderer", () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        [A.toLowerCase()]: [
          { id: "m-01", on: "fantasy" },
          42,
          null,
          { on: "scifi" }, // no id
          "s-02", // a stray v1 entry inside a v2 list
        ],
      }),
    );
    expect(loadFoundMargins(A)).toEqual([
      { id: "m-01", on: "fantasy" },
      { id: "s-02", on: null },
    ]);
  });

  it("rejects a page that isn't a real preset", () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ [A.toLowerCase()]: [{ id: "m-01", on: "atlantis" }] }),
    );
    expect(loadFoundMargins(A)).toEqual([{ id: "m-01", on: null }]);
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
    expect(() => markMarginFound(A, "m-01", "fantasy")).not.toThrow();
    expect(() => loadFoundMargins(A)).not.toThrow();
    expect(loadFoundMargins(A)).toEqual([]);
  });
});
