import { describe, expect, it } from "vitest";
import { getBossIntel, matchAgainstBoss, translateElement } from "./boss-intel";

describe("getBossIntel", () => {
  it("reads a fantasy boss's weakness from the flavor bank", () => {
    const intel = getBossIntel("fantasy", "lich");
    expect(intel).not.toBeNull();
    expect(intel!.bossName).toBe("The Lich");
    expect(intel!.weakTo).toBe("holy");
    expect(intel!.resistTo).toBe("unholy");
  });

  it("handles bosses without a resist", () => {
    const intel = getBossIntel("fantasy", "warden");
    expect(intel!.weakTo).toBe("shock");
    expect(intel!.resistTo).toBeNull();
  });

  it("returns null for an unknown boss id", () => {
    expect(getBossIntel("fantasy", "nonexistent")).toBeNull();
  });
});

describe("translateElement", () => {
  it("maps by index across preset vocabularies (adapter mirror)", () => {
    // fire is index 1 in fantasy → plasma (scifi) → incendiary (cyberpunk)
    expect(translateElement("fire", "fantasy", "scifi")).toBe("plasma");
    expect(translateElement("fire", "fantasy", "cyberpunk")).toBe("incendiary");
    expect(translateElement("emp", "cyberpunk", "fantasy")).toBe("shock");
  });

  it("is identity within a preset and for none", () => {
    expect(translateElement("holy", "fantasy", "fantasy")).toBe("holy");
    expect(translateElement("none", "fantasy", "scifi")).toBe("none");
    expect(translateElement(undefined, "fantasy", "scifi")).toBe("none");
  });

  it("unknown elements degrade to none", () => {
    expect(translateElement("plasma", "fantasy", "scifi")).toBe("none");
  });

  it("round-trips", () => {
    const there = translateElement("holy", "fantasy", "cyberpunk");
    expect(translateElement(there, "cyberpunk", "fantasy")).toBe("holy");
  });
});

describe("matchAgainstBoss", () => {
  const intel = getBossIntel("fantasy", "dragon")!; // weakTo ice, resistTo fire

  it("counter on the weakness", () => {
    expect(matchAgainstBoss("ice", intel)).toBe("counter");
  });
  it("resisted on the resist", () => {
    expect(matchAgainstBoss("fire", intel)).toBe("resisted");
  });
  it("neutral otherwise (including no element)", () => {
    expect(matchAgainstBoss("holy", intel)).toBe("neutral");
    expect(matchAgainstBoss(undefined, intel)).toBe("neutral");
    expect(matchAgainstBoss("none", intel)).toBe("neutral");
  });
});
