import { describe, expect, it } from "vitest";
import { createRng } from "./rng";
import {
  ARMOR_EFFECTS,
  WEAPON_EFFECTS,
  applyCatalogEffects,
  getActiveEffectValue,
  getEffectSpec,
  rollEffectValue,
} from "./catalog";
import type { AssetCard, CatalogEffectName, CombatState, MonsterDef } from "./types";

const SEED =
  "0x1111111111111111111111111111111111111111111111111111111111111111";

const dummyMonster: MonsterDef = {
  id: "dummy",
  name: "Dummy",
  hp: 30,
  attackDie: 6,
  ac: 12,
  attackVerbs: ["lunges at you"],
};

function makeCombatState(overrides: Partial<CombatState> = {}): CombatState {
  return {
    playerHp: 20,
    playerMaxHp: 20,
    playerAc: 10,
    monster: dummyMonster,
    monsterHp: 30,
    bracedThisTurn: false,
    guaranteedDodgeThisTurn: false,
    regenDoubledThisTurn: false,
    thornsDoubledThisTurn: false,
    focusPrimed: false,
    phase2PlayerBuffed: false,
    bleedStacks: 0,
    suppressedEffects: [],
    turn: 0,
    ...overrides,
  };
}

function makeCard(
  slot: "weapon" | "armor",
  effects: { name: CatalogEffectName; value: number }[],
): AssetCard {
  return {
    tokenId: 1n,
    schemaId: 1,
    realm: "0x0000000000000000000000000000000000000000",
    realmName: "Test",
    slot,
    tier: 3,
    name: slot === "weapon" ? "Test Blade" : "Test Mail",
    catalogEffects: effects,
    extraFields: {},
    metadataURI: "data:",
    preseed: false,
  };
}

describe("getEffectSpec", () => {
  it("resolves weapon-slot effects via WEAPON_EFFECTS", () => {
    expect(getEffectSpec("lifesteal")?.slot).toBe("weapon");
    expect(getEffectSpec("armor_pierce")?.slot).toBe("weapon");
    expect(getEffectSpec("crit_chance")?.slot).toBe("weapon");
    expect(getEffectSpec("multi_hit")?.slot).toBe("weapon");
    expect(getEffectSpec("bleed")?.slot).toBe("weapon");
  });

  it("resolves armor-slot effects via ARMOR_EFFECTS", () => {
    expect(getEffectSpec("regen")?.slot).toBe("armor");
    expect(getEffectSpec("thorns")?.slot).toBe("armor");
    expect(getEffectSpec("dodge_chance")?.slot).toBe("armor");
    expect(getEffectSpec("damage_reduction")?.slot).toBe("armor");
  });

  it("publishes a hook for every effect", () => {
    const names: CatalogEffectName[] = [
      "lifesteal", "armor_pierce", "crit_chance", "multi_hit", "bleed",
      "regen", "thorns", "dodge_chance", "damage_reduction",
    ];
    for (const n of names) {
      const spec = getEffectSpec(n);
      expect(spec, n).toBeDefined();
      expect(["preTurn", "onHit", "onIncoming", "postTurn"]).toContain(spec!.hook);
    }
  });
});

describe("rollEffectValue", () => {
  it("stays in the per-tier range for variable effects", () => {
    const rng = createRng(SEED);
    for (let i = 0; i < 1000; i++) {
      const v = rollEffectValue(rng, "lifesteal", 3);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(3);
    }
  });

  it("respects the cap at T5 across all variable effects", () => {
    const rng = createRng(SEED);
    const variable: CatalogEffectName[] = [
      "lifesteal", "crit_chance", "multi_hit", "bleed",
      "regen", "thorns", "dodge_chance", "damage_reduction",
    ];
    for (const n of variable) {
      for (let i = 0; i < 200; i++) {
        const v = rollEffectValue(rng, n, 5);
        expect(v, n).toBeLessThanOrEqual(getEffectSpec(n)!.cap);
      }
    }
  });

  it("returns 1 for Bool effects (armor_pierce)", () => {
    const rng = createRng(SEED);
    for (let i = 0; i < 50; i++) {
      expect(rollEffectValue(rng, "armor_pierce", 1)).toBe(1);
      expect(rollEffectValue(rng, "armor_pierce", 5)).toBe(1);
    }
  });

  it("higher tier ≥ lower tier on average for lifesteal", () => {
    const rng = createRng(SEED);
    let lowSum = 0;
    let highSum = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) lowSum += rollEffectValue(rng, "lifesteal", 1);
    for (let i = 0; i < N; i++) highSum += rollEffectValue(rng, "lifesteal", 5);
    expect(highSum).toBeGreaterThan(lowSum);
  });
});

describe("applyCatalogEffects — preTurn regen", () => {
  it("heals up to the per-turn amount, never above playerMaxHp", () => {
    const state = makeCombatState({ playerHp: 15, playerMaxHp: 20 });
    const equipped = { armor: makeCard("armor", [{ name: "regen", value: 3 }]) };
    const { state: next, notes } = applyCatalogEffects(state, equipped, "preTurn");
    expect(next.playerHp).toBe(18);
    expect(notes).toEqual([{ kind: "regen", amount: 3 }]);
  });

  it("caps healing at playerMaxHp", () => {
    const state = makeCombatState({ playerHp: 19, playerMaxHp: 20 });
    const equipped = { armor: makeCard("armor", [{ name: "regen", value: 5 }]) };
    const { state: next, notes } = applyCatalogEffects(state, equipped, "preTurn");
    expect(next.playerHp).toBe(20);
    expect(notes[0]?.amount).toBe(1);
  });

  it("does not heal a dead player", () => {
    const state = makeCombatState({ playerHp: 0 });
    const equipped = { armor: makeCard("armor", [{ name: "regen", value: 3 }]) };
    const { state: next } = applyCatalogEffects(state, equipped, "preTurn");
    expect(next.playerHp).toBe(0);
  });

  it("suppression skips the effect", () => {
    const state = makeCombatState({
      playerHp: 15,
      suppressedEffects: ["regen"],
    });
    const equipped = { armor: makeCard("armor", [{ name: "regen", value: 3 }]) };
    const { state: next, notes } = applyCatalogEffects(state, equipped, "preTurn");
    expect(next.playerHp).toBe(15);
    expect(notes).toEqual([]);
  });

  it("does not double-heal when called on a non-matching hook", () => {
    const state = makeCombatState({ playerHp: 15 });
    const equipped = { armor: makeCard("armor", [{ name: "regen", value: 3 }]) };
    const { state: next } = applyCatalogEffects(state, equipped, "postTurn");
    expect(next.playerHp).toBe(15);
  });
});

describe("applyCatalogEffects — postTurn bleed tick", () => {
  it("damages the monster and decrements the stack", () => {
    const state = makeCombatState({ monsterHp: 30, bleedStacks: 2 });
    const equipped = { weapon: makeCard("weapon", [{ name: "bleed", value: 3 }]) };
    const { state: next, notes } = applyCatalogEffects(state, equipped, "postTurn");
    expect(next.monsterHp).toBe(27);
    expect(next.bleedStacks).toBe(1);
    expect(notes).toEqual([{ kind: "bleed_tick", amount: 3 }]);
  });

  it("does not go below zero monsterHp", () => {
    const state = makeCombatState({ monsterHp: 2, bleedStacks: 1 });
    const equipped = { weapon: makeCard("weapon", [{ name: "bleed", value: 5 }]) };
    const { state: next } = applyCatalogEffects(state, equipped, "postTurn");
    expect(next.monsterHp).toBe(0);
  });

  it("is a no-op when bleedStacks is zero", () => {
    const state = makeCombatState({ monsterHp: 30, bleedStacks: 0 });
    const equipped = { weapon: makeCard("weapon", [{ name: "bleed", value: 3 }]) };
    const { state: next, notes } = applyCatalogEffects(state, equipped, "postTurn");
    expect(next.monsterHp).toBe(30);
    expect(notes).toEqual([]);
  });
});

describe("getActiveEffectValue", () => {
  const state = makeCombatState();
  const equipped = {
    weapon: makeCard("weapon", [{ name: "lifesteal", value: 4 }]),
    armor: makeCard("armor", [{ name: "thorns", value: 3 }]),
  };

  it("returns the rolled value when present", () => {
    expect(getActiveEffectValue(state, equipped, "lifesteal")).toBe(4);
    expect(getActiveEffectValue(state, equipped, "thorns")).toBe(3);
  });

  it("returns 0 when not present", () => {
    expect(getActiveEffectValue(state, equipped, "bleed")).toBe(0);
    expect(getActiveEffectValue(state, equipped, "regen")).toBe(0);
  });

  it("returns 0 when suppressed", () => {
    const suppressed = { ...state, suppressedEffects: ["lifesteal" as const] };
    expect(getActiveEffectValue(suppressed, equipped, "lifesteal")).toBe(0);
  });
});

describe("catalog tables — sanity", () => {
  it("WEAPON_EFFECTS has exactly 5 defined entries", () => {
    const defined = Object.values(WEAPON_EFFECTS).filter((v) => v !== undefined);
    expect(defined.length).toBe(5);
  });

  it("ARMOR_EFFECTS has exactly 4 defined entries", () => {
    const defined = Object.values(ARMOR_EFFECTS).filter((v) => v !== undefined);
    expect(defined.length).toBe(4);
  });

  it("no name appears in both weapon and armor", () => {
    for (const [name, spec] of Object.entries(WEAPON_EFFECTS)) {
      if (spec) expect(ARMOR_EFFECTS[name as CatalogEffectName]).toBeUndefined();
    }
  });
});
