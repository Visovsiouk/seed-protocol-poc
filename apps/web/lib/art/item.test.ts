import { describe, expect, it, vi } from "vitest";
import {
  combatArmorTypesFor,
  combatWeaponTypesFor,
  type Preset,
} from "@/lib/engine/types";
import { armorLane, silhouetteFor, weaponLane } from "./archetypes";
import { __clearItemCache, itemSpec, type ItemSpecInput } from "./item";
import { FIELD } from "./seed";

const PRESETS: readonly Preset[] = ["fantasy", "scifi", "cyberpunk"];

function input(over: Partial<ItemSpecInput> = {}): ItemSpecInput {
  return {
    preset: "fantasy",
    slot: "weapon",
    type: "sword",
    tier: 3,
    element: "fire",
    effectCount: 1,
    identity: "0xrealm:1",
    ...over,
  };
}

/** Every coordinate a spec puts on screen, for field-bounds checking. */
function coords(spec: ReturnType<typeof itemSpec>): number[] {
  const out: number[] = [];
  const shapes = [
    ...spec.base.shapes,
    ...spec.ornaments,
    ...spec.effectTicks,
  ];
  for (const s of shapes) {
    if (s.kind === "circle") out.push(s.cx, s.cy);
    else for (const n of s.d.match(/-?\d+(\.\d+)?/g) ?? []) out.push(Number(n));
  }
  if (spec.mote) out.push(spec.mote.cx, spec.mote.cy);
  return out;
}

describe("lane resolution", () => {
  it("maps each preset's vocabulary onto the same lane ordinals", () => {
    for (let lane = 1; lane <= 5; lane++) {
      for (const preset of PRESETS) {
        const type = combatWeaponTypesFor(preset)[lane - 1]!;
        expect(weaponLane(preset, type)).toBe(lane);
      }
    }
    for (let lane = 1; lane <= 3; lane++) {
      for (const preset of PRESETS) {
        const type = combatArmorTypesFor(preset)[lane - 1]!;
        expect(armorLane(preset, type)).toBe(lane);
      }
    }
  });

  it("treats missing and unknown archetypes as lane 0", () => {
    expect(weaponLane("fantasy", undefined)).toBe(0);
    expect(weaponLane("fantasy", "none")).toBe(0);
    expect(weaponLane("fantasy", "trebuchet")).toBe(0);
    expect(armorLane("scifi", "poncho")).toBe(0);
  });

  it("is case-insensitive", () => {
    expect(weaponLane("cyberpunk", "KATANA")).toBe(3);
  });

  it("gives every lane in every preset a non-empty silhouette", () => {
    for (const preset of PRESETS) {
      for (const type of combatWeaponTypesFor(preset)) {
        expect(silhouetteFor(preset, "weapon", type).shapes.length).toBeGreaterThan(0);
      }
      for (const type of combatArmorTypesFor(preset)) {
        expect(silhouetteFor(preset, "armor", type).shapes.length).toBeGreaterThan(0);
      }
    }
  });

  it("falls back to a drawable shape for un-archetyped gear", () => {
    // Story objects and legacy loot carry no type — they must still draw.
    expect(silhouetteFor("fantasy", "weapon", undefined).shapes.length).toBeGreaterThan(0);
    expect(silhouetteFor("fantasy", "accessory", undefined).shapes.length).toBeGreaterThan(0);
  });

  it("draws each lane differently per preset", () => {
    // If a lane rendered identically across presets, translating an item
    // between realms would be visually invisible — the whole point of §7.
    for (let lane = 1; lane <= 5; lane++) {
      const drawn = PRESETS.map((p) =>
        JSON.stringify(
          silhouetteFor(p, "weapon", combatWeaponTypesFor(p)[lane - 1]!).shapes,
        ),
      );
      expect(new Set(drawn).size).toBe(3);
    }
  });
});

describe("itemSpec", () => {
  it("is deterministic", () => {
    __clearItemCache();
    const a = itemSpec(input());
    __clearItemCache();
    const b = itemSpec(input());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("gives different tokens different jitter", () => {
    const a = itemSpec(input({ identity: "0xrealm:1" }));
    const b = itemSpec(input({ identity: "0xrealm:2" }));
    expect(a.tilt).not.toBe(b.tilt);
  });

  it("puts one ornament per tier", () => {
    for (let tier = 1; tier <= 5; tier++) {
      expect(itemSpec(input({ tier })).ornaments).toHaveLength(tier);
    }
  });

  it("clamps out-of-range tiers rather than throwing", () => {
    expect(itemSpec(input({ tier: 0 })).ornaments).toHaveLength(1);
    expect(itemSpec(input({ tier: 99 })).ornaments).toHaveLength(5);
  });

  it("only shows a mote for elemental gear", () => {
    expect(itemSpec(input({ element: "fire" })).mote).not.toBeNull();
    expect(itemSpec(input({ element: "none" })).mote).toBeNull();
    expect(itemSpec(input({ element: null })).mote).toBeNull();
  });

  it("caps effect ticks at three", () => {
    expect(itemSpec(input({ effectCount: 0 })).effectTicks).toHaveLength(0);
    expect(itemSpec(input({ effectCount: 2 })).effectTicks).toHaveLength(2);
    expect(itemSpec(input({ effectCount: 9 })).effectTicks).toHaveLength(3);
  });

  it("keeps all geometry inside the field", () => {
    // A coordinate outside 0..100 clips out of the viewBox and the glyph
    // silently loses a limb.
    for (const preset of PRESETS) {
      for (const type of combatWeaponTypesFor(preset)) {
        for (let tier = 1; tier <= 5; tier++) {
          const spec = itemSpec(
            input({ preset, type, tier, effectCount: 3, identity: `${preset}:${type}:${tier}` }),
          );
          for (const n of coords(spec)) {
            expect(n).toBeGreaterThanOrEqual(0);
            expect(n).toBeLessThanOrEqual(FIELD);
          }
        }
      }
    }
  });

  it("emits only parseable path data", () => {
    const spec = itemSpec(input({ effectCount: 3 }));
    for (const s of [...spec.base.shapes, ...spec.effectTicks]) {
      if (s.kind === "path") expect(s.d).toMatch(/^[MLCQAZHVmlcqazhv0-9 .,-]+$/);
    }
  });

  it("never carries a colour — specs are geometry only", () => {
    // Colour is resolved at render time through palette.ts so the art themes
    // itself. A hex leaking into a spec would freeze it to one palette.
    const json = JSON.stringify(itemSpec(input({ effectCount: 3 })));
    expect(json).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(json).not.toMatch(/var\(|color-mix\(/);
  });

  it("does not touch Math.random or Date.now", () => {
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("nondeterminism on the render path");
    });
    const now = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("nondeterminism on the render path");
    });
    try {
      __clearItemCache();
      expect(() => itemSpec(input({ identity: "ssr:safe" }))).not.toThrow();
    } finally {
      random.mockRestore();
      now.mockRestore();
    }
  });
});

describe("cross-realm translation", () => {
  it("keeps tier and element while changing the silhouette", () => {
    // The protocol's thesis, drawn: one token carried between realms keeps
    // its rarity and its element but speaks the local archetype language.
    const specs = PRESETS.map((preset) =>
      itemSpec(
        input({
          preset,
          // Same lane (mid) in each preset's own vocabulary.
          type: combatWeaponTypesFor(preset)[2]!,
          tier: 4,
          element: "fire",
          identity: "0xrealm:4242",
        }),
      ),
    );

    // Invariant across the hop.
    const ornamentCounts = specs.map((s) => s.ornaments.length);
    expect(new Set(ornamentCounts)).toEqual(new Set([4]));
    expect(specs.every((s) => s.mote !== null)).toBe(true);

    // Variant across the hop.
    const silhouettes = specs.map((s) => JSON.stringify(s.base.shapes));
    expect(new Set(silhouettes).size).toBe(3);
  });

  it("keeps the same token's tilt stable across realms", () => {
    // Tilt is keyed on identity alone, so an item doesn't visibly lurch when
    // the adapter re-skins it.
    const tilts = PRESETS.map(
      (preset) =>
        itemSpec(
          input({ preset, type: combatWeaponTypesFor(preset)[0]!, identity: "0xrealm:7" }),
        ).tilt,
    );
    expect(new Set(tilts).size).toBe(1);
  });
});
