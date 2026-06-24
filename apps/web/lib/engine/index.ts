/**
 * Public engine API. Three entry points:
 *
 *   - `startRun({...})` — build an initial RunState, depth 1, with the
 *     first encounter generated.
 *   - `step(state, choice)` — resolve one player action against the
 *     current encounter. Returns the new state, narration to render, and
 *     engine-level events (LootDropped / RoomCleared / BossCleared).
 *   - `advance(state)` — Descend: advance to the next room (or the boss)
 *     after the current encounter is cleared. Cleared-room loot lives in
 *     `state.escrow` (unminted) until the run banks.
 *   - `extract(state)` — Extract: end the run a banked success; the UI
 *     batch-mints `state.escrow`.
 *   - `commitExtraction(state)` — clear `escrow` after the UI receipts the
 *     on-chain batch mint.
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
import { pickMonster } from "./encounter";
import { pickSlot, rollLoot, type RealmSchemas } from "./loot";
import type { Difficulty } from "./tier";
import { getFlavorBank } from "../flavor";
import { monsterTitle, pickVariant } from "./narration";
import type { FlavorBank } from "../flavor/types";

/**
 * Default depth at which the per-realm boss arrives, used when a realm
 * config omits `StartRunArgs.bossDepth`. The starters all pass 3 (the
 * three-room easy → elite → boss shape); this default only covers
 * player/community realms that don't specify their own depth.
 */
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

export function playerStartHp(equipped: RunState["equipped"]): {
  hp: number;
  maxHp: number;
  ac: number;
} {
  // Rebalance (HP-carry era): baseHp lifted to 40. Per-encounter
  // resets used to make 30 viable, but with persistent HP the player
  // walks into the boss having absorbed 5 rooms of damage, and 30
  // collapsed the boss-clear rate to ~3%. At 40 the pool can absorb
  // attrition (≈ 5-8 HP/room with reverted attackDies) and still
  // arrive at the boss above 50%. T1-only paths remain walled at
  // depth 4-5 by the d8 mobs there. See
  // `scripts/balance-sweep.ts --mode=run`.
  const baseHp = 40;
  const baseAc = 10;
  const hpBonus = equipped.armor?.hpBonus ?? 0;
  const acBonus = equipped.armor?.acBonus ?? 0;
  return { hp: baseHp + hpBonus, maxHp: baseHp + hpBonus, ac: baseAc + acBonus };
}

function difficultyFor(
  depth: number,
  isBoss: boolean,
  bossDepth: number,
): Difficulty {
  // Delve depth→tier escalation. Depth 1 is the easy room
  // (trivial). The room immediately before the boss is the "elite" room and
  // rolls in the richer "deep" band; anything between is "standard". For the
  // three-room starters (bossDepth 3) this resolves to trivial → deep → boss
  // (easy → elite → boss). For longer realms it preserves the prior curve:
  // depth 1 trivial, deep only on the pre-boss depth, standard in between.
  if (isBoss) return "boss";
  if (depth <= 1) return "trivial";
  if (depth >= bossDepth - 1) return "deep";
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
 * Picks a room template restricted to combat archetype — the only
 * archetype now that every non-boss room is a fight. Falls back to
 * `pickRoomTemplate` if no combat templates exist at this depth.
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
      // Persistent HP carry: player arrives at the boss with whatever
      // pool they had at the end of the previous room (not at max).
      playerHp: state.playerHp,
      playerMaxHp: state.playerMaxHp,
      playerAc: player.ac,
    });
    lines.push({
      text: `${monsterTitle(boss)} blocks your path.`,
      emphasis: "drama",
    });
    return {
      encounter: { kind: "combat", archetype: "combat", combat },
      lines,
    };
  }

  // Regular room — always combat. Depth 1 is the easy room; the depth right
  // before the boss is the elite (tougher monster pool + richer "deep" loot
  // band, see `difficultyFor`).
  const combatRoom = pickCombatRoomTemplate(rng, bank, state.depth);
  const pool =
    combatRoom.monsterPool ??
    bank.roomTemplates.flatMap((r) => r.monsterPool ?? []);
  const roomForPick: RoomTemplate = { ...combatRoom, monsterPool: pool };
  const monster = pickMonster(rng, roomForPick, bank.monsters);
  const player = playerStartHp(state.equipped);
  lines.push({
    text: pickVariant(bank.rooms, combatRoom.narrationKey, rng),
    emphasis: "info",
  });
  const combat: CombatState = {
    // Persistent HP carry: room-to-room HP carries from `state.playerHp`.
    // `playerMaxHp` is the run cap (re-pinned by equipItem). AC still
    // comes from current equipment.
    playerHp: state.playerHp,
    playerMaxHp: state.playerMaxHp,
    playerAc: player.ac,
    monster,
    monsterHp: monster.hp,
    bracedThisTurn: false,
    guaranteedDodgeThisTurn: false,
    regenDoubledThisTurn: false,
    thornsDoubledThisTurn: false,
    focusPrimed: false,
    // Non-boss combats can't trigger phase transitions; this flag stays
    // false but the field is required by the CombatState shape.
    phase2PlayerBuffed: false,
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
   * If set, the first weapon-slot loot drop of the run is coerced to
   * this element. Genesis uses `"fire"` (the Hag is weakTo fire; the
   * player finds a pilgrim's blade).
   */
  forcedFirstWeaponElement?: Exclude<Element, "none">;
};

/** Internal: schema info is needed by `step` for loot rolls; we stash it on state. */
const SCHEMA_STORE = new WeakMap<RunState, RealmSchemas>();
/** Internal: bossId stashed with the run so `advance` can regenerate the boss encounter. */
const BOSS_STORE = new WeakMap<RunState, string>();

/** Builds the initial RunState, depth 1, with the first encounter generated. */
export function startRun(args: StartRunArgs): { state: RunState; lines: NarrationLine[] } {
  const start = playerStartHp(args.equipped);
  const baseState: RunState = {
    preset: args.preset,
    realm: args.realm,
    rngSeed: args.rngSeed,
    depth: 1,
    bossDepth: args.bossDepth ?? BOSS_DEPTH,
    encounter: null,
    equipped: args.equipped,
    playerHp: start.hp,
    playerMaxHp: start.maxHp,
    escrow: [],
    // Depth 1 is always pre-boss for any sane bossDepth, but compute it
    // honestly so a degenerate bossDepth ≤ 1 realm starts non-extractable.
    extractable: 1 < (args.bossDepth ?? BOSS_DEPTH),
    bossCleared: false,
    defeated: false,
    forcedFirstWeaponElement: args.forcedFirstWeaponElement,
    firstWeaponDropped: false,
  };
  const gen = generateEncounter(baseState, args.bossId);
  const state: RunState = { ...baseState, encounter: gen.encounter };
  SCHEMA_STORE.set(state, args.schemas);
  BOSS_STORE.set(state, args.bossId);
  return { state, lines: gen.lines };
}

/**
 * Resolve one player action against the current encounter. The run is now
 * pure combat (easy → elite → boss), so the only encounter kind is
 * `combat`, resolved via `resolveRound` with the Attack/Secondary surface.
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

  // stepInRoom = combat turn (room generation uses 0).
  const rng = rngFor(state, enc.combat.turn + 1);
  const equipped = equippedFor(state);
  const events: EngineEvent[] = [];

  if (state.defeated) {
    throw new Error("step: run is over — call startRun() to begin a new run");
  }

  {
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
          ? `${monsterTitle(combat.monster)} falls. The realm is cleared.`
          : `${monsterTitle(combat.monster)} falls.`,
        emphasis: "drama",
      });
      let loot = rollLoot({
        rng,
        difficulty: difficultyFor(state.depth, isBoss, state.bossDepth),
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
        // Persistent HP write-back: the HP the player ended the fight on
        // carries into the next room.
        playerHp: Math.max(0, Math.min(combat.playerHp, state.playerMaxHp)),
        // Delve escrow: every cleared room (boss included) banks its drop
        // into the unminted escrow, tagged with the depth it was found at
        // so the deferred batch mint validates each item against the right
        // difficulty band. On a non-boss clear the player will later choose
        // Descend or Extract; a boss clear is a forced extraction.
        escrow: [...state.escrow, { loot, depth: state.depth, isBoss }],
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
      // Permadeath: a killing blow ends the run. The unbanked escrow is
      // forfeit (it lives on `state` but is never minted), and the UI
      // surfaces the defeat overlay off `defeated`.
      lines.push({
        text: `You fall. ${monsterTitle(combat.monster)} stands over you.`,
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

  throw new Error(`step: unhandled encounter kind`);
}

/**
 * Advance to the next room (or the boss) — the **Descend** half of the
 * delve decision. The caller must ensure the current
 * encounter is cleared; loot found this room is already carried in
 * `state.escrow` and banks only at `extract`/boss clear, so nothing needs
 * committing here.
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

  // Inter-room trickle heal: +10% maxHp when transitioning to a non-boss
  // depth, AND only when the player is meaningfully chipped (HP/maxHp <
  // 85%). Skipped on entry to the boss room — the boss is supposed to
  // close on a chipped player. Rounds down (10% of 40-base = 4 HP).
  //
  // The "<85%" gate has two jobs: (1) kills the spammy "+0 HP" / "+1 HP"
  // narration lines on rooms where the player took no damage, and (2)
  // keeps the breath-catching narrative beat meaningful — when it
  // appears, you really did just survive something. Prior 25-30% rates
  // (always-on) topped near-full players up to capacity and made the
  // run feel friction-free; the rest archetype (+50% maxHp on demand)
  // is the heavier recovery lever the run is balanced around. See the
  // heal-variants comparison in scripts/heal-variants.ts.
  const nextDepth = state.depth + 1;
  const isEnteringBoss = nextDepth >= state.bossDepth;
  const healPct = 0.1;
  const chippedEnough =
    state.playerMaxHp > 0 && state.playerHp / state.playerMaxHp < 0.85;
  const healAmount =
    isEnteringBoss || !chippedEnough
      ? 0
      : Math.floor(state.playerMaxHp * healPct);
  const healedHp = Math.min(state.playerHp + healAmount, state.playerMaxHp);
  const actualHeal = healedHp - state.playerHp;
  const lines: NarrationLine[] = [];
  if (actualHeal > 0) {
    lines.push({
      text: `You catch your breath. (+${actualHeal} HP)`,
      emphasis: "heal",
    });
  }
  const next: RunState = {
    ...state,
    depth: nextDepth,
    playerHp: healedHp,
    // The boss room is non-extractable: once you descend into it the only
    // exits are victory (auto-bank) or death (forfeit).
    extractable: nextDepth < state.bossDepth,
  };
  const gen = generateEncounter(next, bossId);
  lines.push(...gen.lines);
  const out: RunState = { ...next, encounter: gen.encounter };
  const schemas = SCHEMA_STORE.get(state);
  if (schemas) SCHEMA_STORE.set(out, schemas);
  BOSS_STORE.set(out, bossId);
  return { state: out, lines };
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
  const nextEquipped = { ...state.equipped, [slot]: card };
  // Re-pin the HP cap from the new armor's hpBonus. Extending the cap
  // does NOT refill the pool — gear upgrade ≠ free heal — but shrinking
  // it (e.g. swapping out a +10HP cuirass for a +5HP one) clamps current
  // HP down so the player can never exceed the new max.
  const repinned = playerStartHp(nextEquipped);
  const newMax = repinned.maxHp;
  const newHp = Math.min(state.playerHp, newMax);
  const next: RunState = {
    ...state,
    equipped: nextEquipped,
    playerHp: newHp,
    playerMaxHp: newMax,
  };
  const schemas = SCHEMA_STORE.get(state);
  if (schemas) SCHEMA_STORE.set(next, schemas);
  const bossId = BOSS_STORE.get(state);
  if (bossId) BOSS_STORE.set(next, bossId);
  return next;
}

/**
 * Extract from the delve. Flags the run a banked
 * success and surfaces the player. The (kept) `escrow` is left intact for
 * the UI to batch-mint; `commitExtraction` clears it once the on-chain mint
 * settles. Callable only between rooms (no active encounter) and only when
 * `extractable` — the boss room cannot be fled.
 *
 * `opts.keep` selects which carried findings to bank, by index into the
 * current `escrow`. Items not listed are *discarded* — dropped from escrow
 * and never minted (the player chose them gone). Omit `keep` to bank
 * everything (the default, all-in extraction). Order is preserved.
 *
 * Returns `{ state, lines, events }` mirroring `step`, so the play page can
 * funnel the narration + an `Extracted` event through the same feed.
 */
export function extract(
  state: RunState,
  opts?: { keep?: readonly number[] },
): { state: RunState; lines: NarrationLine[]; events: EngineEvent[] } {
  if (state.defeated || state.bossCleared || state.extracted) {
    return {
      state,
      lines: [{ text: "The run is over.", emphasis: "info" }],
      events: [],
    };
  }
  if (state.encounter) {
    throw new Error("extract: clear the current encounter before extracting");
  }
  if (!state.extractable) {
    throw new Error("extract: the boss room cannot be fled");
  }
  // Filter to the kept findings (preserving order, ignoring stray indices).
  const keep = opts?.keep ? new Set(opts.keep) : null;
  const keptEscrow = keep
    ? state.escrow.filter((_, i) => keep.has(i))
    : state.escrow;
  const discarded = state.escrow.length - keptEscrow.length;
  const count = keptEscrow.length;
  const lines: NarrationLine[] = [
    count > 0
      ? {
          text:
            discarded > 0
              ? `You surface with ${count} finding${count === 1 ? "" : "s"} in hand, leaving ${discarded} behind.`
              : `You surface with ${count} finding${count === 1 ? "" : "s"} in hand.`,
          emphasis: "drama",
        }
      : { text: "You surface empty-handed.", emphasis: "info" },
  ];
  const next: RunState = {
    ...state,
    escrow: keptEscrow,
    extracted: true,
    extractable: false,
  };
  const schemas = SCHEMA_STORE.get(state);
  if (schemas) SCHEMA_STORE.set(next, schemas);
  const bossId = BOSS_STORE.get(state);
  if (bossId) BOSS_STORE.set(next, bossId);
  return { state: next, lines, events: [{ type: "Extracted", count }] };
}

/** Clear the delve `escrow` after the on-chain batch mint settles. */
export function commitExtraction(state: RunState): RunState {
  const next: RunState = { ...state, escrow: [] };
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
