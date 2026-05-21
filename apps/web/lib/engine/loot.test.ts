import { describe, expect, it } from "vitest";
import { createRng } from "./rng";
import { pickSlot, rollLoot, type RealmSchemas } from "./loot";

const seedHex = (i: number) => ("0x" + i.toString(16).padStart(64, "0")) as `0x${string}`;
const SEED = seedHex(0x123456);

const canonical: RealmSchemas = {
  weapon: { schemaId: 1, catalogEffects: [] },
  armor: { schemaId: 2, catalogEffects: [] },
};

const signatureLifesteal: RealmSchemas = {
  weapon: { schemaId: 100, catalogEffects: ["lifesteal", "crit_chance"] },
  armor: { schemaId: 101, catalogEffects: ["regen", "thorns"] },
};

describe("pickSlot", () => {
  it("rolls weapon or armor, ~50/50", () => {
    let weapons = 0;
    for (let i = 1; i <= 2000; i++) {
      if (pickSlot(createRng(seedHex(i))) === "weapon") weapons++;
    }
    expect(weapons / 2000).toBeGreaterThan(0.45);
    expect(weapons / 2000).toBeLessThan(0.55);
  });
});

describe("rollLoot", () => {
  it("weapon roll has damageDie + attackBonus + damageBonus, no armor fields", () => {
    const l = rollLoot({
      rng: createRng(SEED),
      difficulty: "standard",
      slot: "weapon",
      schemas: canonical,
      preset: "fantasy",
    });
    expect(l.slot).toBe("weapon");
    expect(l.damageDie).toBeDefined();
    expect(l.attackBonus).toBeDefined();
    expect(l.damageBonus).toBeDefined();
    // T1–T3 (standard difficulty) → damageBonus matches the canonical mirror table.
    expect(l.damageBonus).toBe(l.attackBonus);
    expect(l.acBonus).toBeUndefined();
    expect(l.hpBonus).toBeUndefined();
  });

  it("armor roll has acBonus + hpBonus, no weapon fields", () => {
    const l = rollLoot({
      rng: createRng(SEED),
      difficulty: "standard",
      slot: "armor",
      schemas: canonical,
      preset: "fantasy",
    });
    expect(l.acBonus).toBeDefined();
    expect(l.hpBonus).toBeDefined();
    expect(l.damageDie).toBeUndefined();
    expect(l.attackBonus).toBeUndefined();
  });

  it("uses canonical schemaId when no signature catalog effects", () => {
    const l = rollLoot({
      rng: createRng(SEED),
      difficulty: "standard",
      slot: "weapon",
      schemas: canonical,
      preset: "fantasy",
    });
    expect(l.schemaId).toBe(1);
    expect(l.catalogEffects).toEqual([]);
  });

  it("uses signature schemaId and rolls declared catalog effects", () => {
    const l = rollLoot({
      rng: createRng(SEED),
      difficulty: "standard",
      slot: "weapon",
      schemas: signatureLifesteal,
      preset: "fantasy",
    });
    expect(l.schemaId).toBe(100);
    expect(l.catalogEffects.map((e) => e.name)).toEqual(["lifesteal", "crit_chance"]);
    for (const e of l.catalogEffects) {
      expect(e.value).toBeGreaterThan(0);
    }
  });

  it("same seed → same LootRoll", () => {
    const a = rollLoot({
      rng: createRng(SEED),
      difficulty: "standard",
      slot: "weapon",
      schemas: signatureLifesteal,
      preset: "fantasy",
    });
    const b = rollLoot({
      rng: createRng(SEED),
      difficulty: "standard",
      slot: "weapon",
      schemas: signatureLifesteal,
      preset: "fantasy",
    });
    expect(a).toEqual(b);
  });

  it("different seeds → different nameSeed at least sometimes", () => {
    const set = new Set<string>();
    for (let i = 1; i <= 20; i++) {
      const l = rollLoot({
        rng: createRng(seedHex(i)),
        difficulty: "standard",
        slot: "weapon",
        schemas: canonical,
        preset: "fantasy",
      });
      set.add(l.nameSeed.toString());
    }
    expect(set.size).toBeGreaterThan(15);
  });

  it("boss difficulty pulls higher tiers than standard", () => {
    let stdTotal = 0;
    let bossTotal = 0;
    for (let i = 1; i <= 1000; i++) {
      stdTotal += rollLoot({
        rng: createRng(seedHex(i)),
        difficulty: "standard",
        slot: "weapon",
        schemas: canonical,
        preset: "fantasy",
      }).tier;
      bossTotal += rollLoot({
        rng: createRng(seedHex(i + 100000)),
        difficulty: "boss",
        slot: "weapon",
        schemas: canonical,
        preset: "fantasy",
      }).tier;
    }
    expect(bossTotal).toBeGreaterThan(stdTotal);
  });

  it("weapon roll carries an element field (possibly 'none')", () => {
    const l = rollLoot({
      rng: createRng(SEED),
      difficulty: "standard",
      slot: "weapon",
      schemas: canonical,
      preset: "fantasy",
    });
    expect(l.element).toBeDefined();
    expect(["none", "fire", "ice", "shock", "holy", "unholy"]).toContain(l.element);
    expect(l.resistElement).toBeUndefined();
  });

  it("armor roll carries a resistElement field (possibly 'none')", () => {
    const l = rollLoot({
      rng: createRng(SEED),
      difficulty: "standard",
      slot: "armor",
      schemas: canonical,
      preset: "fantasy",
    });
    expect(l.resistElement).toBeDefined();
    expect(["none", "fire", "ice", "shock", "holy", "unholy"]).toContain(
      l.resistElement,
    );
    expect(l.element).toBeUndefined();
  });

  it("element distribution: ~half non-'none', remainder spread across the 5 combat elements", () => {
    const counts: Record<string, number> = {};
    for (let i = 1; i <= 600; i++) {
      const l = rollLoot({
        rng: createRng(seedHex(i)),
        difficulty: "standard",
        slot: "weapon",
        schemas: canonical,
        preset: "fantasy",
      });
      const key = l.element ?? "missing";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    // ~50% none (±15% slack).
    expect((counts.none ?? 0) / 600).toBeGreaterThan(0.35);
    expect((counts.none ?? 0) / 600).toBeLessThan(0.65);
    // At least 3 of the 5 combat elements observed.
    const combatSeen = ["fire", "ice", "shock", "holy", "unholy"].filter(
      (e) => (counts[e] ?? 0) > 0,
    );
    expect(combatSeen.length).toBeGreaterThanOrEqual(3);
  });

  it("nameSeed is a 256-bit positive bigint", () => {
    const l = rollLoot({
      rng: createRng(SEED),
      difficulty: "standard",
      slot: "weapon",
      schemas: canonical,
      preset: "fantasy",
    });
    expect(typeof l.nameSeed).toBe("bigint");
    expect(l.nameSeed).toBeGreaterThanOrEqual(0n);
    expect(l.nameSeed).toBeLessThan(1n << 256n);
  });
});
