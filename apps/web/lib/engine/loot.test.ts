import { describe, expect, it } from "vitest";
import { createRng } from "./rng";
import { pickSlot, rollLoot, type RealmSchemas } from "./loot";
import { combatArmorTypesFor, combatWeaponTypesFor } from "./types";

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

  it("uses signature schemaId; rolled effects are a subset of the schema pool", () => {
    // HP-carry rebalance: `schema.catalogEffects` is a *pool* the drop
    // may draw from, not a guaranteed payload. The count is rolled per
    // tier (see EFFECT_COUNT_DISTRIBUTION in tier.ts) and clamped to
    // pool size. Across many seeds we expect:
    //   - every rolled effect comes from the declared pool,
    //   - some drops carry 0 effects (especially when tier rolls low),
    //   - rolled values are >0 and within tier bounds (validator-side).
    const pool = new Set(["lifesteal", "crit_chance"]);
    let everyDropEmpty = true;
    let everyDropFull = true;
    for (let i = 1; i <= 200; i++) {
      const l = rollLoot({
        rng: createRng(seedHex(i)),
        difficulty: "standard",
        slot: "weapon",
        schemas: signatureLifesteal,
        preset: "fantasy",
      });
      expect(l.schemaId).toBe(100);
      for (const e of l.catalogEffects) {
        expect(pool.has(e.name)).toBe(true);
        expect(e.value).toBeGreaterThan(0);
      }
      if (l.catalogEffects.length > 0) everyDropEmpty = false;
      if (l.catalogEffects.length < pool.size) everyDropFull = false;
    }
    // The pool is large enough and tier mix is wide enough that 200
    // seeds should produce both kinds of drops (some empty, some not
    // full). Catches a regression that always returns the whole pool
    // or always returns nothing.
    expect(everyDropEmpty).toBe(false);
    expect(everyDropFull).toBe(false);
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

  it("weapon roll carries a weaponType drawn from the preset's combat pool", () => {
    for (const preset of ["fantasy", "scifi", "cyberpunk"] as const) {
      const pool = combatWeaponTypesFor(preset);
      const seen = new Set<string>();
      for (let i = 1; i <= 200; i++) {
        const l = rollLoot({
          rng: createRng(seedHex(i)),
          difficulty: "standard",
          slot: "weapon",
          schemas: canonical,
          preset,
        });
        expect(l.weaponType).toBeDefined();
        expect(l.weaponType).not.toBe("none");
        expect(pool).toContain(l.weaponType!);
        expect(l.armorType).toBeUndefined();
        seen.add(l.weaponType!);
      }
      // At least 3 of the 5 combat archetypes should show up across 200 rolls.
      expect(seen.size).toBeGreaterThanOrEqual(3);
    }
  });

  it("armor roll carries an armorType drawn from the preset's combat pool", () => {
    for (const preset of ["fantasy", "scifi", "cyberpunk"] as const) {
      const pool = combatArmorTypesFor(preset);
      const seen = new Set<string>();
      for (let i = 1; i <= 200; i++) {
        const l = rollLoot({
          rng: createRng(seedHex(i)),
          difficulty: "standard",
          slot: "armor",
          schemas: canonical,
          preset,
        });
        expect(l.armorType).toBeDefined();
        expect(l.armorType).not.toBe("none");
        expect(pool).toContain(l.armorType!);
        expect(l.weaponType).toBeUndefined();
        seen.add(l.armorType!);
      }
      // Armor pools are size-3 — observe at least 2 of them across 200 rolls.
      expect(seen.size).toBeGreaterThanOrEqual(2);
    }
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
