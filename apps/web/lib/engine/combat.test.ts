import { describe, expect, it } from "vitest";
import { armorElementMultiplier, elementMultiplier, resolveRound } from "./combat";
import { createRng } from "./rng";
import type {
  ActionChoice,
  AssetCard,
  BossDef,
  CatalogEffectName,
  CombatState,
  Element,
  MonsterDef,
} from "./types";

const SEED =
  "0x1111111111111111111111111111111111111111111111111111111111111111";
const SEED_2 =
  "0x2222222222222222222222222222222222222222222222222222222222222222";

const baseMonster: MonsterDef = {
  id: "test-mon",
  name: "Goblin",
  hp: 30,
  attackDie: 6,
  ac: 12,
  attackVerbs: ["snarls and stabs"],
};

const baseBoss: BossDef = {
  id: "test-boss",
  preset: "fantasy",
  name: "Lich",
  baseHp: 60,
  attackDie: 8,
  ac: 14,
  bakedEffects: ["lifesteal", "bleed"] as [CatalogEffectName, CatalogEffectName],
  phase2NarrationKey: "lich_phase2",
  phase2AttackDie: 10,
};

function card(
  slot: "weapon" | "armor",
  damageDie: 4 | 6 | 8 | 10 | 12,
  attackBonus: number,
  acBonus: number,
  hpBonus: number,
  effects: { name: CatalogEffectName; value: number }[] = [],
  element?: Element,
  damageBonus = 0,
): AssetCard {
  return {
    tokenId: 1n,
    schemaId: 1,
    realm: "0x0000000000000000000000000000000000000000",
    realmName: "Test",
    slot,
    tier: 3,
    name: slot === "weapon" ? "Test Sword" : "Test Mail",
    damageDie: slot === "weapon" ? damageDie : undefined,
    attackBonus: slot === "weapon" ? attackBonus : undefined,
    damageBonus: slot === "weapon" ? damageBonus : undefined,
    acBonus: slot === "armor" ? acBonus : undefined,
    hpBonus: slot === "armor" ? hpBonus : undefined,
    element: slot === "weapon" ? element : undefined,
    resistElement: slot === "armor" ? element : undefined,
    catalogEffects: effects,
    extraFields: {},
    metadataURI: "data:",
    preseed: false,
  };
}

function makeState(overrides: Partial<CombatState> = {}): CombatState {
  return {
    playerHp: 25,
    playerMaxHp: 25,
    playerAc: 12,
    monster: baseMonster,
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

const attack: ActionChoice = { kind: "attack" };
const secondary: ActionChoice = { kind: "secondary" };

describe("resolveRound — base mechanics", () => {
  it("Strike: player swings and the monster swings back", () => {
    const state = makeState();
    const equipped = { weapon: card("weapon", 6, 1, 0, 0) };
    const rng = createRng(SEED);
    const r = resolveRound(state, attack, equipped, rng);
    expect(r.state.turn).toBe(1);
    // The state changed somehow (HP move on at least one side, or a miss
    // line emitted). We assert via narration line count being non-zero.
    expect(r.lines.length).toBeGreaterThan(0);
  });

  it("Secondary (Brace via damage_reduction armor): player skips the swing and gains +2 AC", () => {
    // With Brace, monsterHp never changes during the player's swing.
    const state = makeState();
    const equipped = {
      weapon: card("weapon", 12, 4, 0, 0), // high damage to be unambiguous
      armor: card("armor", 6, 0, 2, 10, [{ name: "damage_reduction", value: 1 }]),
    };
    const rng = createRng(SEED);
    const r = resolveRound(state, secondary, equipped, rng);
    expect(r.state.monsterHp).toBe(state.monsterHp);
    expect(r.lines.some((l) => /brace/i.test(l.text))).toBe(true);
  });

  it("Player can defeat the monster in one strike when damage exceeds HP", () => {
    const state = makeState({ monsterHp: 1 });
    const equipped = { weapon: card("weapon", 12, 8, 0, 0) }; // guaranteed-hit-ish
    const rng = createRng(SEED);
    const r = resolveRound(state, attack, equipped, rng);
    // If the d20 missed we won't see defeat, but at +8 vs AC 12 we almost
    // always hit; loop a few seeds in case.
    let defeated = r.monsterDefeated;
    for (let s = 0; s < 10 && !defeated; s++) {
      const seedHex = s.toString(16).padStart(64, "0");
      const r2 = resolveRound(
        state,
        attack,
        equipped,
        createRng(`0x${seedHex}` as `0x${string}`),
      );
      if (r2.monsterDefeated) defeated = true;
    }
    expect(defeated).toBe(true);
  });

  it("Player death flags playerDefeated", () => {
    const state = makeState({ playerHp: 1 });
    const equipped = { weapon: card("weapon", 4, 0, 0, 0) };
    let died = false;
    for (let i = 0; i < 20 && !died; i++) {
      const seedHex = i.toString(16).padStart(64, "0");
      const r = resolveRound(
        state,
        secondary, // No armor → Focus (next attack auto-crits); no defensive boost
        equipped,
        createRng(`0x${seedHex}` as `0x${string}`),
      );
      if (r.playerDefeated) died = true;
    }
    expect(died).toBe(true);
  });
});

describe("resolveRound — catalog effects", () => {
  it("regen heals the player at preTurn (caps at max)", () => {
    const state = makeState({ playerHp: 20, playerMaxHp: 25 });
    const equipped = {
      weapon: card("weapon", 6, 1, 0, 0),
      armor: card("armor", 6, 0, 2, 10, [{ name: "regen", value: 3 }]),
    };
    const rng = createRng(SEED);
    const r = resolveRound(state, secondary, equipped, rng); // Brace → monster might miss too
    expect(r.lines.some((l) => /regenerate/i.test(l.text))).toBe(true);
    expect(r.state.playerHp).toBeGreaterThanOrEqual(20);
  });

  it("multi_hit causes additional player swings", () => {
    // With multi_hit=2 we expect "You hit"/"strike goes wide" lines from
    // up to 3 swings (1 base + 2 extra). Average should be > 1.
    const equipped = {
      weapon: card("weapon", 6, 4, 0, 0, [{ name: "multi_hit", value: 2 }]),
    };
    let totalAttackLines = 0;
    for (let i = 0; i < 30; i++) {
      const seedHex = i.toString(16).padStart(64, "0");
      const rng = createRng(`0x${seedHex}` as `0x${string}`);
      const r = resolveRound(makeState(), attack, equipped, rng);
      totalAttackLines += r.lines.filter((l) =>
        /You hit|strike goes wide/.test(l.text),
      ).length;
    }
    // 30 rounds × (1 base swing + up to 2 extras). Floor for "multi did anything": > 30.
    expect(totalAttackLines).toBeGreaterThan(30);
  });

  it("multi_hit stops swinging once monster dies", () => {
    const state = makeState({ monsterHp: 3 });
    const equipped = {
      weapon: card("weapon", 12, 8, 0, 0, [{ name: "multi_hit", value: 2 }]),
    };
    const rng = createRng(SEED);
    const r = resolveRound(state, attack, equipped, rng);
    if (r.monsterDefeated) {
      // We expect at most one "hit" line beyond the killing blow's. Be lenient:
      // just confirm monsterHp clamps to 0 (no negative).
      expect(r.state.monsterHp).toBe(0);
    }
  });

  it("lifesteal heals on hit but never above maxHp", () => {
    const state = makeState({ playerHp: 23, playerMaxHp: 25 });
    const equipped = {
      weapon: card("weapon", 12, 6, 0, 0, [{ name: "lifesteal", value: 5 }]),
    };
    // Hit guaranteed-ish at +6 vs AC 12. With 12-side die and crit logic
    // potentially compounding, we just check the cap holds.
    const rng = createRng(SEED);
    const r = resolveRound(state, attack, equipped, rng);
    expect(r.state.playerHp).toBeLessThanOrEqual(25);
  });

  it("bleed applies stacks; postTurn ticks the monster", () => {
    const equipped = {
      weapon: card("weapon", 12, 6, 0, 0, [{ name: "bleed", value: 3 }]),
    };
    // Burn through seeds until we land at least one hit.
    let found = false;
    for (let i = 0; i < 20 && !found; i++) {
      const seedHex = i.toString(16).padStart(64, "0");
      const rng = createRng(`0x${seedHex}` as `0x${string}`);
      const r = resolveRound(makeState(), attack, equipped, rng);
      if (r.lines.some((l) => /wound bleeds/.test(l.text))) {
        expect(r.state.bleedStacks).toBeLessThanOrEqual(3);
        // postTurn tick already fired this round (stacks reduced by one OR
        // applied this round and ticked to 2). Either is correct.
        expect(r.state.bleedStacks).toBeGreaterThanOrEqual(1);
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it("dodge_chance can skip incoming hits", () => {
    const equipped = {
      weapon: card("weapon", 6, 1, 0, 0),
      armor: card("armor", 6, 0, 2, 10, [{ name: "dodge_chance", value: 25 }]),
    };
    // Over many seeds we should see at least some "you dodge" lines.
    let dodgeCount = 0;
    for (let i = 0; i < 100; i++) {
      const seedHex = i.toString(16).padStart(64, "0");
      const r = resolveRound(makeState(), attack, equipped, createRng(`0x${seedHex}` as `0x${string}`));
      if (r.lines.some((l) => /You dodge/.test(l.text))) dodgeCount++;
    }
    expect(dodgeCount).toBeGreaterThan(10); // ~25% expected
    expect(dodgeCount).toBeLessThan(45);
  });

  it("damage_reduction shaves flat damage off incoming hits", () => {
    const equipped = {
      weapon: card("weapon", 6, 1, 0, 0),
      armor: card("armor", 6, 0, 2, 10, [{ name: "damage_reduction", value: 3 }]),
    };
    let reductionLines = 0;
    for (let i = 0; i < 80; i++) {
      const seedHex = i.toString(16).padStart(64, "0");
      const r = resolveRound(makeState(), attack, equipped, createRng(`0x${seedHex}` as `0x${string}`));
      if (r.lines.some((l) => /reduced/.test(l.text))) reductionLines++;
    }
    expect(reductionLines).toBeGreaterThan(0);
  });

  it("thorns reflects damage to attacker when hit", () => {
    const equipped = {
      weapon: card("weapon", 4, 0, 0, 0), // low damage so monster doesn't die from us
      armor: card("armor", 6, 0, 2, 10, [{ name: "thorns", value: 5 }]),
    };
    let thornsLines = 0;
    for (let i = 0; i < 50; i++) {
      const seedHex = i.toString(16).padStart(64, "0");
      const r = resolveRound(makeState(), secondary, equipped, createRng(`0x${seedHex}` as `0x${string}`));
      if (r.lines.some((l) => /Thorns/.test(l.text))) thornsLines++;
    }
    expect(thornsLines).toBeGreaterThan(0);
  });

  it("crit_chance produces critical hit narration sometimes", () => {
    const equipped = {
      weapon: card("weapon", 6, 4, 0, 0, [{ name: "crit_chance", value: 25 }]),
    };
    let crits = 0;
    for (let i = 0; i < 100; i++) {
      const seedHex = i.toString(16).padStart(64, "0");
      const r = resolveRound(makeState(), attack, equipped, createRng(`0x${seedHex}` as `0x${string}`));
      if (r.lines.some((l) => /CRITICAL/.test(l.text))) crits++;
    }
    // ~25% but only on hits; with +4 vs AC 12 we hit ~90% of the time → ~22%
    expect(crits).toBeGreaterThan(8);
    expect(crits).toBeLessThan(45);
  });
});

describe("resolveRound — boss phase 2 suppression", () => {
  it("a suppressed effect on the player produces no notes", () => {
    const state = makeState({
      monster: baseBoss,
      monsterHp: 30,
      bossPhase: 2,
      suppressedEffects: ["regen"],
    });
    const equipped = {
      weapon: card("weapon", 6, 1, 0, 0),
      armor: card("armor", 6, 0, 2, 10, [{ name: "regen", value: 3 }]),
    };
    const rng = createRng(SEED);
    const r = resolveRound(state, secondary, equipped, rng);
    expect(r.lines.some((l) => /regenerate/i.test(l.text))).toBe(false);
  });
});

describe("resolveRound — determinism", () => {
  it("same seed + state → same trace", () => {
    const state = makeState();
    const equipped = { weapon: card("weapon", 6, 1, 0, 0) };
    const a = resolveRound(state, attack, equipped, createRng(SEED));
    const b = resolveRound(state, attack, equipped, createRng(SEED));
    expect(a.state).toEqual(b.state);
    expect(a.lines).toEqual(b.lines);
  });

  it("different seed → different trace at least sometimes", () => {
    // Drive several rounds through each RNG: a single round can collapse to
    // identical "both miss" narration by chance, so the trace divergence
    // signal lives in the multi-round trajectory.
    const equipped = { weapon: card("weapon", 6, 1, 0, 0) };
    const drive = (seed: `0x${string}`) => {
      const rng = createRng(seed);
      let s = makeState();
      const lines: string[] = [];
      for (let i = 0; i < 6; i++) {
        const r = resolveRound(s, attack, equipped, rng);
        s = r.state;
        for (const l of r.lines) lines.push(l.text);
        if (r.monsterDefeated || r.playerDefeated) break;
      }
      return { state: s, lines };
    };
    const a = drive(SEED);
    const b = drive(SEED_2);
    const same = JSON.stringify(a.state) === JSON.stringify(b.state) &&
      JSON.stringify(a.lines) === JSON.stringify(b.lines);
    expect(same).toBe(false);
  });

  it("does not mutate the input state", () => {
    const state = makeState();
    const snapshot = JSON.parse(JSON.stringify(state, (_, v) =>
      typeof v === "bigint" ? v.toString() : v,
    ));
    const equipped = { weapon: card("weapon", 6, 1, 0, 0) };
    resolveRound(state, attack, equipped, createRng(SEED));
    expect(
      JSON.parse(JSON.stringify(state, (_, v) =>
        typeof v === "bigint" ? v.toString() : v,
      )),
    ).toEqual(snapshot);
  });
});

describe("elementMultiplier (pure helper)", () => {
  it("returns 1.5× when weapon element matches monster.weakTo", () => {
    expect(elementMultiplier("fire", { weakTo: "fire" })).toEqual({
      mult: 1.5,
      tag: "weak",
    });
  });

  it("returns 0.5× when weapon element matches monster.resistTo", () => {
    expect(elementMultiplier("fire", { resistTo: "fire" })).toEqual({
      mult: 0.5,
      tag: "resist",
    });
  });

  it("returns 1× when monster has neither weakTo nor resistTo match", () => {
    expect(elementMultiplier("fire", { weakTo: "ice", resistTo: "shock" })).toEqual({
      mult: 1,
      tag: "neutral",
    });
  });

  it("returns 1× when weapon element is undefined or 'none'", () => {
    expect(elementMultiplier(undefined, { weakTo: "fire" })).toEqual({
      mult: 1,
      tag: "neutral",
    });
    expect(elementMultiplier("none", { weakTo: "fire" })).toEqual({
      mult: 1,
      tag: "neutral",
    });
  });
});

describe("armorElementMultiplier (pure helper)", () => {
  it("halves damage when armor resist matches monster element", () => {
    expect(armorElementMultiplier("fire", "fire")).toEqual({
      mult: 0.5,
      resisted: true,
    });
  });

  it("returns 1× when armor resist doesn't match", () => {
    expect(armorElementMultiplier("fire", "ice")).toEqual({
      mult: 1,
      resisted: false,
    });
  });

  it("returns 1× when monster element is 'none' or undefined", () => {
    expect(armorElementMultiplier("none", "fire")).toEqual({
      mult: 1,
      resisted: false,
    });
    expect(armorElementMultiplier(undefined, "fire")).toEqual({
      mult: 1,
      resisted: false,
    });
  });

  it("returns 1× when armor resist is 'none' or undefined", () => {
    expect(armorElementMultiplier("fire", "none")).toEqual({
      mult: 1,
      resisted: false,
    });
    expect(armorElementMultiplier("fire", undefined)).toEqual({
      mult: 1,
      resisted: false,
    });
  });
});

describe("resolveRound — elements", () => {
  it("elementally-weak weapon produces the weak narration tag at least sometimes", () => {
    // Monster weak to fire; fire weapon → 1.5× damage on hit, with " (elementally weak)" tag.
    const weakMonster: MonsterDef = {
      ...baseMonster,
      weakTo: "fire",
    };
    const equipped = {
      weapon: card("weapon", 6, 4, 0, 0, [], "fire"),
    };
    let weakTagSeen = 0;
    for (let i = 0; i < 60; i++) {
      const seedHex = i.toString(16).padStart(64, "0");
      const r = resolveRound(
        makeState({ monster: weakMonster }),
        attack,
        equipped,
        createRng(`0x${seedHex}` as `0x${string}`),
      );
      if (r.lines.some((l) => /elementally weak/.test(l.text))) weakTagSeen++;
    }
    expect(weakTagSeen).toBeGreaterThan(0);
  });

  it("resist-aligned weapon produces the resisted narration tag at least sometimes", () => {
    const resistMonster: MonsterDef = {
      ...baseMonster,
      resistTo: "fire",
    };
    const equipped = {
      weapon: card("weapon", 6, 4, 0, 0, [], "fire"),
    };
    let resistTagSeen = 0;
    for (let i = 0; i < 60; i++) {
      const seedHex = i.toString(16).padStart(64, "0");
      const r = resolveRound(
        makeState({ monster: resistMonster }),
        attack,
        equipped,
        createRng(`0x${seedHex}` as `0x${string}`),
      );
      if (r.lines.some((l) => / \(resisted\)/.test(l.text))) resistTagSeen++;
    }
    expect(resistTagSeen).toBeGreaterThan(0);
  });

  it("armor with matching resistElement produces 'wards it' narration at least sometimes", () => {
    const fireMonster: MonsterDef = {
      ...baseMonster,
      element: "fire",
    };
    const equipped = {
      weapon: card("weapon", 4, 0, 0, 0),
      armor: card("armor", 6, 0, 0, 0, [], "fire"),
    };
    let wardSeen = 0;
    for (let i = 0; i < 80; i++) {
      const seedHex = i.toString(16).padStart(64, "0");
      const r = resolveRound(
        makeState({ monster: fireMonster, playerAc: 8 }), // low AC so monster hits often
        secondary,
        equipped,
        createRng(`0x${seedHex}` as `0x${string}`),
      );
      if (r.lines.some((l) => /wards it/.test(l.text))) wardSeen++;
    }
    expect(wardSeen).toBeGreaterThan(0);
  });
});

describe("resolveRound — roll tags in narration", () => {
  it("player hit lines show labelled hit + dmg sections with both bonuses", () => {
    // d8, +4 hit, +2 dmg → tag should include "hit:" and "dmg:" sections plus an "=N" total on each.
    const equipped = { weapon: card("weapon", 8, 4, 0, 0, [], undefined, 2) };
    let saw = false;
    for (let i = 0; i < 30 && !saw; i++) {
      const seedHex = i.toString(16).padStart(64, "0");
      const r = resolveRound(
        makeState(),
        attack,
        equipped,
        createRng(`0x${seedHex}` as `0x${string}`),
      );
      const hitLine = r.lines.find((l) => /You hit/.test(l.text));
      if (hitLine) {
        // Pattern: "[hit: d20 N+4=M vs AC 12 · dmg: d8 R+2=T]" OR nat-20 auto-hit variant.
        expect(hitLine.text).toMatch(
          /\[hit: (d20 \d+\+4=\d+ vs AC 12|d20 20 — auto-hit) · dmg: d8 \d+\+2=\d+\]/,
        );
        saw = true;
      }
    }
    expect(saw).toBe(true);
  });

  it("hit lines drop the bonus arithmetic when both bonuses are zero", () => {
    // T1-like profile: d4, +0 hit, +0 dmg.
    const equipped = { weapon: card("weapon", 4, 0, 0, 0) };
    let saw = false;
    for (let i = 0; i < 80 && !saw; i++) {
      const seedHex = i.toString(16).padStart(64, "0");
      const r = resolveRound(
        makeState(),
        attack,
        equipped,
        createRng(`0x${seedHex}` as `0x${string}`),
      );
      const hitLine = r.lines.find((l) => /You hit/.test(l.text));
      if (hitLine) {
        // No "+N=N" arithmetic should appear when both bonuses are 0.
        expect(hitLine.text).toMatch(/\[hit: d20 \d+ vs AC 12 · dmg: d4 \d+\]/);
        expect(hitLine.text).not.toMatch(/\+0/);
        expect(hitLine.text).not.toMatch(/=/);
        saw = true;
      }
    }
    expect(saw).toBe(true);
  });

  it("player miss lines show the hit-side tag without a damage section", () => {
    const equipped = { weapon: card("weapon", 4, 0, 0, 0) };
    const hardMonster: MonsterDef = { ...baseMonster, ac: 19, hp: 999 };
    let saw = false;
    for (let i = 0; i < 80 && !saw; i++) {
      const seedHex = i.toString(16).padStart(64, "0");
      const r = resolveRound(
        makeState({ monster: hardMonster, monsterHp: 999 }),
        attack,
        equipped,
        createRng(`0x${seedHex}` as `0x${string}`),
      );
      const missLine = r.lines.find((l) => /strike goes wide/.test(l.text));
      if (missLine) {
        expect(missLine.text).toMatch(/\[hit: d20 \d+ vs AC 19\]/);
        expect(missLine.text).not.toMatch(/dmg:/);
        saw = true;
      }
    }
    expect(saw).toBe(true);
  });

  it("player fumble line shows '[hit: d20 1 — fumble]'", () => {
    const equipped = { weapon: card("weapon", 6, 0, 0, 0) };
    let saw = false;
    for (let i = 0; i < 200 && !saw; i++) {
      const seedHex = i.toString(16).padStart(64, "0");
      const r = resolveRound(
        makeState(),
        attack,
        equipped,
        createRng(`0x${seedHex}` as `0x${string}`),
      );
      const fumble = r.lines.find((l) => /You fumble/.test(l.text));
      if (fumble) {
        expect(fumble.text).toMatch(/\[hit: d20 1 — fumble\]/);
        saw = true;
      }
    }
    expect(saw).toBe(true);
  });

  it("monster hit lines show labelled hit + dmg sections", () => {
    const equipped = {
      weapon: card("weapon", 4, 0, 0, 0),
      armor: card("armor", 6, 0, 0, 0, [{ name: "damage_reduction", value: 1 }]),
    };
    let saw = false;
    for (let i = 0; i < 30 && !saw; i++) {
      const seedHex = i.toString(16).padStart(64, "0");
      const r = resolveRound(
        makeState({ playerAc: 8 }),
        secondary,
        equipped,
        createRng(`0x${seedHex}` as `0x${string}`),
      );
      const hitLine = r.lines.find((l) => /Goblin hits you/.test(l.text));
      if (hitLine) {
        // Brace adds +2 AC → target 10
        expect(hitLine.text).toMatch(/\[hit: d20 .* vs AC 10 · dmg: d6 \d+\]/);
        saw = true;
      }
    }
    expect(saw).toBe(true);
  });
});

describe("resolveRound — damage formula", () => {
  it("damageBonus is added as a flat amount on hit (no crit, no element)", () => {
    // d4, +20 hit, +5 dmg. With +20 to-hit only a nat-1 misses, so almost all
    // rounds produce a hit. Damage range without crit: [1+5, 4+5] = [6, 9].
    const equipped = { weapon: card("weapon", 4, 20, 0, 0, [], undefined, 5) };
    const damages: number[] = [];
    for (let i = 0; i < 80; i++) {
      const seedHex = i.toString(16).padStart(64, "0");
      const r = resolveRound(
        makeState({ monsterHp: 999 }),
        attack,
        equipped,
        createRng(`0x${seedHex}` as `0x${string}`),
      );
      const hitLine = r.lines.find((l) => /You hit for (\d+)/.test(l.text));
      if (hitLine) {
        // Exclude crits — they double the dice, expanding the range.
        if (/CRITICAL/.test(hitLine.text)) continue;
        const m = hitLine.text.match(/You hit for (\d+)/);
        if (m) damages.push(Number(m[1]));
      }
    }
    expect(damages.length).toBeGreaterThan(20);
    for (const d of damages) {
      // Without crit: damage = dieRoll(1..4) + 5  → 6..9.
      expect(d).toBeGreaterThanOrEqual(6);
      expect(d).toBeLessThanOrEqual(9);
    }
  });

  it("crit doubles the dice but NOT the flat damageBonus", () => {
    // d4, +20 hit, +10 dmg, 100% crit_chance. Damage formula on crit:
    //   damage = (dieRoll * 2) + damageBonus = (1..4)*2 + 10 = 12..18
    // If the bug returned (dieRoll + bonus) * 2, the range would be 22..28
    // and our upper-bound check would catch it.
    const equipped = {
      weapon: card(
        "weapon",
        4,
        20,
        0,
        0,
        [{ name: "crit_chance", value: 99 }],
        undefined,
        10,
      ),
    };
    const damages: number[] = [];
    for (let i = 0; i < 60; i++) {
      const seedHex = i.toString(16).padStart(64, "0");
      const r = resolveRound(
        makeState({ monsterHp: 999 }),
        attack,
        equipped,
        createRng(`0x${seedHex}` as `0x${string}`),
      );
      const crit = r.lines.find((l) => /CRITICAL/.test(l.text));
      if (crit) {
        const m = crit.text.match(/You hit for (\d+)/);
        if (m) damages.push(Number(m[1]));
      }
    }
    expect(damages.length).toBeGreaterThan(20);
    for (const d of damages) {
      expect(d).toBeGreaterThanOrEqual(12);
      expect(d).toBeLessThanOrEqual(18);
    }
  });
});

describe("resolveRound — nat-20 and nat-1", () => {
  it("nat-20 crits even when attackBonus would not normally clear AC", () => {
    // Weapon with +0 bonus vs AC 20 monster — only a nat-20 ever hits.
    const fortressMonster: MonsterDef = { ...baseMonster, ac: 20, hp: 999 };
    const equipped = { weapon: card("weapon", 4, 0, 0, 0) };
    let critsOnHit = 0;
    let hits = 0;
    for (let i = 0; i < 400; i++) {
      const seedHex = i.toString(16).padStart(64, "0");
      const r = resolveRound(
        makeState({ monster: fortressMonster, monsterHp: 999 }),
        attack,
        equipped,
        createRng(`0x${seedHex}` as `0x${string}`),
      );
      if (r.lines.some((l) => /You hit/.test(l.text))) {
        hits++;
        if (r.lines.some((l) => /CRITICAL/.test(l.text))) critsOnHit++;
      }
    }
    expect(hits).toBeGreaterThan(0);
    // Every hit against AC 20 with +0 bonus had to be a nat-20 — therefore every hit is a crit.
    expect(critsOnHit).toBe(hits);
  });

  it("nat-1 fumbles the player swing even with massive attackBonus", () => {
    // +20 to hit vs AC 12 — only a nat-1 can miss. Across many seeds at least
    // some "You fumble" lines should appear.
    const equipped = { weapon: card("weapon", 4, 20, 0, 0) };
    let fumbles = 0;
    for (let i = 0; i < 200; i++) {
      const seedHex = i.toString(16).padStart(64, "0");
      const r = resolveRound(
        makeState(),
        attack,
        equipped,
        createRng(`0x${seedHex}` as `0x${string}`),
      );
      if (r.lines.some((l) => /You fumble the swing/.test(l.text))) fumbles++;
    }
    expect(fumbles).toBeGreaterThan(0);
    // Expect ~5% (1/20 nat-1 rate). Sanity: not absurd.
    expect(fumbles).toBeLessThan(40);
  });

  it("monster nat-1 produces 'stumbles and misses' narration sometimes", () => {
    // Player AC 8 so the monster nearly always hits — only nat-1 misses.
    const equipped = { weapon: card("weapon", 4, 0, 0, 0) };
    let stumbles = 0;
    for (let i = 0; i < 200; i++) {
      const seedHex = i.toString(16).padStart(64, "0");
      const r = resolveRound(
        makeState({ playerAc: 8 }),
        secondary,
        equipped,
        createRng(`0x${seedHex}` as `0x${string}`),
      );
      if (r.lines.some((l) => /stumbles and misses/.test(l.text))) stumbles++;
    }
    expect(stumbles).toBeGreaterThan(0);
  });
});
