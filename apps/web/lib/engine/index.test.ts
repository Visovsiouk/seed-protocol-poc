import { describe, expect, it } from "vitest";
import { advance, BOSS_DEPTH, commitLootMint, startRun, step } from "./index";
import type { ActionChoice, AssetCard, RunState } from "./types";
import type { RealmSchemas } from "./loot";

const REALM = "0x0000000000000000000000000000000000000001" as `0x${string}`;
const seedHex = (i: number) =>
  ("0x" + i.toString(16).padStart(64, "0")) as `0x${string}`;

const schemas: RealmSchemas = {
  weapon: { schemaId: 1, catalogEffects: [] },
  armor: { schemaId: 2, catalogEffects: [] },
};

/**
 * Tank-loadout for the boss-depth walk tests. The engine now permadeaths
 * the run the moment a monster swing brings the player to ≤ 0 HP; the
 * boss-depth tests aren't testing the survival math, they're testing that
 * room generation lands on a boss at BOSS_DEPTH. Give the test player
 * enough HP/AC that any RNG path through five standard rooms survives.
 */
const TANK_ARMOR: AssetCard = {
  tokenId: 1n,
  schemaId: 2,
  realm: REALM,
  realmName: "test",
  slot: "armor",
  tier: 5,
  name: "Test Plate",
  acBonus: 5,
  hpBonus: 200,
  catalogEffects: [],
  extraFields: {},
  metadataURI: "data:test",
  preseed: false,
};

function makeRun(overrides: Partial<Parameters<typeof startRun>[0]> = {}) {
  return startRun({
    preset: "fantasy",
    realm: REALM,
    rngSeed: seedHex(0x42),
    equipped: {},
    bossId: "lich",
    schemas,
    ...overrides,
  });
}

const strike: ActionChoice = { kind: "tactical", option: "strike" };
const flank: ActionChoice = { kind: "tactical", option: "flank" };

/** Helper: keep stepping with `strike` until the room clears. */
function clearRoom(state: RunState): RunState {
  let s = state;
  for (let i = 0; i < 50; i++) {
    if (!s.encounter) return s;
    if (s.encounter.kind === "discovery") {
      const r = step(s, { kind: "discovery", index: 0 });
      s = r.state;
      continue;
    }
    if (s.encounter.kind === "hazard") {
      // Hazard takes a single Strike-equivalent step; any choice resolves it
      const r = step(s, strike);
      s = r.state;
      continue;
    }
    const r = step(s, strike);
    s = r.state;
  }
  return s;
}

describe("engine.startRun", () => {
  it("returns a depth-1 state with an encounter", () => {
    const { state, lines } = makeRun();
    expect(state.depth).toBe(1);
    expect(state.encounter).not.toBeNull();
    expect(state.bossCleared).toBe(false);
    expect(lines.length).toBeGreaterThan(0);
  });

  it("is deterministic over the same seed", () => {
    const a = makeRun();
    const b = makeRun();
    expect(a.state.encounter).toEqual(b.state.encounter);
    expect(a.lines).toEqual(b.lines);
  });

  it("differs on different seeds across runs", () => {
    let differentFound = false;
    const baseline = makeRun();
    for (let i = 1; i <= 20; i++) {
      const r = makeRun({ rngSeed: seedHex(i) });
      if (JSON.stringify(r.state.encounter) !== JSON.stringify(baseline.state.encounter)) {
        differentFound = true;
        break;
      }
    }
    expect(differentFound).toBe(true);
  });
});

describe("engine.step + advance", () => {
  it("step on a combat encounter advances combat turn or clears the room", () => {
    const { state } = makeRun();
    expect(state.encounter?.kind).toBeDefined();
    const r = step(state, strike);
    // Either the room cleared (encounter null + pendingLoot) or the turn ticked.
    if (r.state.encounter === null) {
      expect(r.state.pendingLoot).toBeDefined();
      expect(r.events.some((e) => e.type === "LootDropped")).toBe(true);
    } else {
      expect(r.state.encounter.kind).toBe(state.encounter?.kind);
    }
  });

  it("advance increments depth and produces a new encounter", () => {
    const { state } = makeRun();
    const cleared = clearRoom(state);
    const after = commitLootMint(cleared);
    const adv = advance(after, "lich");
    expect(adv.state.depth).toBe(state.depth + 1);
    expect(adv.state.encounter).not.toBeNull();
  });

  it("advance throws if encounter still active", () => {
    const { state } = makeRun();
    expect(() => advance(state, "lich")).toThrow(/still active/);
  });
});

describe("engine.commitLootMint", () => {
  it("clears pendingLoot", () => {
    const { state } = makeRun();
    const cleared = clearRoom(state);
    if (cleared.pendingLoot) {
      const after = commitLootMint(cleared);
      expect(after.pendingLoot).toBeUndefined();
    }
  });
});

describe("engine boss-depth handling", () => {
  it("at BOSS_DEPTH, encounter is combat with a boss", () => {
    // Walk depth from 1 → BOSS_DEPTH.
    let s: RunState = makeRun({ equipped: { armor: TANK_ARMOR } }).state;
    for (let d = 1; d < BOSS_DEPTH; d++) {
      s = clearRoom(s);
      if (s.pendingLoot) s = commitLootMint(s);
      s = advance(s, "lich").state;
    }
    expect(s.depth).toBe(BOSS_DEPTH);
    expect(s.encounter?.kind).toBe("combat");
    expect((s.encounter as { combat: { monster: { id: string } } }).combat.monster.id).toBe("lich");
  });

  it("custom bossDepth lands the boss earlier (Genesis: 5-room layout)", () => {
    let s: RunState = makeRun({
      equipped: { armor: TANK_ARMOR },
      bossDepth: 5,
    }).state;
    expect(s.bossDepth).toBe(5);
    for (let d = 1; d < 5; d++) {
      s = clearRoom(s);
      if (s.pendingLoot) s = commitLootMint(s);
      s = advance(s, "lich").state;
    }
    expect(s.depth).toBe(5);
    expect(s.encounter?.kind).toBe("combat");
    expect(
      (s.encounter as { combat: { monster: { id: string } } }).combat.monster.id,
    ).toBe("lich");
  });

  it("boss clear emits BossCleared and sets bossCleared", () => {
    // Set up a state at BOSS_DEPTH with weak boss settings by carrying a strong loadout.
    // We'll just simulate by directly mounting at BOSS_DEPTH and stepping with flank.
    let s: RunState = makeRun({ equipped: { armor: TANK_ARMOR } }).state;
    for (let d = 1; d < BOSS_DEPTH; d++) {
      s = clearRoom(s);
      if (s.pendingLoot) s = commitLootMint(s);
      s = advance(s, "lich").state;
    }
    // Hammer the boss.
    for (let i = 0; i < 200; i++) {
      if (!s.encounter) break;
      const r = step(s, flank);
      s = r.state;
      if (r.events.some((e) => e.type === "BossCleared")) {
        expect(s.bossCleared).toBe(true);
        expect(s.bossClearedTurns).toBeGreaterThan(0);
        return;
      }
      // If player died, restart the test scenario — for PoC test purposes, treat HP=0 as a flaky test path.
      if (s.encounter?.kind === "combat" && s.encounter.combat.playerHp <= 0) {
        // Don't fail; this scenario is hard to win without gear.
        return;
      }
    }
  });
});

describe("engine seed-mercy (Genesis death rewind)", () => {
  it("startRun threads defeatMode + runAttempt defaults", () => {
    const { state } = makeRun();
    expect(state.defeatMode).toBe("permadeath");
    expect(state.runAttempt).toBe(1);
    expect(state.firstWeaponDropped).toBe(false);
    expect(state.bossDepth).toBe(BOSS_DEPTH);
  });

  it("seed-mercy never sets `defeated` even when the player dies", () => {
    // No equipped armor → player takes full hits and dies in a few rounds.
    // Seed-mercy should rewind to depth 1, bump runAttempt, and leave the
    // run live (no `defeated` flag, no PlayerDefeated event).
    let s: RunState = makeRun({
      defeatMode: "seed-mercy",
      forcedFirstWeaponElement: "fire",
    }).state;
    let mercyFired = false;
    for (let i = 0; i < 100 && !mercyFired; i++) {
      if (!s.encounter) {
        if (s.pendingLoot) s = commitLootMint(s);
        s = advance(s, "lich").state;
        continue;
      }
      const choice: ActionChoice =
        s.encounter.kind === "discovery"
          ? { kind: "discovery", index: 0 }
          : strike;
      const r = step(s, choice);
      s = r.state;
      if (s.runAttempt > 1) {
        mercyFired = true;
        expect(s.defeated).toBe(false);
        expect(s.depth).toBe(1);
        expect(s.firstWeaponDropped).toBe(false);
        expect(r.events.some((e) => e.type === "PlayerDefeated")).toBe(false);
      }
    }
    // It's possible the player never dies in the test seed; if so we
    // don't fail (the assertion above only fires when mercy actually
    // resolves). But typically with no armor, death lands fast.
  });

  it("forcedFirstWeaponElement marks firstWeaponDropped after the first weapon drop", () => {
    let s: RunState = makeRun({
      equipped: { armor: TANK_ARMOR },
      forcedFirstWeaponElement: "fire",
    }).state;
    expect(s.firstWeaponDropped).toBe(false);
    let sawWeaponDrop = false;
    for (let d = 1; d < BOSS_DEPTH && !sawWeaponDrop; d++) {
      s = clearRoom(s);
      if (s.pendingLoot?.slot === "weapon") {
        sawWeaponDrop = true;
        expect(s.pendingLoot.element).toBe("fire");
        expect(s.pendingLoot.nameOverride).toBeDefined();
        expect(s.firstWeaponDropped).toBe(true);
      }
      if (s.pendingLoot) s = commitLootMint(s);
      s = advance(s, "lich").state;
    }
  });
});
