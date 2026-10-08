import { describe, expect, it } from "vitest";
import { INK, compileSprite, inkedPixels, validateSprite, type Sprite } from "./pixels";
import { spriteFor, spriteIds } from "./sprites";
import type { Preset } from "@/lib/engine/types";

const PRESETS: readonly Preset[] = ["fantasy", "scifi", "cyberpunk"];

function grid(rows: readonly string[]): Sprite {
  return { w: rows[0]!.length, h: rows.length, rows };
}

describe("validateSprite", () => {
  it("accepts a well-formed grid", () => {
    expect(() => validateSprite(grid(["#g.", "g#.", "..."]), "ok")).not.toThrow();
  });

  // The dominant authoring slip: one character short and everything to the
  // right of it shifts up a row. Near-invisible by eye in 32 rows of text.
  it("rejects a ragged row and names it", () => {
    expect(() => validateSprite(grid(["###", "##", "###"]), "ragged")).toThrow(
      /row 1 is 2 chars, expected w=3/,
    );
  });

  it("rejects a row count that disagrees with h", () => {
    expect(() => validateSprite({ w: 2, h: 3, rows: ["##", "##"] }, "short")).toThrow(
      /declared h=3 but has 2 rows/,
    );
  });

  it("rejects an ink character with no colour", () => {
    expect(() => validateSprite(grid(["#?#"]), "bad")).toThrow(/unknown ink '\?'/);
  });

  it("accepts spaces as transparent, same as dots", () => {
    expect(() => validateSprite(grid(["# #", ". ."]), "spaces")).not.toThrow();
  });
});

describe("compileSprite", () => {
  it("merges a horizontal run into one rect", () => {
    const [layer] = compileSprite(grid(["ggg"]));
    expect(layer!.fill).toBe(INK.g);
    expect(layer!.d).toBe("M0 0h3v1h-3z");
  });

  it("breaks a run where the character changes", () => {
    const layers = compileSprite(grid(["gg#"]));
    expect(layers.map((l) => l.d)).toEqual(["M0 0h2v1h-2z", "M2 0h1v1h-1z"]);
  });

  it("gathers every rect of one colour into a single path", () => {
    const layers = compileSprite(grid(["g.g", "g.g"]));
    expect(layers).toHaveLength(1);
    expect(layers[0]!.d).toBe("M0 0h1v1h-1zM2 0h1v1h-1zM0 1h1v1h-1zM2 1h1v1h-1z");
  });

  it("emits nothing for a fully transparent grid", () => {
    expect(compileSprite(grid(["...", "..."]))).toHaveLength(0);
  });

  it("merges characters that share a colour into one layer", () => {
    const sprite: Sprite = { w: 2, h: 1, rows: ["ab"], palette: { a: "#111111", b: "#111111" } };
    expect(compileSprite(sprite)).toHaveLength(1);
  });

  it("is stable across calls", () => {
    const sprite = grid(["#g", "g#"]);
    expect(compileSprite(sprite)).toBe(compileSprite(sprite));
  });
});

describe("the authored bank", () => {
  const all = PRESETS.flatMap((p) =>
    spriteIds(p).map((id) => [p, id, spriteFor(p, id)!] as const),
  );

  it("has at least one authored creature", () => {
    expect(all.length).toBeGreaterThan(0);
  });

  it.each(all)("%s:%s is a well-formed 32x32 grid", (preset, id, sprite) => {
    expect(() => validateSprite(sprite, `${preset}:${id}`)).not.toThrow();
    expect([sprite.w, sprite.h]).toEqual([32, 32]);
  });

  // A grid that validates can still be blank, or so sparse it reads as noise.
  // The floor catches a sprite that was gutted by a bad edit.
  it.each(all)("%s:%s has enough ink to read as a creature", (_preset, _id, sprite) => {
    expect(inkedPixels(sprite)).toBeGreaterThan(120);
  });

  it.each(all)("%s:%s compiles to few paths, not many rects", (_preset, _id, sprite) => {
    const layers = compileSprite(sprite);
    expect(layers.length).toBeGreaterThan(1);
    // One path per colour. If this ever approaches the pixel count, the run
    // merging has regressed and the stage is being handed ~1000 DOM nodes.
    expect(layers.length).toBeLessThanOrEqual(16);
  });

  it("returns null for a creature with no authored art", () => {
    expect(spriteFor("fantasy", "no_such_monster")).toBeNull();
  });
});
