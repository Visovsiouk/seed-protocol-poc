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
  CatalogEffectName,
  CombatState,
  DefeatMode,
  Element,
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
  pickMonster,
  planTrial,
  resolveTrial,
} from "./encounter";
import { pickSlot, rollLoot, type RealmSchemas } from "./loot";
import type { Difficulty } from "./tier";
import { getFlavorBank } from "../flavor";
import { pickVariant } from "./narration";
import type { FlavorBank } from "../flavor/types";
import { respawnVoiceFor } from "../story/genesis";

/**
 * Default depth at which the per-realm boss arrives. Realm-specific
 * configs (see `StartRunArgs.bossDepth`) override this — Genesis uses
 * 5 because the Reach is the narrowest skin the Seed ever wore; the
 * other starters and player realms stay at 6.
 */
export const BOSS_DEPTH = 6;

/**
 * Depth at which a Ledger room may appear (once per attempt). When the
 * player has not yet consumed a ledger and an upcoming boss with baked
 * effects is known, this depth's regular encounter is replaced with the
 * Ledger room. Set to 3 — early enough to inform the player, late enough
 * that they've seen a couple of fights.
 *
 * If `bossDepth <= LEDGER_DEPTH`, the ledger override is skipped (the
 * boss arrives too soon to bother).
 */
export const LEDGER_DEPTH = 3;

/**
 * XOR the attempt counter into the run seed so a seed-mercy respawn
 * doesn't deterministically replay the same encounter chain that just
 * killed the player. Only the tail 12 bytes are touched, matching the
 * mask `subSeed` uses for (depth, step) — the cascade-mix loader fans
 * single-byte changes back across every lane.
 */
function reseedForAttempt(
  seed: `0x${string}`,
  attempt: number,
): `0x${string}` {
  if (attempt <= 1) return seed;
  const hex = seed.slice(2);
  const head = hex.slice(0, 40);
  const tail = BigInt("0x" + hex.slice(40, 64)) ^ BigInt(attempt);
  const tailHex = tail.toString(16).padStart(24, "0");
  return ("0x" + head + tailHex) as `0x${string}`;
}

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

/**
 * Picks a room template restricted to combat archetype. Used when we've
 * decided this depth should be a fight (e.g. trial/fork rolled out, or
 * the depth has only combat templates anyway). Falls back to `pickRoomTemplate`
 * if no combat templates exist at this depth.
 */
function pickCombatRoomTemplate(
  rng: Rng,
  bank: FlavorBank,
  depth: number,
): RoomTemplate {
  const combats = bank.roomTemplates.filter(
    (r) => r.depth === depth && r.archetype === "combat",
  );
  if (combats.length === 0) return pickRoomTemplate(rng, bank, depth);
  return combats[rng.nextInt(combats.length)]!;
}

/** Generate the encounter at the current depth. */
function generateEncounter(
  state: RunState,
  bossId: string,
): {
  encounter: EncounterState;
  lines: NarrationLine[];
  roomTemplate?: RoomTemplate;
} {
  const bank = getFlavorBank(state.preset);
  const rng = rngFor(state, 0);
  const lines: NarrationLine[] = [];

  // Boss room.
  if (state.depth >= state.bossDepth) {
    const boss = bank.bosses[bossId];
    if (!boss) throw new Error(`generateEncounter: unknown bossId "${bossId}"`);
    const player = playerStartHp(state.equipped);
    const combat = createBossEncounter({
      boss,
      playerHp: player.hp,
      playerMaxHp: player.maxHp,
      playerAc: player.ac,
      suppressedBakedEffects: state.runSuppressedBossEffects,
    });
    lines.push({
      text: `${boss.name} blocks your path.`,
      emphasis: "drama",
    });
    return {
      encounter: { kind: "combat", archetype: "combat", combat },
      lines,
    };
  }

  // Ledger override at the configured depth, once per attempt. Requires
  // an upcoming boss with both baked effects still in play.
  const boss = bank.bosses[bossId];
  if (
    !state.ledgerConsumed &&
    state.depth === LEDGER_DEPTH &&
    state.bossDepth > LEDGER_DEPTH &&
    boss
  ) {
    lines.push({
      text: pickVariant(
        { ledger: bank.ledgerPrompts as readonly string[] },
        "ledger",
        rng,
      ),
      emphasis: "info",
    });
    return {
      encounter: {
        kind: "ledger",
        archetype: "ledger",
        bossName: boss.name,
        effects: boss.bakedEffects,
      },
      lines,
    };
  }

  // Regular room.
  const room = pickRoomTemplate(rng, bank, state.depth);
  const archetype = pickArchetype(rng);
  lines.push({ text: pickVariant(bank.rooms, room.narrationKey, rng), emphasis: "info" });

  if (archetype === "combat") {
    // Force a combat-tagged template at this depth so monster pools resolve.
    const combatRoom = pickCombatRoomTemplate(rng, bank, state.depth);
    const pool =
      combatRoom.monsterPool ??
      bank.roomTemplates.flatMap((r) => r.monsterPool ?? []);
    const roomForPick: RoomTemplate = { ...combatRoom, monsterPool: pool };
    const monster = pickMonster(rng, roomForPick, bank.monsters);
    const player = playerStartHp(state.equipped);
    const combat: CombatState = {
      playerHp: player.hp,
      playerMaxHp: player.maxHp,
      playerAc: player.ac,
      monster,
      monsterHp: monster.hp,
      bracedThisTurn: false,
      guaranteedDodgeThisTurn: false,
      regenDoubledThisTurn: false,
      thornsDoubledThisTurn: false,
      focusPrimed: false,
      bleedStacks: 0,
      suppressedEffects: [],
      turn: 0,
    };
    return {
      encounter: { kind: "combat", archetype: "combat", combat },
      lines,
      roomTemplate: combatRoom,
    };
  }

  // trial
  const plan = planTrial(rng, equippedFor(state), state.depth);
  const flavor = pickVariant(
    { trial: bank.trialPrompts as readonly string[] },
    "trial",
    rng,
  );
  return {
    encounter: {
      kind: "trial",
      archetype: "trial",
      ability: plan.ability,
      dc: plan.dc,
      bonus: plan.bonus,
      flavor,
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
  /** Required for boss-depth generation; ignored before bossDepth. */
  bossId: string;
  schemas: RealmSchemas;
  /**
   * Depth at which the boss arrives. Defaults to `BOSS_DEPTH` (6).
   * Genesis passes 5 — the Seed's first skin is narrower than the rest.
   */
  bossDepth?: number;
  /**
   * Per-realm death handling. Defaults to `"permadeath"`. Genesis
   * passes `"seed-mercy"`; see `DefeatMode` for the contract.
   */
  defeatMode?: DefeatMode;
  /**
   * If set, the first weapon-slot loot drop of each run-attempt is
   * coerced to this element. Genesis uses `"fire"` (the Hag is weakTo
   * fire; the player finds a pilgrim's blade).
   */
  forcedFirstWeaponElement?: Exclude<Element, "none">;
};

/** Internal: schema info is needed by `step` for loot rolls; we stash it on state. */
const SCHEMA_STORE = new WeakMap<RunState, RealmSchemas>();
/** Internal: bossId stashed with the run so non-boss-depth step() calls can resolve ledger effects. */
const BOSS_STORE = new WeakMap<RunState, string>();

/** Builds the initial RunState, depth 1, with the first encounter generated. */
export function startRun(args: StartRunArgs): { state: RunState; lines: NarrationLine[] } {
  const baseState: RunState = {
    preset: args.preset,
    realm: args.realm,
    rngSeed: args.rngSeed,
    depth: 1,
    bossDepth: args.bossDepth ?? BOSS_DEPTH,
    encounter: null,
    equipped: args.equipped,
    bossCleared: false,
    defeated: false,
    defeatMode: args.defeatMode ?? "permadeath",
    runAttempt: 1,
    forcedFirstWeaponElement: args.forcedFirstWeaponElement,
    firstWeaponDropped: false,
    runSuppressedBossEffects: [],
    ledgerConsumed: false,
  };
  const gen = generateEncounter(baseState, args.bossId);
  const state: RunState = { ...baseState, encounter: gen.encounter };
  SCHEMA_STORE.set(state, args.schemas);
  BOSS_STORE.set(state, args.bossId);
  return { state, lines: gen.lines };
}

/**
 * Resolve one player action against the current encounter. Dispatches on
 * `enc.kind`:
 *   - combat → `resolveRound`, with the new Attack/Secondary surface
 *   - trial  → d20 + bonus vs DC; heal-on-pass / damage-on-fail
 *   - fork   → Forge (HP cost → reroll weapon element) or Cache (free T1 loot)
 *   - ledger → record suppressed boss effects in the run state
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
    if (!monsterDefeated && !playerDefeated && state.depth >= state.bossDepth) {
      const pt = checkPhaseTransition(combat);
      if (pt.transitioned) {
        combat = pt.state;
        lines.push(...pt.lines);
      }
    }

    if (monsterDefeated) {
      const isBoss = state.depth >= state.bossDepth;
      lines.push({
        text: isBoss
          ? `${combat.monster.name} falls. The realm is cleared.`
          : `${combat.monster.name} falls.`,
        emphasis: "drama",
      });
      let loot = rollLoot({
        rng,
        difficulty: difficultyFor(state.depth, isBoss),
        slot: pickSlot(rng),
        schemas,
        preset: state.preset,
      });
      let nextFirstWeaponDropped = state.firstWeaponDropped;
      if (
        loot.slot === "weapon" &&
        !state.firstWeaponDropped &&
        state.forcedFirstWeaponElement
      ) {
        loot = {
          ...loot,
          element: state.forcedFirstWeaponElement,
        };
        nextFirstWeaponDropped = true;
      } else if (loot.slot === "weapon" && !state.firstWeaponDropped) {
        nextFirstWeaponDropped = true;
      }
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
        firstWeaponDropped: nextFirstWeaponDropped,
        ...(isBoss
          ? { bossClearedTimestamp: Date.now(), bossClearedTurns: combat.turn }
          : {}),
      };
      SCHEMA_STORE.set(nextState, schemas);
      const bossId = BOSS_STORE.get(state);
      if (bossId) BOSS_STORE.set(nextState, bossId);
      return { state: nextState, outcome: lines, events };
    }

    if (playerDefeated) {
      // Seed mercy: rewind to depth 1, bump attempt, reseed.
      if (state.defeatMode === "seed-mercy") {
        const nextAttempt = state.runAttempt + 1;
        const voice = respawnVoiceFor(state.preset, nextAttempt);
        lines.push({ text: voice.death, emphasis: "drama" });
        for (const r of voice.respawn) {
          lines.push({ text: r, emphasis: "info" });
        }
        const reseeded = reseedForAttempt(state.rngSeed, nextAttempt);
        const seededBase: RunState = {
          ...state,
          rngSeed: reseeded,
          depth: 1,
          encounter: null,
          runAttempt: nextAttempt,
          firstWeaponDropped: false,
          pendingLoot: undefined,
          // Ledger/suppression state is per-attempt: reset on respawn so
          // the player gets a fresh ledger room and the next boss reads
          // its full bakedEffects again.
          runSuppressedBossEffects: [],
          ledgerConsumed: false,
        };
        SCHEMA_STORE.set(seededBase, schemas);
        const bossId = BOSS_STORE.get(state);
        if (bossId) BOSS_STORE.set(seededBase, bossId);
        const gen = generateEncounter(seededBase, bossId ?? "");
        lines.push(...gen.lines);
        const nextState: RunState = { ...seededBase, encounter: gen.encounter };
        SCHEMA_STORE.set(nextState, schemas);
        if (bossId) BOSS_STORE.set(nextState, bossId);
        return { state: nextState, outcome: lines, events };
      }

      // Permadeath.
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
      const bossId = BOSS_STORE.get(state);
      if (bossId) BOSS_STORE.set(nextState, bossId);
      return { state: nextState, outcome: lines, events };
    }

    const nextState: RunState = {
      ...state,
      encounter: { ...enc, combat },
    };
    SCHEMA_STORE.set(nextState, schemas);
    const bossId = BOSS_STORE.get(state);
    if (bossId) BOSS_STORE.set(nextState, bossId);
    return { state: nextState, outcome: lines, events };
  }

  if (enc.kind === "trial") {
    if (choice.kind !== "trial") {
      throw new Error("step: trial encounter requires a trial choice");
    }
    const plan = { ability: enc.ability, dc: enc.dc, bonus: enc.bonus };
    const r = resolveTrial(rng, plan, state.depth);
    const bank = getFlavorBank(state.preset);
    const lines: NarrationLine[] = [];
    if (r.success) {
      lines.push({
        text: pickVariant(
          { ok: bank.trialSuccess as readonly string[] },
          "ok",
          rng,
        ),
        emphasis: "info",
      });
      lines.push({
        text: `You roll d20 ${r.dieRoll}+${plan.bonus}=${r.total} vs DC ${plan.dc}. You recover ${r.healOnSuccess} HP.`,
        emphasis: "heal",
      });
      events.push({ type: "RoomCleared", depth: state.depth });
      const nextState: RunState = { ...state, encounter: null };
      SCHEMA_STORE.set(nextState, schemas);
      const bossId = BOSS_STORE.get(state);
      if (bossId) BOSS_STORE.set(nextState, bossId);
      return { state: nextState, outcome: lines, events };
    }
    lines.push({
      text: pickVariant(
        { fail: bank.trialFailure as readonly string[] },
        "fail",
        rng,
      ),
      emphasis: "damage",
    });
    lines.push({
      text: `You roll d20 ${r.dieRoll}+${plan.bonus}=${r.total} vs DC ${plan.dc}. You lose ${r.damageOnFail} HP.`,
      emphasis: "damage",
    });
    events.push({ type: "RoomCleared", depth: state.depth });
    const nextState: RunState = { ...state, encounter: null };
    SCHEMA_STORE.set(nextState, schemas);
    const bossId = BOSS_STORE.get(state);
    if (bossId) BOSS_STORE.set(nextState, bossId);
    return { state: nextState, outcome: lines, events };
  }

  if (enc.kind === "ledger") {
    if (choice.kind !== "ledger") {
      throw new Error("step: ledger encounter requires a ledger choice");
    }
    const lines: NarrationLine[] = [];
    const suppress = choice.suppress;
    const runSuppressed: CatalogEffectName[] = suppress
      ? [...state.runSuppressedBossEffects, suppress]
      : [...state.runSuppressedBossEffects];

    if (suppress) {
      lines.push({
        text: `You strike the entry for "${suppress.replace(/_/g, " ")}" from the ledger.`,
        emphasis: "drama",
      });
      lines.push({
        text: `${enc.bossName} will not draw on that power against you.`,
        emphasis: "info",
      });
    } else {
      lines.push({
        text: "You close the ledger without marking it.",
        emphasis: "info",
      });
    }
    events.push({ type: "RoomCleared", depth: state.depth });
    const nextState: RunState = {
      ...state,
      encounter: null,
      runSuppressedBossEffects: runSuppressed,
      ledgerConsumed: true,
    };
    SCHEMA_STORE.set(nextState, schemas);
    const bossId = BOSS_STORE.get(state);
    if (bossId) BOSS_STORE.set(nextState, bossId);
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
  BOSS_STORE.set(out, bossId);
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
  const bossId = BOSS_STORE.get(state);
  if (bossId) BOSS_STORE.set(next, bossId);
  return next;
}

/** Clear `pendingLoot` after the on-chain mint settles. */
export function commitLootMint(state: RunState): RunState {
  const { pendingLoot: _drop, ...rest } = state;
  const next: RunState = { ...rest, bossCleared: state.bossCleared };
  const schemas = SCHEMA_STORE.get(state);
  if (schemas) SCHEMA_STORE.set(next, schemas);
  const bossId = BOSS_STORE.get(state);
  if (bossId) BOSS_STORE.set(next, bossId);
  return next;
}

// Re-exports for consumers (UI, tests).
export { resolveRound, secondaryFor } from "./combat";
export { createRng } from "./rng";
export type { LootRoll };
