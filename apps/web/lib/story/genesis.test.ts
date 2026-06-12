import { describe, expect, it } from "vitest";
import { pilgrimsBrand } from "./genesis";

describe("pilgrimsBrand", () => {
  it("is deterministic: same rngPick yields the same name + narration", () => {
    const a = pilgrimsBrand(12345);
    const b = pilgrimsBrand(12345);
    expect(a).toEqual(b);
  });

  it("returns a non-empty name and narration", () => {
    const { name, narration } = pilgrimsBrand(7);
    expect(name).toMatch(/.+/);
    expect(narration).toMatch(/.+/);
  });

  it("name and narration draw off different bits of the seed", () => {
    // The narration is selected from `rngPick >>> 8`, so two picks that
    // share a low byte (same name) can still diverge on the narration.
    const a = pilgrimsBrand(0x00);
    const b = pilgrimsBrand(0x100);
    expect(a.name).toBe(b.name);
    expect(a.narration).not.toBe(b.narration);
  });
});
