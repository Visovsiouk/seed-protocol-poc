/**
 * The two engine changes S6 requires, tested through the public API.
 *
 *   1. **An injected boss definition.** The raid's Colophon cannot live in a
 *      flavor bank — its `baseHp` is the live edition total, which is runtime
 *      state rather than static flavor — so `startRun` takes it directly.
 *   2. **A start distinct from full health.** `baseHp` is the edition total
 *      and `startHp` is the pool as everyone before you left it, so the phase
 *      transition fires when the *collective* crosses half rather than when
 *      one player does.
 *
 * The fight itself is deliberately not re-tested here: `bossDepth: 1` makes
 * it a single boss room through the same `resolveRound` every other
 * encounter uses, and `scripts/lib/raid-damage.test.ts` already measures it
 * across 300 seeds. What is new, and therefore what this covers, is the
 * plumbing.
 */

import { describe, expect, it } from "vitest";
import { startRun, step } from "./index";
import { phaseThreshold } from "./boss";
import type { AssetCard, BossDef, CombatState, RunState, Tier } from "./types";
import type { RealmSchemas } from "./loot";
import { tierStats } from "./tier";

const REALM = "0x0000000000000000000000000000000000000001" as `0x${string}`;
const SEED =
  "0x00000000000000000000000000000000000000000000000000000000000000b1" as `0x${string}`;
const SCHEMAS: RealmSchemas = {
  weapon: { schemaId: 1, catalogEffects: [] },
  armor: { schemaId: 2, catalogEffects: [] },
};

/** The edition total, which is what `baseHp` carries for a raid fight. */
const EDITION_HP = 10_000;

function colophon(overrides: Partial<BossDef> = {}): BossDef {
  return {
    id: "the_colophon",
    preset: "fantasy",
    name: "The Colophon",
    baseHp: EDITION_HP,
    attackDie: 6,
    ac: 15,
    bakedEffects: ["damage_reduction", "thorns"],
    phase2NarrationKey: "colophon_phase2",
    phase2AttackDie: 8,
    ...overrides,
  };
}

const T5_WEAPON = tierStats(5 satisfies Tier, "weapon");
const T5_ARMOR = tierStats(5 satisfies Tier, "armor");

function t5Gear(): { weapon: AssetCard; armor: AssetCard } {
  const common = {
    realm: REALM,
    realmName: "harness",
    catalogEffects: [],
    extraFields: {},
    metadataURI: "data:test",
    preseed: false,
  };
  return {
    weapon: {
      ...common,
      tokenId: 1n,
      schemaId: 1,
      slot: "weapon",
      tier: 5,
      name: "T5 Weapon",
      damageDie: T5_WEAPON.damageDie,
      attackBonus: T5_WEAPON.attackBonus,
      damageBonus: T5_WEAPON.damageBonus,
    },
    armor: {
      ...common,
      tokenId: 2n,
      schemaId: 2,
      slot: "armor",
      tier: 5,
      name: "T5 Armor",
      acBonus: T5_ARMOR.acBonus,
      hpBonus: T5_ARMOR.hpBonus,
    },
  };
}

/**
 * Pull the live CombatState off a run, narrowed to a boss encounter.
 *
 * `CombatState.monster` is `MonsterDef | BossDef` and only the boss half has
 * `baseHp`, so every assertion about the edition total needs the narrowing.
 * Doing it once here keeps the tests about the raid rather than about the
 * union.
 */
function bossCombat(state: RunState): CombatState & { monster: BossDef } {
  const enc = state.encounter;
  if (!enc || enc.kind !== "combat") {
    throw new Error(`expected a combat encounter, got ${enc?.kind ?? "none"}`);
  }
  const combat = enc.combat;
  if (!("bakedEffects" in combat.monster)) {
    throw new Error("expected a boss encounter");
  }
  return combat as CombatState & { monster: BossDef };
}

function openRaid(startHp: number, boss = colophon()) {
  return startRun({
    preset: "fantasy",
    realm: REALM,
    rngSeed: SEED,
    equipped: t5Gear(),
    bossId: "the_colophon",
    schemas: SCHEMAS,
    bossDepth: 1,
    raidBoss: { boss, startHp },
  });
}

describe("raid fight — injected boss", () => {
  it("opens straight into the boss room with the supplied definition", () => {
    const { state } = openRaid(EDITION_HP);
    expect(state.depth).toBe(1);
    const combat = bossCombat(state);
    expect(combat.monster.name).toBe("The Colophon");
    expect(combat.monster.baseHp).toBe(EDITION_HP);
  });

  it("is not extractable, so there is no loot path to secure", () => {
    expect(openRaid(EDITION_HP).state.extractable).toBe(false);
  });

  it("does not need the bossId to exist in the flavor bank", () => {
    // `no_such_boss` would throw from `generateEncounter` without the
    // override — which is the whole reason the override exists.
    expect(() =>
      startRun({
        preset: "fantasy",
        realm: REALM,
        rngSeed: SEED,
        equipped: t5Gear(),
        bossId: "no_such_boss_anywhere",
        schemas: SCHEMAS,
        bossDepth: 1,
        raidBoss: { boss: colophon(), startHp: EDITION_HP },
      }),
    ).not.toThrow();
  });

  it("still throws for an unknown boss when no override is given", () => {
    expect(() =>
      startRun({
        preset: "fantasy",
        realm: REALM,
        rngSeed: SEED,
        equipped: t5Gear(),
        bossId: "no_such_boss_anywhere",
        schemas: SCHEMAS,
        bossDepth: 1,
      }),
    ).toThrow(/unknown bossId/);
  });
});

describe("raid fight — starting mid-pool", () => {
  it("opens the encounter at startHp, not at the edition total", () => {
    const combat = bossCombat(openRaid(7_500).state);
    expect(combat.monsterHp).toBe(7_500);
    expect(combat.monster.baseHp).toBe(EDITION_HP);
  });

  it("stays in phase 1 one point above the collective halfway mark", () => {
    const combat = bossCombat(openRaid(phaseThreshold(EDITION_HP) + 1).state);
    expect(combat.bossPhase).toBe(1);
    expect(combat.phase2PlayerBuffed).toBe(false);
  });

  it("opens already in phase 2 when the pool is at or below half", () => {
    for (const startHp of [phaseThreshold(EDITION_HP), 1_000, 1]) {
      const combat = bossCombat(openRaid(startHp).state);
      expect(combat.bossPhase).toBe(2);
      // The player's phase-2 buff applies too — arriving late must not mean
      // fighting an enraged boss without the opening it gives you.
      expect(combat.phase2PlayerBuffed).toBe(true);
    }
  });

  it("applies phase2SuppressEffect when it opens in phase 2", () => {
    const boss = colophon({ phase2SuppressEffect: "crit_chance" });
    expect(bossCombat(openRaid(1_000, boss).state).suppressedEffects).toEqual([
      "crit_chance",
    ]);
    expect(
      bossCombat(openRaid(EDITION_HP, boss).state).suppressedEffects,
    ).toEqual([]);
  });

  it("treats an exhausted pool as phase 1 rather than a live phase-2 fight", () => {
    const combat = bossCombat(openRaid(0).state);
    expect(combat.monsterHp).toBe(0);
    expect(combat.bossPhase).toBe(1);
  });

  it("keeps the injected boss across a step, not just at generation", () => {
    let { state } = openRaid(EDITION_HP);
    for (let i = 0; i < 3; i++) {
      state = step(state, { kind: "attack" }).state;
    }
    const combat = bossCombat(state);
    expect(combat.monster.name).toBe("The Colophon");
    expect(combat.monster.baseHp).toBe(EDITION_HP);
    // Three rounds cannot dent a 10k pool, so the fight is still live.
    expect(combat.monsterHp).toBeGreaterThan(EDITION_HP - 500);
    expect(state.bossCleared).toBe(false);
  });

  it("damage dealt is the pool delta, which is what gets submitted", () => {
    let { state } = openRaid(EDITION_HP);
    for (let i = 0; i < 10; i++) {
      const res = step(state, { kind: "attack" });
      state = res.state;
      if (state.defeated || state.bossCleared) break;
    }
    const dealt = EDITION_HP - bossCombat(state).monsterHp;
    expect(dealt).toBeGreaterThan(0);
    expect(dealt).toBeLessThan(EDITION_HP);
  });
});
