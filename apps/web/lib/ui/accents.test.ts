import { describe, it, expect } from "vitest";
import { REALM_ACCENTS, isAllowedAccent } from "./accents";

describe("realm accent allow-list", () => {
  it("accepts every curated swatch", () => {
    for (const sw of REALM_ACCENTS) {
      expect(isAllowedAccent(sw.hex)).toBe(true);
    }
  });

  it("rejects accents outside the curated set", () => {
    // Arbitrary colours a crafted POST might try to inject.
    expect(isAllowedAccent("#000000")).toBe(false);
    expect(isAllowedAccent("#ffffff")).toBe(false);
    expect(isAllowedAccent("#123456")).toBe(false);
  });

  it("is case- and format-strict (guards the CSS-var injection boundary)", () => {
    const gold = REALM_ACCENTS[0]!.hex;
    expect(gold).toBe(gold.toLowerCase());
    // Uppercase variant of a valid swatch must not slip through, since the
    // server stores the value verbatim into `--color-preset-accent`.
    expect(isAllowedAccent(gold.toUpperCase())).toBe(false);
    // Anything that isn't a bare 6-digit hex must be rejected outright —
    // no `var(...)`, no trailing junk, no shorthand.
    expect(isAllowedAccent("")).toBe(false);
    expect(isAllowedAccent(`${gold};color:red`)).toBe(false);
    expect(isAllowedAccent("red")).toBe(false);
  });

  it("has a non-empty, well-formed, unique swatch set", () => {
    expect(REALM_ACCENTS.length).toBeGreaterThan(0);
    for (const sw of REALM_ACCENTS) {
      expect(sw.hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(sw.label.length).toBeGreaterThan(0);
    }
    const hexes = REALM_ACCENTS.map((s) => s.hex);
    expect(new Set(hexes).size).toBe(hexes.length);
  });
});
