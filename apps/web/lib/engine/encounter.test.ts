import { describe, expect, it } from "vitest";
import { createRng } from "./rng";
import {
  pickArchetype,
  pickCombatChoiceMode,
  pickMonster,
  resolveHazard,
  rollDiscoveryOutcomes,
} from "./encounter";
import type { AssetCard, MonsterDef, RoomTemplate } from "./types";

const seedHex = (i: number) => ("0x" + i.toString(16).padStart(64, "0")) as `0x${string}`;

const goblin: MonsterDef = { id: "gob", name: "Goblin", hp: 8, attackDie: 4, ac: 12, attackVerbs: ["x"] };
const wolf: MonsterDef = { id: "wolf", name: "Wolf", hp: 12, attackDie: 6, ac: 12, attackVerbs: ["x"] };
const ogre: MonsterDef = { id: "ogre", name: "Ogre", hp: 24, attackDie: 8, ac: 13, attackVerbs: ["x"] };
const monsters = { gob: goblin, wolf, ogre };

function room(depth: number, pool: string[]): RoomTemplate {
  return { id: `r-${depth}`, depth, archetype: "combat", narrationKey: "k", monsterPool: pool };
}

function armor(catalog: { name: "dodge_chance" | "regen"; value: number }[]): AssetCard {
  return {
    tokenId: 1n,
    schemaId: 1,
    realm: "0x0000000000000000000000000000000000000000",
    realmName: "Test",
    slot: "armor",
    tier: 3,
    name: "Mail",
    acBonus: 0,
    hpBonus: 0,
    catalogEffects: catalog,
    extraFields: {},
    metadataURI: "data:",
    preseed: false,
  };
}

describe("pickArchetype", () => {
  it("distribution ≈ 70/20/10", () => {
    const counts = { combat: 0, hazard: 0, discovery: 0 };
    for (let i = 1; i <= 5000; i++) {
      const a = pickArchetype(createRng(seedHex(i)));
      counts[a]++;
    }
    expect(counts.combat).toBeGreaterThan(5000 * 0.66);
    expect(counts.combat).toBeLessThan(5000 * 0.74);
    expect(counts.hazard).toBeGreaterThan(5000 * 0.16);
    expect(counts.hazard).toBeLessThan(5000 * 0.24);
    expect(counts.discovery).toBeGreaterThan(5000 * 0.06);
    expect(counts.discovery).toBeLessThan(5000 * 0.14);
  });
});

describe("pickCombatChoiceMode", () => {
  it("tactical fires roughly 1-in-3", () => {
    let tactical = 0;
    for (let i = 1; i <= 5000; i++) {
      if (pickCombatChoiceMode(createRng(seedHex(i))) === "tactical") tactical++;
    }
    expect(tactical / 5000).toBeGreaterThan(0.28);
    expect(tactical / 5000).toBeLessThan(0.38);
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

describe("resolveHazard", () => {
  it("uses dodge_chance from armor when present", () => {
    const equipped = { armor: armor([{ name: "dodge_chance", value: 25 }]) };
    const r = resolveHazard(createRng(seedHex(1)), equipped, 3);
    expect(r.rollChance).toBe(0.25);
  });

  it("falls back to 50% when no dodge effect", () => {
    const equipped = { armor: armor([{ name: "regen", value: 2 }]) };
    const r = resolveHazard(createRng(seedHex(1)), equipped, 3);
    expect(r.rollChance).toBe(0.5);
  });

  it("falls back to 50% when no armor at all", () => {
    const r = resolveHazard(createRng(seedHex(1)), {}, 3);
    expect(r.rollChance).toBe(0.5);
  });

  it("damageOnFail scales with depth", () => {
    expect(resolveHazard(createRng(seedHex(1)), {}, 1).damageOnFail).toBe(2);
    expect(resolveHazard(createRng(seedHex(1)), {}, 5).damageOnFail).toBe(4);
    expect(resolveHazard(createRng(seedHex(1)), {}, 10).damageOnFail).toBe(7);
  });

  it("at 50% flat chance ~half succeed across many seeds", () => {
    let s = 0;
    for (let i = 1; i <= 2000; i++) {
      if (resolveHazard(createRng(seedHex(i)), {}, 3).success) s++;
    }
    expect(s / 2000).toBeGreaterThan(0.45);
    expect(s / 2000).toBeLessThan(0.55);
  });
});

describe("rollDiscoveryOutcomes", () => {
  it("always returns one of each outcome", () => {
    for (let i = 1; i <= 200; i++) {
      const [a, b] = rollDiscoveryOutcomes(createRng(seedHex(i)));
      expect(new Set([a, b])).toEqual(new Set(["refund", "lore"]));
    }
  });

  it("randomizes the mapping ~50/50 across seeds", () => {
    let refundFirst = 0;
    for (let i = 1; i <= 2000; i++) {
      const [a] = rollDiscoveryOutcomes(createRng(seedHex(i)));
      if (a === "refund") refundFirst++;
    }
    expect(refundFirst / 2000).toBeGreaterThan(0.45);
    expect(refundFirst / 2000).toBeLessThan(0.55);
  });
});
