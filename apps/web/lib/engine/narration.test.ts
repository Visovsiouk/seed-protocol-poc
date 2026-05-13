import { describe, expect, it } from "vitest";
import { createRng } from "./rng";
import { pickVariant, render } from "./narration";

describe("render", () => {
  it("substitutes named vars", () => {
    expect(render("Hello, {name}!", { name: "world" })).toBe("Hello, world!");
  });

  it("coerces numbers to strings", () => {
    expect(render("{n} hits for {dmg}", { n: 2, dmg: 7 })).toBe("2 hits for 7");
  });

  it("leaves unknown vars as-is", () => {
    expect(render("Hi {who}", {})).toBe("Hi {who}");
  });

  it("supports multiple substitutions of the same var", () => {
    expect(render("{x}+{x}={y}", { x: 2, y: 4 })).toBe("2+2=4");
  });

  it("ignores non-word brace contents", () => {
    expect(render("{not a var}", {})).toBe("{not a var}");
  });
});

describe("pickVariant", () => {
  const bank = {
    greetings: ["hi", "hello", "yo"],
    farewells: ["bye"],
    empty: [] as string[],
  };

  it("returns one of the variants", () => {
    const rng = createRng("0x" + "11".repeat(32) as `0x${string}`);
    for (let i = 0; i < 50; i++) {
      expect(bank.greetings).toContain(pickVariant(bank, "greetings", rng));
    }
  });

  it("works for single-entry banks", () => {
    const rng = createRng("0x" + "11".repeat(32) as `0x${string}`);
    expect(pickVariant(bank, "farewells", rng)).toBe("bye");
  });

  it("throws on missing key", () => {
    const rng = createRng("0x" + "11".repeat(32) as `0x${string}`);
    expect(() => pickVariant(bank, "missing", rng)).toThrow(/missing/);
  });

  it("throws on empty variant list", () => {
    const rng = createRng("0x" + "11".repeat(32) as `0x${string}`);
    expect(() => pickVariant(bank, "empty", rng)).toThrow(/empty/);
  });
});
