import { describe, expect, it } from "vitest";
import { createRng } from "./rng";
import { pickMonster } from "./encounter";
import type { MonsterDef, RoomTemplate } from "./types";

const seedHex = (i: number) => ("0x" + i.toString(16).padStart(64, "0")) as `0x${string}`;

const goblin: MonsterDef = { id: "gob", name: "Goblin", hp: 8, attackDie: 4, ac: 12, attackVerbs: ["x"] };
const wolf: MonsterDef = { id: "wolf", name: "Wolf", hp: 12, attackDie: 6, ac: 12, attackVerbs: ["x"] };
const ogre: MonsterDef = { id: "ogre", name: "Ogre", hp: 24, attackDie: 8, ac: 13, attackVerbs: ["x"] };
const monsters = { gob: goblin, wolf, ogre };

function room(depth: number, pool: string[]): RoomTemplate {
  return { id: `r-${depth}`, depth, archetype: "combat", narrationKey: "k", monsterPool: pool };
}

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

  it("favors strong monsters at deeper rooms", () => {
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
