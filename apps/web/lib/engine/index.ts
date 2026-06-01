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
import { monsterTitle, pickVariant } from "./narration";
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

function difficultyFor(depth: number, isBoss: boolean): Difficulty {
  // Delve depth→tier escalation. Depths 1–4 are
  // unchanged from the pre-delve curve (depth 1 trivial, 2–4 standard) so
  // the tuned early-game balance is untouched; the pre-boss depth (5, and
  // any depth ≥5 below a higher bossDepth) is the new "deep" band, where
  // the loot you're risking on the way down gets meaningfully richer.
  if (isBoss) return "boss";
  if (depth <= 1) return "trivial";
  if (depth <= 4) return "standard";
  return "deep";
}

/**
 * Per-preset flavor for rest encounters. Kept inline (not in flavor banks)
 * because it's a single short string-pair per preset and the rest
 * mechanic isn't preset-authored content the way monsters/rooms are. If
 * a future realm wants custom rest flavor, lift this into `FlavorBank`.
 */
function restFlavorFor(
  preset: Preset,
): ReadonlyArray<{ prompt: string; actionLabel: string }> {
  if (preset === "fantasy") {
    return [
      {
        prompt:
          "An abandoned shrine offers an unguarded breath. You set down your pack.",
        actionLabel: "Make Camp",
      },
      {
        prompt:
          "Sunlight filters through a collapsed ceiling onto soft moss — no claws, no echoes.",
        actionLabel: "Rest a Spell",
      },
    ];
  }
  if (preset === "scifi") {
    return [
      {
        prompt:
          "A dormant maintenance bay. Cooling fans hum; no hostiles on scan.",
        actionLabel: "Patch Up",
      },
      {
        prompt:
          "Telemetry shows a quiet pocket of corridor. Your medkit pings ready.",
        actionLabel: "Medkit",
      },
    ];
  }
  // cyberpunk
  return [
    {
      prompt:
        "A cracked netcafe with no patrons and one working chair. You boot a hostile-free node.",
      actionLabel: "Reboot",
    },
    {
      prompt:
        "An empty rooftop — neon hum, no drones, no eyes. You jack into a clean stream.",
      actionLabel: "Cycle Buffers",
    },
  ];
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
      // Persistent HP carry: player arrives at the boss with whatever
      // pool they had at the end of the previous room (not at max).
      playerHp: state.playerHp,
      playerMaxHp: state.playerMaxHp,
      playerAc: player.ac,
      suppressedBakedEffects: state.runSuppressedBossEffects,
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
  const archetype = pickArchetype(rng, {
    depth: state.depth,
    hp: state.playerHp,
    maxHp: state.playerMaxHp,
  });
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

  if (archetype === "rest") {
    const flavor = restFlavorFor(state.preset);
    const variant = flavor[rng.nextInt(flavor.length)]!;
    // Heal is 50% maxHp, clamped against current HP so the field reflects
    // the actual delta (no "+15 HP" line when only 4 HP was missing).
    const fullHeal = Math.floor(state.playerMaxHp * 0.5);
    const healAmount = Math.min(fullHeal, state.playerMaxHp - state.playerHp);
    lines.push({ text: variant.prompt, emphasis: "info" });
    return {
      encounter: {
        kind: "rest",
        archetype: "rest",
        prompt: variant.prompt,
        actionLabel: variant.actionLabel,
        healAmount,
      },
      lines,
      roomTemplate: room,
    };
  }

  // trial
  const trial = rng.pick(bank.trials);
  const plan = planTrial(trial.ability, equippedFor(state), state.depth);
  return {
    encounter: {
      kind: "trial",
      archetype: "trial",
      ability: plan.ability,
      dc: plan.dc,
      bonus: plan.bonus,
      prompt: trial.prompt,
      intent: trial.intent,
      stakes: trial.stakes,
      onSuccess: trial.onSuccess,
      onFailure: trial.onFailure,
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
          ? `${monsterTitle(combat.monster)} falls. The realm is cleared.`
          : `${monsterTitle(combat.monster)} falls.`,
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
      // Seed mercy: rewind to depth 1, bump attempt, reseed.
      if (state.defeatMode === "seed-mercy") {
        const nextAttempt = state.runAttempt + 1;
        const voice = respawnVoiceFor(state.preset, nextAttempt);
        lines.push({ text: voice.death, emphasis: "drama" });
        for (const r of voice.respawn) {
          lines.push({ text: r, emphasis: "info" });
        }
        const reseeded = reseedForAttempt(state.rngSeed, nextAttempt);
        const respawnStart = playerStartHp(state.equipped);
        const seededBase: RunState = {
          ...state,
          rngSeed: reseeded,
          depth: 1,
          encounter: null,
          // Seed-mercy preserves the escrow (`...state` carries it); only
          // re-open extraction now that we're back at depth 1 pre-boss.
          extractable: state.bossDepth > 1,
          // Persistent HP resets to current-equipment max on respawn —
          // the Seed grows the player back whole. Gear acquired during
          // the failed attempt is retained, so the new pool reflects it.
          playerHp: respawnStart.hp,
          playerMaxHp: respawnStart.maxHp,
          runAttempt: nextAttempt,
          firstWeaponDropped: false,
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

  if (enc.kind === "trial") {
    if (choice.kind !== "trial") {
      throw new Error("step: trial encounter requires a trial choice");
    }
    const plan = { ability: enc.ability, dc: enc.dc, bonus: enc.bonus };
    const r = resolveTrial(rng, plan, state.depth);
    const lines: NarrationLine[] = [];
    // Apply heal/damage to persistent HP. Until HP carry landed these
    // values were narration-only; now they actually move the pool.
    const delta = r.success ? r.healOnSuccess : -r.damageOnFail;
    const nextHp = Math.max(0, Math.min(state.playerHp + delta, state.playerMaxHp));
    if (r.success) {
      lines.push({ text: enc.onSuccess, emphasis: "info" });
      lines.push({
        text: `You roll d20 ${r.dieRoll}+${plan.bonus}=${r.total} vs DC ${plan.dc}. You recover ${r.healOnSuccess} HP.`,
        emphasis: "heal",
      });
    } else {
      lines.push({ text: enc.onFailure, emphasis: "damage" });
      lines.push({
        text: `You roll d20 ${r.dieRoll}+${plan.bonus}=${r.total} vs DC ${plan.dc}. You lose ${r.damageOnFail} HP.`,
        emphasis: "damage",
      });
    }

    // Trial damage can kill — run the same defeat fork combat uses.
    if (nextHp <= 0) {
      if (state.defeatMode === "seed-mercy") {
        const nextAttempt = state.runAttempt + 1;
        const voice = respawnVoiceFor(state.preset, nextAttempt);
        lines.push({ text: voice.death, emphasis: "drama" });
        for (const v of voice.respawn) {
          lines.push({ text: v, emphasis: "info" });
        }
        const reseeded = reseedForAttempt(state.rngSeed, nextAttempt);
        const respawnStart = playerStartHp(state.equipped);
        const seededBase: RunState = {
          ...state,
          rngSeed: reseeded,
          depth: 1,
          encounter: null,
          // Seed-mercy preserves the escrow (`...state` carries it); only
          // re-open extraction now that we're back at depth 1 pre-boss.
          extractable: state.bossDepth > 1,
          playerHp: respawnStart.hp,
          playerMaxHp: respawnStart.maxHp,
          runAttempt: nextAttempt,
          firstWeaponDropped: false,
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
      // Permadeath via trial failure.
      lines.push({ text: "The toll is too steep. You fall.", emphasis: "drama" });
      events.push({ type: "PlayerDefeated", depth: state.depth, turn: 0 });
      const nextState: RunState = {
        ...state,
        encounter: null,
        playerHp: 0,
        defeated: true,
        defeatedAtDepth: state.depth,
        defeatedTurn: 0,
      };
      SCHEMA_STORE.set(nextState, schemas);
      const bossId = BOSS_STORE.get(state);
      if (bossId) BOSS_STORE.set(nextState, bossId);
      return { state: nextState, outcome: lines, events };
    }

    events.push({ type: "RoomCleared", depth: state.depth });
    const nextState: RunState = {
      ...state,
      encounter: null,
      playerHp: nextHp,
    };
    SCHEMA_STORE.set(nextState, schemas);
    const bossId = BOSS_STORE.get(state);
    if (bossId) BOSS_STORE.set(nextState, bossId);
    return { state: nextState, outcome: lines, events };
  }

  if (enc.kind === "rest") {
    if (choice.kind !== "rest") {
      throw new Error("step: rest encounter requires a rest choice");
    }
    const lines: NarrationLine[] = [];
    const heal = Math.min(enc.healAmount, state.playerMaxHp - state.playerHp);
    const nextHp = state.playerHp + heal;
    if (heal > 0) {
      lines.push({
        text: `You patch up and steady yourself. (+${heal} HP)`,
        emphasis: "heal",
      });
    } else {
      lines.push({
        text: "You are already at full strength. You move on.",
        emphasis: "info",
      });
    }
    events.push({ type: "RoomCleared", depth: state.depth });
    const nextState: RunState = {
      ...state,
      encounter: null,
      playerHp: nextHp,
    };
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
 * success and surfaces the player. The `escrow` is left intact for the UI
 * to batch-mint; `commitExtraction` clears it once the on-chain mint
 * settles. Callable only between rooms (no active encounter) and only when
 * `extractable` — the boss room cannot be fled.
 *
 * Returns `{ state, lines, events }` mirroring `step`, so the play page can
 * funnel the narration + an `Extracted` event through the same feed.
 */
export function extract(
  state: RunState,
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
  const count = state.escrow.length;
  const lines: NarrationLine[] = [
    count > 0
      ? {
          text: `You surface with ${count} finding${count === 1 ? "" : "s"} in hand.`,
          emphasis: "drama",
        }
      : { text: "You surface empty-handed.", emphasis: "info" },
  ];
  const next: RunState = { ...state, extracted: true, extractable: false };
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
