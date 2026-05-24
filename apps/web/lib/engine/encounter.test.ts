import { describe, expect, it } from "vitest";
import { createRng } from "./rng";
import {
  pickArchetype,
  pickMonster,
  planTrial,
  resolveTrial,
  trialBonusFor,
} from "./encounter";
import type {
  AssetCard,
  CatalogEffectName,
  MonsterDef,
  RoomTemplate,
} from "./types";

const seedHex = (i: number) => ("0x" + i.toString(16).padStart(64, "0")) as `0x${string}`;

const goblin: MonsterDef = { id: "gob", name: "Goblin", hp: 8, attackDie: 4, ac: 12, attackVerbs: ["x"] };
const wolf: MonsterDef = { id: "wolf", name: "Wolf", hp: 12, attackDie: 6, ac: 12, attackVerbs: ["x"] };
const ogre: MonsterDef = { id: "ogre", name: "Ogre", hp: 24, attackDie: 8, ac: 13, attackVerbs: ["x"] };
const monsters = { gob: goblin, wolf, ogre };

function room(depth: number, pool: string[]): RoomTemplate {
  return { id: `r-${depth}`, depth, archetype: "combat", narrationKey: "k", monsterPool: pool };
}

function armor(
  catalog: { name: CatalogEffectName; value: number }[] = [],
  opts: { hpBonus?: number; acBonus?: number } = {},
): AssetCard {
  return {
    tokenId: 1n,
    schemaId: 1,
    realm: "0x0000000000000000000000000000000000000000",
    realmName: "Test",
    slot: "armor",
    tier: 3,
    name: "Mail",
    acBonus: opts.acBonus ?? 0,
    hpBonus: opts.hpBonus ?? 0,
    catalogEffects: catalog,
    extraFields: {},
    metadataURI: "data:",
    preseed: false,
  };
}

describe("pickArchetype", () => {
  // Full-HP context: rest is never eligible (would heal 0), so the base
  // 80/20 split holds at every depth.
  const fullHpCtx = { depth: 2, hp: 30, maxHp: 30 };
  // Chipped context, depth ≥ 3: rest carve-out activates (60/20/20).
  const chippedCtx = { depth: 3, hp: 15, maxHp: 30 };

  it("distribution ≈ 80/20 combat/trial at full HP", () => {
    const counts: Record<string, number> = { combat: 0, trial: 0, rest: 0 };
    for (let i = 1; i <= 5000; i++) {
      const a = pickArchetype(createRng(seedHex(i)), fullHpCtx);
      counts[a] = (counts[a] ?? 0) + 1;
    }
    expect(counts.combat!).toBeGreaterThan(5000 * 0.76);
    expect(counts.combat!).toBeLessThan(5000 * 0.84);
    expect(counts.trial!).toBeGreaterThan(5000 * 0.16);
    expect(counts.trial!).toBeLessThan(5000 * 0.24);
    expect(counts.rest!).toBe(0);
  });

  it("distribution ≈ 60/20/20 when chipped past depth 2", () => {
    const counts: Record<string, number> = { combat: 0, trial: 0, rest: 0 };
    for (let i = 1; i <= 5000; i++) {
      const a = pickArchetype(createRng(seedHex(i)), chippedCtx);
      counts[a] = (counts[a] ?? 0) + 1;
    }
    expect(counts.combat!).toBeGreaterThan(5000 * 0.56);
    expect(counts.combat!).toBeLessThan(5000 * 0.64);
    expect(counts.trial!).toBeGreaterThan(5000 * 0.16);
    expect(counts.trial!).toBeLessThan(5000 * 0.24);
    expect(counts.rest!).toBeGreaterThan(5000 * 0.16);
    expect(counts.rest!).toBeLessThan(5000 * 0.24);
  });

  it("no rest at depth 2 even when chipped", () => {
    const ctx = { depth: 2, hp: 5, maxHp: 30 };
    for (let i = 1; i <= 1000; i++) {
      const a = pickArchetype(createRng(seedHex(i)), ctx);
      expect(a).not.toBe("rest");
    }
  });

  it("never returns ledger (caller forces those)", () => {
    for (let i = 1; i <= 1000; i++) {
      const a = pickArchetype(createRng(seedHex(i)), fullHpCtx);
      expect(a).not.toBe("ledger");
    }
  });
});

describe("pickMonster", () => {
  it("favors weak monsters at depth 1", () => {
    const r = room(1, ["gob", "wolf", "ogre"]);
    const counts = { gob: 0, wolf: 0, ogre: 0 };
    for (let i = 1; i <= 1000; i++) {
      const m = pickMonster(createRng(seedHex(i)), r, monsters);
      counts[m.id as keyof typeof counts]++;
    }
    expect(counts.gob).toBeGreaterThan(counts.wolf);
    expect(counts.wolf).toBeGreaterThan(counts.ogre);
  });

  it("favors strong monsters at depth 5", () => {
    const r = room(5, ["gob", "wolf", "ogre"]);
    const counts = { gob: 0, wolf: 0, ogre: 0 };
    for (let i = 1; i <= 1000; i++) {
      const m = pickMonster(createRng(seedHex(i)), r, monsters);
      counts[m.id as keyof typeof counts]++;
    }
    expect(counts.ogre).toBeGreaterThan(counts.gob);
  });

  it("throws on empty pool", () => {
    expect(() => pickMonster(createRng(seedHex(1)), room(1, []), monsters)).toThrow(/no monsterPool/);
  });

  it("throws on unknown monster id", () => {
    expect(() => pickMonster(createRng(seedHex(1)), room(1, ["dragon"]), monsters)).toThrow(/unknown monster/);
  });
});

describe("trialBonusFor", () => {
  it("agility bonus = ceil(dodge_chance / 10)", () => {
    const equipped = { armor: armor([{ name: "dodge_chance", value: 25 }]) };
    expect(trialBonusFor("agility", equipped)).toBe(3);
  });

  it("agility bonus is 0 without dodge_chance", () => {
    const equipped = { armor: armor([{ name: "regen", value: 4 }]) };
    expect(trialBonusFor("agility", equipped)).toBe(0);
  });

  it("endurance bonus combines damage_reduction and hpBonus", () => {
    // DR=4 → ceil(4/2)=2; hpBonus=25 → ceil(25/10)=3 → total 5
    const equipped = {
      armor: armor([{ name: "damage_reduction", value: 4 }], { hpBonus: 25 }),
    };
    expect(trialBonusFor("endurance", equipped)).toBe(5);
  });

  it("endurance bonus is 0 with no DR and no hpBonus", () => {
    const equipped = { armor: armor([{ name: "dodge_chance", value: 20 }]) };
    expect(trialBonusFor("endurance", equipped)).toBe(0);
  });

  it("returns 0 when no armor equipped", () => {
    expect(trialBonusFor("agility", {})).toBe(0);
    expect(trialBonusFor("endurance", {})).toBe(0);
  });
});

describe("planTrial", () => {
  it("DC scales as 8 + depth", () => {
    expect(planTrial("agility", {}, 1).dc).toBe(9);
    expect(planTrial("agility", {}, 3).dc).toBe(11);
    expect(planTrial("endurance", {}, 5).dc).toBe(13);
  });

  it("echoes the ability the caller asked for", () => {
    expect(planTrial("agility", {}, 3).ability).toBe("agility");
    expect(planTrial("endurance", {}, 3).ability).toBe("endurance");
  });

  it("bonus matches trialBonusFor for the supplied ability", () => {
    const equipped = {
      armor: armor([{ name: "dodge_chance", value: 30 }, { name: "damage_reduction", value: 2 }]),
    };
    expect(planTrial("agility", equipped, 4).bonus).toBe(trialBonusFor("agility", equipped));
    expect(planTrial("endurance", equipped, 4).bonus).toBe(trialBonusFor("endurance", equipped));
  });
});

describe("resolveTrial", () => {
  it("success when d20 + bonus >= dc; heal>0 fail-damage=0", () => {
    // Bonus high enough to always clear DC 11.
    let successes = 0;
    let healSum = 0;
    for (let i = 1; i <= 200; i++) {
      const r = resolveTrial(createRng(seedHex(i)), { ability: "agility", dc: 11, bonus: 20 }, 3);
      if (r.success) {
        successes++;
        healSum += r.healOnSuccess;
        expect(r.damageOnFail).toBe(0);
      }
    }
    expect(successes).toBe(200);
    // healOnSuccess = 1 + floor(3/3) = 2
    expect(healSum).toBe(200 * 2);
  });

  it("failure when d20 + bonus < dc; damage>0 heal=0", () => {
    let failures = 0;
    for (let i = 1; i <= 200; i++) {
      const r = resolveTrial(createRng(seedHex(i)), { ability: "endurance", dc: 30, bonus: 0 }, 5);
      if (!r.success) {
        failures++;
        expect(r.healOnSuccess).toBe(0);
        // damageOnFail = 3 + 5 = 8
        expect(r.damageOnFail).toBe(8);
      }
    }
    expect(failures).toBe(200);
  });

  it("failure damage exceeds success heal at the same depth", () => {
    // The asymmetry is the design — fail should sting more than pass rewards.
    const fail = resolveTrial(createRng(seedHex(1)), { ability: "agility", dc: 99, bonus: 0 }, 3);
    const pass = resolveTrial(createRng(seedHex(1)), { ability: "agility", dc: 0, bonus: 0 }, 3);
    expect(fail.damageOnFail).toBeGreaterThan(pass.healOnSuccess);
  });

  it("total = dieRoll + bonus", () => {
    for (let i = 1; i <= 50; i++) {
      const r = resolveTrial(createRng(seedHex(i)), { ability: "agility", dc: 11, bonus: 4 }, 3);
      expect(r.total).toBe(r.dieRoll + 4);
      expect(r.dieRoll).toBeGreaterThanOrEqual(1);
      expect(r.dieRoll).toBeLessThanOrEqual(20);
    }
  });
});

