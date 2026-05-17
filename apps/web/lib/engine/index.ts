/**
 * Public engine API. Three entry points:
 *
 *   - `startRun({...})` — build an initial RunState, depth 1, with the
 *     first encounter generated.
 *   - `step(state, choice)` — resolve one player action against the
 *     current encounter. Returns the new state, narration to render, and
 *     engine-level events (LootDropped / RoomCleared / BossCleared).
 *   - `advance(state)` — advance to the next room (or the boss) after the
 *     current encounter is cleared and any loot has been minted.
 *   - `commitLootMint(state)` — clear `pendingLoot` after the UI receipts
 *     the on-chain mint.
 *
 * Determinism: every randomness source is a sub-rng derived from
 * `state.rngSeed` plus the current `(depth, stepInRoom)` salt. That makes
 * each step independently reconstructible from the run seed — no global
 * RNG state to thread.
 *
 * RNG counter accounting: `stepInRoom` increments on every action the
 * player takes inside a room. Room generation uses `stepInRoom = 0`.
 */

import type {
  ActionChoice,
  AssetCard,
  CombatState,
  EncounterState,
  EngineEvent,
  LootRoll,
  NarrationLine,
  Preset,
  RoomTemplate,
  RunState,
  StepResult,
} from "./types";
import { createRng, type Rng } from "./rng";
import { resolveRound } from "./combat";
import { checkPhaseTransition, createBossEncounter } from "./boss";
import {
  pickArchetype,
  pickCombatChoiceMode,
  pickMonster,
  resolveHazard,
  rollDiscoveryOutcomes,
} from "./encounter";
import { pickSlot, rollLoot, type RealmSchemas } from "./loot";
import type { Difficulty } from "./tier";
import { getFlavorBank } from "../flavor";
import { pickVariant, render } from "./narration";
import type { FlavorBank } from "../flavor/types";

/** Depth at which the per-realm boss arrives. */
export const BOSS_DEPTH = 6;

/**
 * Derive a sub-seed from (rngSeed, depth, stepInRoom). XOR-in the salts
 * to the last 12 bytes of the seed — the cascade-mix loader in rng.ts
 * fans single-byte changes back across every lane.
 */
function subSeed(
  seed: `0x${string}`,
  depth: number,
  step: number,
): `0x${string}` {
  const hex = seed.slice(2);
  const head = hex.slice(0, 40);
  const tailDepth = BigInt("0x" + hex.slice(40, 56)) ^ BigInt(depth);
  const tailStep = BigInt("0x" + hex.slice(56, 64)) ^ BigInt(step);
  const tailDepthHex = tailDepth.toString(16).padStart(16, "0");
  const tailStepHex = tailStep.toString(16).padStart(8, "0");
  return ("0x" + head + tailDepthHex + tailStepHex) as `0x${string}`;
}

function rngFor(state: RunState, step: number): Rng {
  return createRng(subSeed(state.rngSeed, state.depth, step));
}

function equippedFor(state: RunState): { weapon?: AssetCard; armor?: AssetCard } {
  return { weapon: state.equipped.weapon, armor: state.equipped.armor };
}

function playerStartHp(equipped: RunState["equipped"]): {
  hp: number;
  maxHp: number;
  ac: number;
} {
  const baseHp = 25;
  const baseAc = 10;
  const hpBonus = equipped.armor?.hpBonus ?? 0;
  const acBonus = equipped.armor?.acBonus ?? 0;
  return { hp: baseHp + hpBonus, maxHp: baseHp + hpBonus, ac: baseAc + acBonus };
}

function difficultyFor(depth: number, isBoss: boolean): Difficulty {
  if (isBoss) return "boss";
  if (depth <= 1) return "trivial";
  return "standard";
}

/** Picks a room template at the given depth from the bank. */
function pickRoomTemplate(
  rng: Rng,
  bank: FlavorBank,
  depth: number,
): RoomTemplate {
  const candidates = bank.roomTemplates.filter((r) => r.depth === depth);
  if (candidates.length === 0) {
    // Fall back to the closest depth — preset-authoring bug.
    const all = [...bank.roomTemplates].sort(
      (a, b) => Math.abs(a.depth - depth) - Math.abs(b.depth - depth),
    );
    if (all.length === 0) {
      throw new Error("pickRoomTemplate: bank has no roomTemplates");
    }
    return all[0]!;
  }
  return candidates[rng.nextInt(candidates.length)]!;
}

/** Generate the encounter at the current depth. */
function generateEncounter(
  state: RunState,
  bossId?: string,
): {
  encounter: EncounterState;
  lines: NarrationLine[];
  roomTemplate?: RoomTemplate;
} {
  const bank = getFlavorBank(state.preset);
  const rng = rngFor(state, 0);
  const lines: NarrationLine[] = [];

  // Boss room.
  if (state.depth >= BOSS_DEPTH) {
    if (!bossId) throw new Error("generateEncounter: bossId required at BOSS_DEPTH");
    const boss = bank.bosses[bossId];
    if (!boss) throw new Error(`generateEncounter: unknown bossId "${bossId}"`);
    const player = playerStartHp(state.equipped);
    const combat = createBossEncounter({
      boss,
      playerHp: player.hp,
      playerMaxHp: player.maxHp,
      playerAc: player.ac,
    });
    lines.push({
      text: `${boss.name} blocks your path.`,
      emphasis: "drama",
    });
    return {
      encounter: { kind: "combat", archetype: "combat", combat, choice: "tactical" },
      lines,
    };
  }

  // Regular room.
  const room = pickRoomTemplate(rng, bank, state.depth);
  const archetype = pickArchetype(rng);
  lines.push({ text: pickVariant(bank.rooms, room.narrationKey, rng), emphasis: "info" });

  if (archetype === "combat") {
    const pool = room.monsterPool ?? bank.roomTemplates.flatMap((r) => r.monsterPool ?? []);
    const roomForPick: RoomTemplate = { ...room, monsterPool: pool };
    const monster = pickMonster(rng, roomForPick, bank.monsters);
    const player = playerStartHp(state.equipped);
    const combat: CombatState = {
      playerHp: player.hp,
      playerMaxHp: player.maxHp,
      playerAc: player.ac,
      monster,
      monsterHp: monster.hp,
      bracedThisTurn: false,
      bleedStacks: 0,
      suppressedEffects: [],
      turn: 0,
    };
    return {
      encounter: {
        kind: "combat",
        archetype: "combat",
        combat,
        choice: pickCombatChoiceMode(rng),
      },
      lines,
      roomTemplate: room,
    };
  }

  if (archetype === "hazard") {
    return {
      encounter: { kind: "hazard", archetype: "hazard", pendingResolve: true },
      lines,
      roomTemplate: room,
    };
  }

  // discovery — two flavor options. We use refund/lore variants as the options
  // shown to the player; the index mapping (refund vs lore outcome) is
  // randomized in `step` via `rollDiscoveryOutcomes`.
  const optionA = pickVariant(bank.rooms, room.narrationKey, rng);
  const optionB = pickVariant(bank.rooms, room.narrationKey, rng);
  return {
    encounter: {
      kind: "discovery",
      archetype: "discovery",
      options: [optionA, optionB],
    },
    lines,
    roomTemplate: room,
  };
}

export type StartRunArgs = {
  preset: Preset;
  realm: `0x${string}`;
  rngSeed: `0x${string}`;
  equipped: RunState["equipped"];
  /** Required for boss-depth generation; ignored before BOSS_DEPTH. */
  bossId: string;
  schemas: RealmSchemas;
};

/** Internal: schema info is needed by `step` for loot rolls; we stash it on state. */
const SCHEMA_STORE = new WeakMap<RunState, RealmSchemas>();

/** Builds the initial RunState, depth 1, with the first encounter generated. */
export function startRun(args: StartRunArgs): { state: RunState; lines: NarrationLine[] } {
  const baseState: RunState = {
    preset: args.preset,
    realm: args.realm,
    rngSeed: args.rngSeed,
    depth: 1,
    encounter: null,
    equipped: args.equipped,
    bossCleared: false,
    defeated: false,
  };
  const gen = generateEncounter(baseState, args.bossId);
  const state: RunState = { ...baseState, encounter: gen.encounter };
  SCHEMA_STORE.set(state, args.schemas);
  return { state, lines: gen.lines };
}

/**
 * Resolve one player action against the current encounter.
 *
 * Combat: feeds the choice to `resolveRound`, then checks for monster
 * death (drops loot, clears the encounter, emits RoomCleared/BossCleared)
 * or player death (TODO: run-over surface; current behavior returns the
 * state with playerHp=0 and lets the caller route to defeat UI).
 *
 * Hazard: single resolution, drops a T1 loot on success.
 *
 * Discovery: maps the choice index → outcome (refund or lore), no loot
 * roll for the refund path; the lore path tags the NEXT loot drop.
 */
export function step(state: RunState, choice: ActionChoice): StepResult {
  const enc = state.encounter;
  if (!enc) {
    throw new Error("step: no active encounter — call advance() first");
  }

  const schemas = SCHEMA_STORE.get(state);
  if (!schemas) {
    throw new Error("step: missing schemas — state must come from startRun()");
  }

  // We use stepInRoom = combat turn (or 1 for non-combat resolution).
  const rngStep = enc.kind === "combat" ? enc.combat.turn + 1 : 1;
  const rng = rngFor(state, rngStep);
  const equipped = equippedFor(state);
  const events: EngineEvent[] = [];

  if (state.defeated) {
    throw new Error("step: run is over — call startRun() to begin a new run");
  }

  if (enc.kind === "combat") {
    const result = resolveRound(enc.combat, choice, equipped, rng);
    let combat = result.state;
    const lines = [...result.lines];
    const monsterDefeated = result.monsterDefeated;
    const playerDefeated = result.playerDefeated;

    // Phase transition for bosses (only if both combatants are still standing).
    if (!monsterDefeated && !playerDefeated && state.depth >= BOSS_DEPTH) {
      const pt = checkPhaseTransition(combat);
      if (pt.transitioned) {
        combat = pt.state;
        lines.push(...pt.lines);
      }
    }

    if (monsterDefeated) {
      const isBoss = state.depth >= BOSS_DEPTH;
      lines.push({
        text: isBoss ? `${combat.monster.name} falls. The realm is cleared.` : `${combat.monster.name} falls.`,
        emphasis: "drama",
      });
      const loot = rollLoot({
        rng,
        difficulty: difficultyFor(state.depth, isBoss),
        slot: pickSlot(rng),
        schemas,
      });
      events.push({ type: "LootDropped", loot });
      if (isBoss) {
        events.push({ type: "BossCleared", finalHp: combat.playerHp, turns: combat.turn });
      } else {
        events.push({ type: "RoomCleared", depth: state.depth });
      }
      const nextState: RunState = {
        ...state,
        encounter: null,
        pendingLoot: loot,
        bossCleared: state.bossCleared || isBoss,
        ...(isBoss
          ? { bossClearedTimestamp: Date.now(), bossClearedTurns: combat.turn }
          : {}),
      };
      SCHEMA_STORE.set(nextState, schemas);
      return { state: nextState, outcome: lines, events };
    }

    if (playerDefeated) {
      // Roguelike permadeath. Run is over: encounter stays in place so the
      // UI can re-render the last combat frame under the defeat panel, but
      // the terminator flag short-circuits further `step()` calls. No
      // clearReceipt, no boss-clear flag mutation, no loot. Equipped gear
      // is retained — death surrenders progress, not inventory.
      lines.push({
        text: `You fall. ${combat.monster.name} stands over you.`,
        emphasis: "drama",
      });
      events.push({ type: "PlayerDefeated", depth: state.depth, turn: combat.turn });
      const nextState: RunState = {
        ...state,
        encounter: { ...enc, combat },
        defeated: true,
        defeatedAtDepth: state.depth,
        defeatedTurn: combat.turn,
      };
      SCHEMA_STORE.set(nextState, schemas);
      return { state: nextState, outcome: lines, events };
    }

    const nextState: RunState = {
      ...state,
      encounter: { ...enc, combat },
    };
    SCHEMA_STORE.set(nextState, schemas);
    return { state: nextState, outcome: lines, events };
  }

  if (enc.kind === "hazard") {
    const r = resolveHazard(rng, equipped, state.depth);
    const bank = getFlavorBank(state.preset);
    const lines: NarrationLine[] = [];
    if (r.success) {
      lines.push({
        text: pickVariant(
          { success: bank.hazardSuccess as readonly string[], failure: bank.hazardFailure as readonly string[] },
          "success",
          rng,
        ),
        emphasis: "info",
      });
      // T1 loot prize.
      const loot = rollLoot({
        rng,
        difficulty: "trivial",
        slot: pickSlot(rng),
        schemas,
      });
      events.push({ type: "LootDropped", loot });
      events.push({ type: "RoomCleared", depth: state.depth });
      const nextState: RunState = { ...state, encounter: null, pendingLoot: loot };
      SCHEMA_STORE.set(nextState, schemas);
      return { state: nextState, outcome: lines, events };
    } else {
      lines.push({
        text: pickVariant(
          { failure: bank.hazardFailure as readonly string[] },
          "failure",
          rng,
        ),
        emphasis: "damage",
      });
      lines.push({
        text: `You lose ${r.damageOnFail} HP.`,
        emphasis: "damage",
      });
      // Hazard fail still clears the room — the player just takes a hit.
      events.push({ type: "RoomCleared", depth: state.depth });
      // We don't store player HP between rooms in the PoC; the next room
      // re-rolls player HP from equipped armor's hpBonus. Logged in lines.
      const nextState: RunState = { ...state, encounter: null };
      SCHEMA_STORE.set(nextState, schemas);
      return { state: nextState, outcome: lines, events };
    }
  }

  // discovery
  if (enc.kind === "discovery") {
    if (choice.kind !== "discovery") {
      throw new Error("step: discovery encounter requires a discovery choice");
    }
    const outcomes = rollDiscoveryOutcomes(rng);
    const outcome = outcomes[choice.index];
    const bank = getFlavorBank(state.preset);
    const lines: NarrationLine[] = [];
    if (outcome === "refund") {
      lines.push({
        text: pickVariant(
          { refund: bank.discoveryRefund as readonly string[] },
          "refund",
          rng,
        ),
        emphasis: "info",
      });
      events.push({ type: "RoomCleared", depth: state.depth });
    } else {
      lines.push({
        text: pickVariant({ lore: bank.discoveryLore as readonly string[] }, "lore", rng),
        emphasis: "info",
      });
      events.push({ type: "RoomCleared", depth: state.depth });
      // Lore path: no loot, but caller can decide to tag the next mint.
    }
    const nextState: RunState = { ...state, encounter: null };
    SCHEMA_STORE.set(nextState, schemas);
    return { state: nextState, outcome: lines, events };
  }

  throw new Error(`step: unhandled encounter kind`);
}

/**
 * Advance to the next room (or the boss). The caller must ensure the
 * current encounter is cleared and any `pendingLoot` is either minted
 * (call `commitLootMint` first) or explicitly skipped.
 */
export function advance(
  state: RunState,
  bossId: string,
): { state: RunState; lines: NarrationLine[] } {
  if (state.defeated) {
    return { state, lines: [{ text: "The run is over.", emphasis: "drama" }] };
  }
  if (state.bossCleared) {
    return { state, lines: [{ text: "The run is over.", emphasis: "info" }] };
  }
  if (state.encounter) {
    throw new Error("advance: current encounter is still active");
  }
  const next: RunState = { ...state, depth: state.depth + 1 };
  const gen = generateEncounter(next, bossId);
  const out: RunState = { ...next, encounter: gen.encounter };
  const schemas = SCHEMA_STORE.get(state);
  if (schemas) SCHEMA_STORE.set(out, schemas);
  return { state: out, lines: gen.lines };
}

/**
 * Swap one of the player's equipped slots. Returns a new RunState with
 * the new card in `equipped[slot]`, preserves the SCHEMA_STORE binding,
 * and — per — leaves the active `CombatState` untouched
 * (stats lock for the duration of the room). The new gear takes effect
 * the next time `playerStartHp` is invoked (i.e. on the next encounter
 * generated via `advance`).
 *
 * The HUD's `SlotChip` reads from `state.equipped` directly, so the
 * weapon/armor name + tier badges update immediately even while the
 * current room's HP/AC stay frozen.
 */
export function equipItem(
  state: RunState,
  slot: "weapon" | "armor" | "accessory",
  card: AssetCard,
): RunState {
  const next: RunState = {
    ...state,
    equipped: { ...state.equipped, [slot]: card },
  };
  const schemas = SCHEMA_STORE.get(state);
  if (schemas) SCHEMA_STORE.set(next, schemas);
  return next;
}

/** Clear `pendingLoot` after the on-chain mint settles. */
export function commitLootMint(state: RunState): RunState {
  const { pendingLoot: _drop, ...rest } = state;
  const next: RunState = { ...rest, bossCleared: state.bossCleared };
  const schemas = SCHEMA_STORE.get(state);
  if (schemas) SCHEMA_STORE.set(next, schemas);
  return next;
}

// Re-exports for consumers (UI, tests).
export { resolveRound } from "./combat";
export { createRng } from "./rng";
export type { LootRoll };
