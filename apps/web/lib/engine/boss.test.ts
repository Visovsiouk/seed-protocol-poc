import { describe, expect, it } from "vitest";
import { checkPhaseTransition, createBossEncounter } from "./boss";
import type { BossDef, CombatState } from "./types";

const lich: BossDef = {
  id: "lich",
  preset: "fantasy",
  name: "Lich",
  baseHp: 60,
  attackDie: 8,
  ac: 14,
  bakedEffects: ["lifesteal", "bleed"],
  phase2NarrationKey: "lich_phase2",
  phase2AttackDie: 10,
  phase2SuppressEffect: "lifesteal",
};

const noSuppress: BossDef = { ...lich, phase2SuppressEffect: undefined };

function baseState(overrides: Partial<CombatState> = {}): CombatState {
  return createBossEncounter({
    boss: lich,
    playerHp: 25,
    playerMaxHp: 25,
    playerAc: 12,
    ...overrides,
  });
}

describe("createBossEncounter", () => {
  it("seeds bossPhase=1 and uses boss as monster", () => {
    const s = baseState();
    expect(s.bossPhase).toBe(1);
    expect(s.monsterHp).toBe(lich.baseHp);
    expect(s.monster).toBe(lich);
  });

  it("starts with no suppressions and no bleed stacks", () => {
    const s = baseState();
    expect(s.suppressedEffects).toEqual([]);
    expect(s.bleedStacks).toBe(0);
  });
});

describe("checkPhaseTransition", () => {
  it("does not transition above 50% HP", () => {
    const s = { ...baseState(), monsterHp: 31 };
    const r = checkPhaseTransition(s);
    expect(r.transitioned).toBe(false);
    expect(r.state.bossPhase).toBe(1);
  });

  it("transitions at exactly 50% HP", () => {
    const s = { ...baseState(), monsterHp: 30 };
    const r = checkPhaseTransition(s);
    expect(r.transitioned).toBe(true);
    expect(r.state.bossPhase).toBe(2);
    expect(r.narrationKey).toBe("lich_phase2");
  });

  it("transitions below 50% HP", () => {
    const s = { ...baseState(), monsterHp: 12 };
    const r = checkPhaseTransition(s);
    expect(r.transitioned).toBe(true);
    expect(r.state.bossPhase).toBe(2);
  });

  it("adds phase2SuppressEffect to suppressedEffects when set", () => {
    const s = { ...baseState(), monsterHp: 30 };
    const r = checkPhaseTransition(s);
    expect(r.state.suppressedEffects).toContain("lifesteal");
  });

  it("does not modify suppressedEffects when no suppression configured", () => {
    const s0 = createBossEncounter({
      boss: noSuppress,
      playerHp: 25,
      playerMaxHp: 25,
      playerAc: 12,
    });
    const s = { ...s0, monsterHp: 30 };
    const r = checkPhaseTransition(s);
    expect(r.state.suppressedEffects).toEqual([]);
    expect(r.transitioned).toBe(true);
  });

  it("is idempotent: re-checking after phase 2 returns transitioned=false", () => {
    const s = { ...baseState(), monsterHp: 30 };
    const r1 = checkPhaseTransition(s);
    const r2 = checkPhaseTransition(r1.state);
    expect(r2.transitioned).toBe(false);
    expect(r2.state.bossPhase).toBe(2);
    expect(r2.state.suppressedEffects.filter((e) => e === "lifesteal").length).toBe(1);
  });

  it("does not transition for dead bosses (HP=0)", () => {
    const s = { ...baseState(), monsterHp: 0 };
    const r = checkPhaseTransition(s);
    expect(r.transitioned).toBe(false);
  });

  it("does not transition for non-boss monsters", () => {
    const s: CombatState = {
      playerHp: 25,
      playerMaxHp: 25,
      playerAc: 12,
      monster: {
        id: "gob",
        name: "Goblin",
        hp: 10,
        attackDie: 6,
        ac: 12,
        attackVerbs: ["x"],
      },
      monsterHp: 1,
      bracedThisTurn: false,
      bleedStacks: 0,
      suppressedEffects: [],
      turn: 0,
    };
    const r = checkPhaseTransition(s);
    expect(r.transitioned).toBe(false);
  });

  it("emits phase-2 narration lines", () => {
    const s = { ...baseState(), monsterHp: 30 };
    const r = checkPhaseTransition(s);
    expect(r.lines.length).toBeGreaterThan(0);
    expect(r.lines.some((l) => /more dangerous/i.test(l.text))).toBe(true);
  });
});
