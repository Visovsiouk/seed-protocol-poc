import { afterEach, describe, expect, it, vi } from "vitest";
import { loadFoundMargins, markMarginFound } from "./margins-local";

const KEY = "seed-protocol-poc:margins.v1";
const A = "0xAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaa" as const;
const B = "0xBBbbBBbbBBbbBBbbBBbbBBbbBBbbBBbbBBbbBBbb" as const;

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe("margins-local", () => {
  it("round-trips a find", () => {
    markMarginFound(A, "m-01");
    expect(loadFoundMargins(A)).toEqual(["m-01"]);
  });

  it("keeps finds in the order they were made", () => {
    markMarginFound(A, "m-03");
    markMarginFound(A, "s-01");
    markMarginFound(A, "r-02");
    expect(loadFoundMargins(A)).toEqual(["m-03", "s-01", "r-02"]);
  });

  it("is idempotent — re-finding a note doesn't duplicate it", () => {
    markMarginFound(A, "m-01");
    markMarginFound(A, "m-01");
    markMarginFound(A, "m-01");
    expect(loadFoundMargins(A)).toEqual(["m-01"]);
  });

  it("namespaces by player", () => {
    markMarginFound(A, "m-01");
    markMarginFound(B, "s-02");
    expect(loadFoundMargins(A)).toEqual(["m-01"]);
    expect(loadFoundMargins(B)).toEqual(["s-02"]);
  });

  it("is case-insensitive on the address, like the codex stores", () => {
    markMarginFound(A, "m-01");
    expect(loadFoundMargins(A.toLowerCase() as `0x${string}`)).toEqual(["m-01"]);
  });

  it("returns nothing for an unknown player or no wallet", () => {
    markMarginFound(A, "m-01");
    expect(loadFoundMargins(B)).toEqual([]);
    expect(loadFoundMargins(undefined)).toEqual([]);
  });

  it("a disconnected find is a silent no-op rather than a throw", () => {
    expect(() => markMarginFound(undefined, "m-01")).not.toThrow();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("tolerates corrupt JSON", () => {
    window.localStorage.setItem(KEY, "{not json");
    expect(loadFoundMargins(A)).toEqual([]);
    // And recovers: the next write replaces the garbage.
    markMarginFound(A, "m-01");
    expect(loadFoundMargins(A)).toEqual(["m-01"]);
  });

  it("tolerates a structurally wrong payload", () => {
    // An array where an object belongs, e.g. from a prior key's shape.
    window.localStorage.setItem(KEY, JSON.stringify(["m-01"]));
    expect(loadFoundMargins(A)).toEqual([]);
  });

  it("tolerates a non-array entry for a player", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ [A.toLowerCase()]: "m-01" }));
    expect(loadFoundMargins(A)).toEqual([]);
  });

  it("filters non-string ids rather than handing them to the renderer", () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ [A.toLowerCase()]: ["m-01", 42, null, "s-02"] }),
    );
    expect(loadFoundMargins(A)).toEqual(["m-01", "s-02"]);
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
    expect(() => markMarginFound(A, "m-01")).not.toThrow();
    expect(() => loadFoundMargins(A)).not.toThrow();
    expect(loadFoundMargins(A)).toEqual([]);
  });
});
