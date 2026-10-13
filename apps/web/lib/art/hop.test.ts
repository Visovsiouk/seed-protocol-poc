import { describe, expect, it } from "vitest";
import { hopType } from "./hop";
import { itemSpec } from "./item";
import { weaponLane, armorLane } from "./archetypes";
import {
  armorTypesFor,
  combatArmorTypesFor,
  combatWeaponTypesFor,
  weaponTypesFor,
  type Preset,
} from "@/lib/engine/types";

const PRESETS: readonly Preset[] = ["fantasy", "scifi", "cyberpunk"];

/** Every ordered (from, to) preset pair where a hop actually happens. */
const HOPS: readonly (readonly [Preset, Preset])[] = PRESETS.flatMap((from) =>
  PRESETS.filter((to) => to !== from).map((to) => [from, to] as const),
);

describe("hopType", () => {
  it("preserves the lane across every preset pair", () => {
    // The one property the whole reveal rests on: a hop re-skins an item, it
    // does not re-roll it. If the lane moved, a carried axe could land as a
    // dagger and the "same object, re-made" copy would be a lie.
    for (const [from, to] of HOPS) {
      for (const type of combatWeaponTypesFor(from)) {
        const landed = hopType({ slot: "weapon", weaponType: type }, from, to);
        expect(weaponLane(to, landed)).toBe(weaponLane(from, type));
      }
      for (const type of combatArmorTypesFor(from)) {
        const landed = hopType({ slot: "armor", armorType: type }, from, to);
        expect(armorLane(to, landed)).toBe(armorLane(from, type));
      }
    }
  });

  it("lands on a type the destination realm actually speaks", () => {
    for (const [from, to] of HOPS) {
      for (const type of combatWeaponTypesFor(from)) {
        const landed = hopType({ slot: "weapon", weaponType: type }, from, to);
        expect(weaponTypesFor(to)).toContain(landed);
      }
      for (const type of combatArmorTypesFor(from)) {
        const landed = hopType({ slot: "armor", armorType: type }, from, to);
        expect(armorTypesFor(to)).toContain(landed);
      }
    }
  });

  it("round-trips back to the original archetype", () => {
    // There and back again must be identity, or carrying gear out and home
    // would quietly mutate it.
    for (const [from, to] of HOPS) {
      for (const type of combatWeaponTypesFor(from)) {
        const there = hopType({ slot: "weapon", weaponType: type }, from, to);
        const back = hopType(
          { slot: "weapon", weaponType: there },
          to,
          from,
        );
        expect(back).toBe(type);
      }
    }
  });

  it("is identity when the genre does not change", () => {
    for (const preset of PRESETS) {
      for (const type of combatWeaponTypesFor(preset)) {
        expect(hopType({ slot: "weapon", weaponType: type }, preset, preset)).toBe(
          type,
        );
      }
    }
  });

  it("returns nothing for gear carrying no archetype", () => {
    // An accessory, or gear minted without a type. The caller draws the
    // generic silhouette rather than inventing a lane for it.
    expect(hopType({ slot: "accessory" }, "fantasy", "scifi")).toBeUndefined();
    expect(hopType({ slot: "weapon" }, "fantasy", "scifi")).toBeUndefined();
    expect(hopType({ slot: "armor" }, "fantasy", "scifi")).toBeUndefined();
  });

  it("reads the right field for the slot", () => {
    // A card can carry both fields; picking the wrong one would silently draw
    // an armour lane on a weapon.
    const both = { slot: "weapon", weaponType: "axe", armorType: "robe" };
    expect(hopType(both, "fantasy", "scifi")).toBe(
      hopType({ slot: "weapon", weaponType: "axe" }, "fantasy", "scifi"),
    );
    expect(hopType({ ...both, slot: "armor" }, "fantasy", "scifi")).toBe(
      hopType({ slot: "armor", armorType: "robe" }, "fantasy", "scifi"),
    );
  });
});

describe("the drawn hop", () => {
  it("changes the silhouette while holding tier and element", () => {
    // What the player is meant to actually see: the shape speaks the local
    // language, the rarity marks and the element hue do not move.
    for (const [from, to] of HOPS) {
      for (const type of combatWeaponTypesFor(from)) {
        const landed = hopType({ slot: "weapon", weaponType: type }, from, to)!;
        const common = {
          slot: "weapon",
          tier: 4,
          element: "fire",
          effectCount: 2,
          identity: "0xrealm:4242",
        } as const;
        const source = itemSpec({ ...common, preset: from, type });
        const target = itemSpec({ ...common, preset: to, type: landed });

        // Invariant across the hop: rarity marks, and an element mote whose
        // size is tier-driven. Its *position* is the silhouette's business
        // and is expected to move with the shape.
        expect(target.ornaments.length).toBe(source.ornaments.length);
        expect(target.mote !== null).toBe(source.mote !== null);
        expect(target.mote?.r).toBe(source.mote?.r);
        // Tilt is keyed on identity alone, so the item doesn't lurch.
        expect(target.tilt).toBe(source.tilt);

        // Variant across the hop — otherwise the reveal shows nothing.
        expect(JSON.stringify(target.base.shapes)).not.toBe(
          JSON.stringify(source.base.shapes),
        );
      }
    }
  });
});
