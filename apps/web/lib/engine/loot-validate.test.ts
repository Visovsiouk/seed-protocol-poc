import { describe, expect, it } from "vitest";
import { validateLootRoll } from "./loot-validate";
import type { LootRoll } from "./types";

function weaponT2(): LootRoll {
  return {
    tier: 2,
    slot: "weapon",
    schemaId: 101,
    damageDie: 6,
    attackBonus: 1,
    damageBonus: 1,
    catalogEffects: [],
    nameSeed: 0n,
    extraFields: {},
  };
}

function armorT2(): LootRoll {
  return {
    tier: 2,
    slot: "armor",
    schemaId: 102,
    acBonus: 2,
    hpBonus: 10,
    catalogEffects: [],
    nameSeed: 0n,
    extraFields: {},
  };
}

describe("validateLootRoll", () => {
  it("accepts canonical T2 weapon at depth 1 (trivial)", () => {
    expect(validateLootRoll(weaponT2(), 1, false)).toBeNull();
  });

  it("accepts canonical T2 armor at depth 3", () => {
    expect(validateLootRoll(armorT2(), 3, false)).toBeNull();
  });

  it("rejects T5 weapon at depth 1 (trivial difficulty)", () => {
    const l = { ...weaponT2(), tier: 5 as const, damageDie: 12 as const, attackBonus: 4 };
    expect(validateLootRoll(l, 1, false)).toMatch(/tier 5 cannot drop/);
  });

  it("rejects weapon with mismatched damageDie", () => {
    const l = { ...weaponT2(), damageDie: 12 as const };
    expect(validateLootRoll(l, 1, false)).toMatch(/damageDie/);
  });

  it("rejects armor with weapon-slot fields", () => {
    const l = { ...armorT2(), damageDie: 6 as const };
    expect(validateLootRoll(l, 3, false)).toMatch(/weapon-slot fields/);
  });

  it("rejects catalog effect value out of tier range", () => {
    const l: LootRoll = {
      ...weaponT2(),
      catalogEffects: [{ name: "crit_chance", value: 50 }],
    };
    expect(validateLootRoll(l, 1, false)).toMatch(/crit_chance.*outside tier 2 range/);
  });

  it("rejects armor-slot effect on weapon", () => {
    const l: LootRoll = {
      ...weaponT2(),
      catalogEffects: [{ name: "regen", value: 1 }],
    };
    expect(validateLootRoll(l, 1, false)).toMatch(/not valid for slot weapon/);
  });

  it("rejects bool effect with non-1 value", () => {
    const l: LootRoll = {
      ...weaponT2(),
      catalogEffects: [{ name: "armor_pierce", value: 3 }],
    };
    expect(validateLootRoll(l, 1, false)).toMatch(/bool effect/);
  });

  it("accepts T3 weapon at boss depth", () => {
    const l: LootRoll = {
      ...weaponT2(),
      tier: 3,
      damageDie: 8,
      attackBonus: 2,
      damageBonus: 2,
    };
    expect(validateLootRoll(l, 6, true)).toBeNull();
  });

  it("rejects weapon with mismatched damageBonus", () => {
    const l: LootRoll = { ...weaponT2(), damageBonus: 4 };
    expect(validateLootRoll(l, 1, false)).toMatch(/damageBonus 4 != tier 2/);
  });

  it("rejects armor that carries a damageBonus weapon field", () => {
    const l = { ...armorT2(), damageBonus: 1 } as unknown as LootRoll;
    expect(validateLootRoll(l, 3, false)).toMatch(/weapon-slot fields/);
  });

  it("rejects T2 at boss depth (boss distribution starts at T3)", () => {
    expect(validateLootRoll(weaponT2(), 6, true)).toMatch(/tier 2 cannot drop/);
  });

  it("accepts weapon with a valid element", () => {
    const l: LootRoll = { ...weaponT2(), element: "fire" };
    expect(validateLootRoll(l, 1, false)).toBeNull();
  });

  it("accepts weapon with element 'none'", () => {
    const l: LootRoll = { ...weaponT2(), element: "none" };
    expect(validateLootRoll(l, 1, false)).toBeNull();
  });

  it("rejects weapon carrying armor's resistElement field", () => {
    const l: LootRoll = { ...weaponT2(), resistElement: "fire" };
    expect(validateLootRoll(l, 1, false)).toMatch(/resistElement/);
  });

  it("rejects armor carrying weapon's element field", () => {
    const l: LootRoll = { ...armorT2(), element: "fire" };
    expect(validateLootRoll(l, 3, false)).toMatch(/element \(weapon field\)/);
  });

  it("rejects weapon with an unknown element value", () => {
    // Bypass the type system to simulate a forged payload.
    const l = { ...weaponT2(), element: "lava" } as unknown as LootRoll;
    expect(validateLootRoll(l, 1, false)).toMatch(/not a valid Element/);
  });

  it("accepts armor with a valid resistElement", () => {
    const l: LootRoll = { ...armorT2(), resistElement: "ice" };
    expect(validateLootRoll(l, 3, false)).toBeNull();
  });
});
