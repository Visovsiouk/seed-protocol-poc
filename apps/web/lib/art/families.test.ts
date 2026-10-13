import { describe, expect, it } from "vitest";
import type { Preset } from "@/lib/engine/types";
import { getFlavorBank } from "@/lib/flavor";
import { FAMILIES, familyFor, isTagged } from "./families";

const PRESETS: readonly Preset[] = ["fantasy", "scifi", "cyberpunk"];

/** Every roster id across all three banks, monsters and bosses alike. */
function rosterIds(preset: Preset): string[] {
  const bank = getFlavorBank(preset);
  return [...Object.keys(bank.monsters), ...Object.keys(bank.bosses)];
}

describe("familyFor", () => {
  it("tags every monster and boss in every bank", () => {
    // The guard against a new roster entry shipping untagged: a fresh monster
    // would silently fall back to a hash family, which looks arbitrary next to
    // its deliberately-tagged neighbours.
    const untagged: string[] = [];
    for (const preset of PRESETS) {
      for (const id of rosterIds(preset)) {
        if (!isTagged(preset, id)) untagged.push(`${preset}:${id}`);
      }
    }
    expect(untagged).toEqual([]);
  });

  it("returns a known family for every roster id", () => {
    for (const preset of PRESETS) {
      for (const id of rosterIds(preset)) {
        expect(FAMILIES).toContain(familyFor(preset, id));
      }
    }
  });

  it("covers the whole roster — 36 monsters and 15 bosses", () => {
    const monsters = PRESETS.reduce(
      (n, p) => n + Object.keys(getFlavorBank(p).monsters).length,
      0,
    );
    const bosses = PRESETS.reduce(
      (n, p) => n + Object.keys(getFlavorBank(p).bosses).length,
      0,
    );
    expect({ monsters, bosses }).toEqual({ monsters: 36, bosses: 15 });
  });

  it("never leaves an unknown id without a family", () => {
    // The player-deployed-realm guarantee: a boss id we have never seen must
    // still get a stable, valid family rather than an empty frame.
    for (let i = 0; i < 500; i++) {
      for (const preset of PRESETS) {
        const family = familyFor(preset, `unknown_boss_${i}`);
        expect(FAMILIES).toContain(family);
      }
    }
  });

  it("is stable for an unknown id across calls", () => {
    const once = familyFor("fantasy", "someones_custom_warden");
    for (let i = 0; i < 50; i++) {
      expect(familyFor("fantasy", "someones_custom_warden")).toBe(once);
    }
  });

  it("spreads unknown ids across more than one family", () => {
    // A fallback that collapsed every unknown entity onto `humanoid` would be
    // stable but useless — player realms would all look identical.
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      seen.add(familyFor("scifi", `generated_${i}`));
    }
    expect(seen.size).toBeGreaterThan(3);
  });

  it("distinguishes the same id across presets", () => {
    // `warden` is a fantasy boss; the scifi/cyberpunk banks have no such id,
    // so those two go through the hash path keyed on preset.
    const tagged = familyFor("fantasy", "warden");
    expect(tagged).toBe("hulk");
    expect(FAMILIES).toContain(familyFor("scifi", "warden"));
  });

  it("gives each authored family at least one roster member", () => {
    // If a family has no members it is dead code in the renderer.
    const used = new Set<string>();
    for (const preset of PRESETS) {
      for (const id of rosterIds(preset)) used.add(familyFor(preset, id));
    }
    expect([...FAMILIES].filter((f) => !used.has(f))).toEqual([]);
  });
});
