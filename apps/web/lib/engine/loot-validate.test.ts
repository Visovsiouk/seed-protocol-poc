import { describe, expect, it } from "vitest";
import { validateLootRoll } from "./loot-validate";
import type { LootRoll } from "./types";

function weaponT1(): LootRoll {
  return {
    tier: 1,
    slot: "weapon",
    schemaId: 101,
    damageDie: 4,
    attackBonus: 0,
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
  it("accepts canonical T1 weapon at depth 1", () => {
    expect(validateLootRoll(weaponT1(), 1, false)).toBeNull();
  });

  it("accepts canonical T2 armor at depth 3", () => {
    expect(validateLootRoll(armorT2(), 3, false)).toBeNull();
  });

  it("rejects T5 weapon at depth 1 (trivial difficulty)", () => {
    const l = { ...weaponT1(), tier: 5 as const, damageDie: 12 as const, attackBonus: 4 };
    expect(validateLootRoll(l, 1, false)).toMatch(/tier 5 cannot drop/);
  });

  it("rejects weapon with mismatched damageDie", () => {
    const l = { ...weaponT1(), damageDie: 12 as const };
    expect(validateLootRoll(l, 1, false)).toMatch(/damageDie/);
  });

  it("rejects armor with weapon-slot fields", () => {
    const l = { ...armorT2(), damageDie: 6 as const };
    expect(validateLootRoll(l, 3, false)).toMatch(/weapon-slot fields/);
  });

  it("rejects catalog effect value out of tier range", () => {
    const l: LootRoll = {
      ...weaponT1(),
      catalogEffects: [{ name: "crit_chance", value: 50 }],
    };
    expect(validateLootRoll(l, 1, false)).toMatch(/crit_chance.*outside tier 1 range/);
  });

  it("rejects armor-slot effect on weapon", () => {
    const l: LootRoll = {
      ...weaponT1(),
      catalogEffects: [{ name: "regen", value: 1 }],
    };
    expect(validateLootRoll(l, 1, false)).toMatch(/not valid for slot weapon/);
  });

  it("rejects bool effect with non-1 value", () => {
    const l: LootRoll = {
      ...weaponT1(),
      catalogEffects: [{ name: "armor_pierce", value: 3 }],
    };
    expect(validateLootRoll(l, 1, false)).toMatch(/bool effect/);
  });

  it("accepts T3 weapon at boss depth", () => {
    const l: LootRoll = {
      ...weaponT1(),
      tier: 3,
      damageDie: 8,
      attackBonus: 2,
    };
    expect(validateLootRoll(l, 6, true)).toBeNull();
  });

  it("rejects T1 at boss depth (boss distribution starts at T2)", () => {
    expect(validateLootRoll(weaponT1(), 6, true)).toMatch(/tier 1 cannot drop/);
  });
});
