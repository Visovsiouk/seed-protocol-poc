/**
 * Deterministic balance sweep — runs synthetic T1/T2 players against
 * every starter-realm encounter (standard rooms + boss) over N seeds
 * and prints win rate, mean turns to kill, and mean HP remaining.
 *
 * Lives alongside `seed-realms.ts` because it's a tuning tool, not
 * runtime code: there are no on-chain reads, no flag flips, no I/O
 * outside stdout. Re-run after editing `lib/flavor/*.ts` monster stats
 * or `lib/engine/tier.ts` weapon/armor tables to see the impact.
 *
 *   pnpm exec tsx scripts/balance-sweep.ts
 *
 * Methodology:
 *
 *   - Construct synthetic AssetCards at the canonical T1/T2 stat floor
 *     (see `tierStats`). No element, no catalog effects — a clean baseline.
 *   - Drive combat via `resolveRound` directly, looping until the
 *     monster falls or the player drops. Always-Strike strategy (the
 *     engine maps any flavor verb to Strike anyway).
 *   - For bosses, mimic engine phase transitions by calling
 *     `checkPhaseTransition` between rounds.
 *   - Each (preset, depth, tier, monster, seed) combination is one trial.
 *     Trials are deterministic in the seed (sfc32 rng).
 *
 * Output is a markdown table — paste it straight into a tuning
 * note when adjusting bank stats.
 */
/* eslint-disable no-console */

import type {
  AssetCard,
  BossDef,
  CombatState,
  MonsterDef,
  Preset,
  RoomTemplate,
  Tier,
} from "../lib/engine/types";
import { createRng } from "../lib/engine/rng";
import { resolveRound } from "../lib/engine/combat";
import { checkPhaseTransition } from "../lib/engine/boss";
import { tierStats } from "../lib/engine/tier";
import { getFlavorBank } from "../lib/flavor";
import { pickMonster } from "../lib/engine/encounter";

const REALM = "0x0000000000000000000000000000000000000001" as `0x${string}`;
const seedHex = (i: number) =>
  ("0x" + i.toString(16).padStart(64, "0")) as `0x${string}`;

const PRESETS: readonly Preset[] = ["fantasy", "scifi", "cyberpunk"];
/** Mirrors `playerStartHp` in `lib/engine/index.ts`. */
const BASE_HP = 40;
const BASE_AC = 10;
/** Trials per (preset, depth, tier, monster) cell. */
const SEEDS_PER_CELL = 500;
/** Hard turn cap to avoid runaway loops (regen + lifesteal can stalemate). */
const TURN_CAP = 200;

function makeLoadout(tier: Tier): {
  weapon: AssetCard;
  armor: AssetCard;
} {
  const w = tierStats(tier, "weapon");
  const a = tierStats(tier, "armor");
  const baseCard = {
    realm: REALM,
    realmName: "sweep",
    catalogEffects: [] as AssetCard["catalogEffects"],
    extraFields: {},
    metadataURI: "data:sweep",
    preseed: false as const,
  };
  return {
    weapon: {
      ...baseCard,
      tokenId: BigInt(tier) * 100n + 1n,
      schemaId: 1,
      slot: "weapon",
      tier,
      name: `T${tier} Weapon`,
      damageDie: w.damageDie,
      attackBonus: w.attackBonus,
      damageBonus: w.damageBonus,
    },
    armor: {
      ...baseCard,
      tokenId: BigInt(tier) * 100n + 2n,
      schemaId: 2,
      slot: "armor",
      tier,
      name: `T${tier} Armor`,
      acBonus: a.acBonus,
      hpBonus: a.hpBonus,
    },
  };
}

function initialCombat(
  monster: MonsterDef | BossDef,
  loadout: { weapon: AssetCard; armor: AssetCard },
  isBoss: boolean,
): CombatState {
  const hp = BASE_HP + (loadout.armor.hpBonus ?? 0);
  const ac = BASE_AC + (loadout.armor.acBonus ?? 0);
  const monsterHp = "hp" in monster ? monster.hp : (monster as BossDef).baseHp;
  return {
    playerHp: hp,
    playerMaxHp: hp,
    playerAc: ac,
    monster,
    monsterHp,
    bossPhase: isBoss ? 1 : undefined,
    bracedThisTurn: false,
    guaranteedDodgeThisTurn: false,
    regenDoubledThisTurn: false,
    thornsDoubledThisTurn: false,
    focusPrimed: false,
    phase2PlayerBuffed: false,
    bleedStacks: 0,
    suppressedEffects: [],
    turn: 0,
  };
}

type Outcome = {
  win: boolean;
  loss: boolean;
  turns: number;
  finalPlayerHp: number;
};

function simulate(
  monster: MonsterDef | BossDef,
  loadout: { weapon: AssetCard; armor: AssetCard },
  seed: `0x${string}`,
  isBoss: boolean,
): Outcome {
  let combat = initialCombat(monster, loadout, isBoss);
  let turns = 0;
  while (turns < TURN_CAP) {
    // Use a fresh per-turn rng to match the engine's `subSeed(state.rngSeed,
    // depth, stepInRoom)` discipline. Sweeping seeds via turn index keeps
    // the trial deterministic in the outer seed.
    const rng = createRng(seedHex(Number(BigInt(seed) ^ BigInt(turns + 1))));
    const result = resolveRound(
      combat,
      { kind: "attack" },
      { weapon: loadout.weapon, armor: loadout.armor },
      rng,
    );
    combat = result.state;
    turns++;
    if (result.monsterDefeated) {
      return {
        win: true,
        loss: false,
        turns,
        finalPlayerHp: combat.playerHp,
      };
    }
    if (result.playerDefeated) {
      return { win: false, loss: true, turns, finalPlayerHp: 0 };
    }
    if (isBoss) {
      const pt = checkPhaseTransition(combat);
      if (pt.transitioned) combat = pt.state;
    }
  }
  // Stalemate (regen vs low DPS, etc).
  return {
    win: false,
    loss: false,
    turns,
    finalPlayerHp: combat.playerHp,
  };
}

type Summary = {
  trials: number;
  wins: number;
  losses: number;
  stalemates: number;
  meanWinTurns: number;
  meanFinalHp: number;
};

function summarize(outcomes: Outcome[]): Summary {
  const wins = outcomes.filter((o) => o.win);
  const losses = outcomes.filter((o) => o.loss);
  const stalemates = outcomes.filter((o) => !o.win && !o.loss);
  const meanWinTurns =
    wins.length === 0
      ? 0
      : wins.reduce((s, o) => s + o.turns, 0) / wins.length;
  const meanFinalHp =
    wins.length === 0
      ? 0
      : wins.reduce((s, o) => s + o.finalPlayerHp, 0) / wins.length;
  return {
    trials: outcomes.length,
    wins: wins.length,
    losses: losses.length,
    stalemates: stalemates.length,
    meanWinTurns,
    meanFinalHp,
  };
}

function fmtPct(n: number): string {
  return (n * 100).toFixed(1).padStart(5) + "%";
}

function fmtNum(n: number, w = 5): string {
  return n.toFixed(1).padStart(w);
}

function rowSummary(label: string, s: Summary): string {
  const win = s.wins / s.trials;
  const loss = s.losses / s.trials;
  const stale = s.stalemates / s.trials;
  return [
    label.padEnd(28),
    fmtPct(win),
    fmtPct(loss),
    fmtPct(stale),
    fmtNum(s.meanWinTurns),
    fmtNum(s.meanFinalHp),
  ].join("  ");
}

function header(): string {
  return [
    "encounter".padEnd(28),
    "  win%",
    " loss%",
    "stale%",
    "wTurn",
    " wHP",
  ].join("  ");
}

// ---------------------------------------------------------------------------
// Run-mode harness — simulates whole runs (depth 1 → boss) with HP carry
// and advance-heal (+10% maxHp on non-boss transitions, gated to HP<85%).
// The run is now pure combat (easy → elite → boss); there are no
// trial/rest interim rooms. Mirrors the engine post-HP-persistence path.
// Reports run completion %, death-depth histogram, and HP-at-boss-entry
// distribution.
// ---------------------------------------------------------------------------

/** Mirrors `index.ts` advance() heal rate. */
const ADVANCE_HEAL_PCT = 0.1;
/** Mirrors `index.ts` advance() heal gate threshold. */
const ADVANCE_HEAL_GATE = 0.85;
/** Boss depth used by the run simulator. Matches the starters' bossDepth. */
const RUN_BOSS_DEPTH = 3;

type RunOutcome =
  | { kind: "cleared"; hpAtBoss: number; totalTurns: number }
  | { kind: "died"; atDepth: number; totalTurns: number };

/**
 * Simulate one combat encounter at the given depth with carried HP.
 * Returns the post-encounter HP and turn count, or `died` on a loss.
 */
function simulateEncounter(args: {
  preset: Preset;
  depth: number;
  hp: number;
  maxHp: number;
  loadout: { weapon: AssetCard; armor: AssetCard };
  bossId: string;
  seed: `0x${string}`;
}): { hp: number; turns: number; died: boolean } {
  const { preset, depth, hp, maxHp, loadout, seed } = args;
  const bank = getFlavorBank(preset);
  const rooms = bank.roomTemplates.filter(
    (r) => r.depth === depth && r.archetype === "combat",
  );
  const pool = Array.from(
    new Set(rooms.flatMap((r) => r.monsterPool ?? [])),
  );
  if (pool.length === 0) return { hp, turns: 0, died: false };
  const room: RoomTemplate = {
    id: "sim",
    depth,
    archetype: "combat",
    narrationKey: "",
    monsterPool: pool,
  };
  const monster = pickMonster(createRng(seed), room, bank.monsters);
  // Build a CombatState with carried HP rather than the full pool.
  const combat: CombatState = {
    playerHp: hp,
    playerMaxHp: maxHp,
    playerAc: BASE_AC + (loadout.armor.acBonus ?? 0),
    monster,
    monsterHp: monster.hp,
    bracedThisTurn: false,
    guaranteedDodgeThisTurn: false,
    regenDoubledThisTurn: false,
    thornsDoubledThisTurn: false,
    focusPrimed: false,
    phase2PlayerBuffed: false,
    bleedStacks: 0,
    suppressedEffects: [],
    turn: 0,
  };
  return resolveCombat(combat, loadout, seed, false);
}

/** Drive a combat to completion with the given starting state. */
function resolveCombat(
  initial: CombatState,
  loadout: { weapon: AssetCard; armor: AssetCard },
  seed: `0x${string}`,
  isBoss: boolean,
): { hp: number; turns: number; died: boolean } {
  let combat = initial;
  let turns = 0;
  while (turns < TURN_CAP) {
    const rng = createRng(
      seedHex(Number(BigInt(seed) ^ BigInt(turns + 1))),
    );
    const result = resolveRound(
      combat,
      { kind: "attack" },
      { weapon: loadout.weapon, armor: loadout.armor },
      rng,
    );
    combat = result.state;
    turns++;
    if (result.monsterDefeated) {
      return { hp: combat.playerHp, turns, died: false };
    }
    if (result.playerDefeated) {
      return { hp: 0, turns, died: true };
    }
    if (isBoss) {
      const pt = checkPhaseTransition(combat);
      if (pt.transitioned) combat = pt.state;
    }
  }
  // Stalemate counts as a loss for run-mode (player can't progress).
  return { hp: combat.playerHp, turns, died: true };
}

function simulateRun(
  preset: Preset,
  loadout: { weapon: AssetCard; armor: AssetCard },
  bossId: string,
  seed: `0x${string}`,
): RunOutcome {
  const maxHp = BASE_HP + (loadout.armor.hpBonus ?? 0);
  let hp = maxHp;
  let totalTurns = 0;

  for (let depth = 1; depth < RUN_BOSS_DEPTH; depth++) {
    const encSeed = seedHex(Number(BigInt(seed) ^ BigInt(depth * 31)));
    const r = simulateEncounter({
      preset,
      depth,
      hp,
      maxHp,
      loadout,
      bossId,
      seed: encSeed,
    });
    hp = r.hp;
    totalTurns += r.turns;
    if (r.died) {
      return { kind: "died", atDepth: depth, totalTurns };
    }

    // Inter-room trickle heal (skip into boss, gated to chipped players).
    const nextDepth = depth + 1;
    if (nextDepth < RUN_BOSS_DEPTH && hp / maxHp < ADVANCE_HEAL_GATE) {
      const heal = Math.floor(maxHp * ADVANCE_HEAL_PCT);
      hp = Math.min(hp + heal, maxHp);
    }
  }

  // Boss fight at RUN_BOSS_DEPTH.
  const bank = getFlavorBank(preset);
  const boss = bank.bosses[bossId];
  if (!boss) throw new Error(`simulateRun: unknown bossId "${bossId}"`);
  const bossCombat: CombatState = {
    playerHp: hp,
    playerMaxHp: maxHp,
    playerAc: BASE_AC + (loadout.armor.acBonus ?? 0),
    monster: boss,
    monsterHp: boss.baseHp,
    bossPhase: 1,
    bracedThisTurn: false,
    guaranteedDodgeThisTurn: false,
    regenDoubledThisTurn: false,
    thornsDoubledThisTurn: false,
    focusPrimed: false,
    phase2PlayerBuffed: false,
    bleedStacks: 0,
    suppressedEffects: [],
    turn: 0,
  };
  const hpAtBoss = hp;
  const bossSeed = seedHex(Number(BigInt(seed) ^ BigInt(0xb055)));
  const bossResult = resolveCombat(bossCombat, loadout, bossSeed, true);
  totalTurns += bossResult.turns;
  if (bossResult.died) {
    return { kind: "died", atDepth: RUN_BOSS_DEPTH, totalTurns };
  }
  return { kind: "cleared", hpAtBoss, totalTurns };
}

function runRunMode(seedsPerCell: number): void {
  console.log("\n# Run-mode sweep — full d1→boss (easy → elite → boss) with HP carry, +10% advance-heal (gated <85%)");
  for (const preset of PRESETS) {
    const bossId = STARTER_BOSSES[preset];
    for (const tier of [1, 2] as Tier[]) {
      const loadout = makeLoadout(tier);
      const outcomes: RunOutcome[] = [];
      for (let i = 0; i < seedsPerCell; i++) {
        const seed = seedHex(i + 70000 + tier * 1000);
        outcomes.push(simulateRun(preset, loadout, bossId, seed));
      }
      const cleared = outcomes.filter((o) => o.kind === "cleared");
      const died = outcomes.filter((o) => o.kind === "died");
      const deathDepths: Record<number, number> = {};
      for (const d of died) {
        const k = (d as { atDepth: number }).atDepth;
        deathDepths[k] = (deathDepths[k] ?? 0) + 1;
      }
      const clearedHps = cleared
        .map((o) => (o as { hpAtBoss: number }).hpAtBoss)
        .sort((a, b) => a - b);
      const medianHpAtBoss =
        clearedHps.length === 0
          ? 0
          : clearedHps[Math.floor(clearedHps.length / 2)]!;
      console.log(
        `\n## ${preset} · T${tier} loadout · ${seedsPerCell} runs vs ${bossId}`,
      );
      console.log(
        `  cleared: ${fmtPct(cleared.length / outcomes.length)}  ` +
          `(median HP at boss: ${medianHpAtBoss}/${BASE_HP + (loadout.armor.hpBonus ?? 0)})`,
      );
      const sortedDepths = Object.keys(deathDepths)
        .map(Number)
        .sort((a, b) => a - b);
      if (sortedDepths.length > 0) {
        const parts = sortedDepths.map((d) => {
          const label = d === RUN_BOSS_DEPTH ? "boss" : `d${d}`;
          return `${label}=${fmtPct(deathDepths[d]! / outcomes.length).trim()}`;
        });
        console.log(`  death-depths: ${parts.join(" · ")}`);
      }
    }
  }
}

function runStandardRoom(
  preset: Preset,
  depth: number,
  monsterIds: readonly string[],
  tier: Tier,
): void {
  const bank = getFlavorBank(preset);
  const loadout = makeLoadout(tier);
  console.log(`\n## ${preset} · depth ${depth} · T${tier} loadout`);
  console.log(header());
  for (const id of monsterIds) {
    const monster = bank.monsters[id];
    if (!monster) continue;
    const outcomes: Outcome[] = [];
    for (let i = 0; i < SEEDS_PER_CELL; i++) {
      outcomes.push(
        simulate(monster, loadout, seedHex(i + depth * 10000), false),
      );
    }
    console.log(rowSummary(`  ${monster.name} (${id})`, summarize(outcomes)));
  }
}

function runBoss(preset: Preset, bossId: string, tier: Tier): void {
  const bank = getFlavorBank(preset);
  const boss = bank.bosses[bossId];
  if (!boss) {
    console.log(`\n## ${preset} · boss ${bossId} — MISSING`);
    return;
  }
  const loadout = makeLoadout(tier);
  console.log(`\n## ${preset} · BOSS ${boss.name} · T${tier} loadout`);
  console.log(header());
  const outcomes: Outcome[] = [];
  for (let i = 0; i < SEEDS_PER_CELL; i++) {
    outcomes.push(simulate(boss, loadout, seedHex(i + 60000), true));
  }
  console.log(rowSummary(`  ${boss.name}`, summarize(outcomes)));
}

/**
 * Starter-realm bosses match `STARTER_REALM_BY_PRESET` in
 * `lib/contracts/starter-realms.ts`. Hard-coded here to avoid pulling
 * Next.js path aliases into the script entry.
 */
const STARTER_BOSSES: Record<Preset, string> = {
  fantasy: "forest_hag",
  scifi: "ai_core",
  cyberpunk: "black_ice",
};

/**
 * CLI surface:
 *
 *   pnpm exec tsx scripts/balance-sweep.ts
 *     → full sweep (standard rooms + starter bosses) at T1+T2.
 *
 *   pnpm exec tsx scripts/balance-sweep.ts --bosses
 *     → every boss in every flavor bank at T2 only. Used for tuning
 *       the non-starter (player-realm) boss roster against the
 *        30–55% win-rate band.
 *
 *   pnpm exec tsx scripts/balance-sweep.ts --boss <preset>:<bossId>
 *     → one boss, T1+T2. Quick re-check after tweaking a single stat.
 */
type CliFilter =
  | { kind: "default" }
  | { kind: "all-bosses" }
  | { kind: "single-boss"; preset: Preset; bossId: string }
  | { kind: "run"; seedsPerCell: number };

function parseArgs(argv: string[]): CliFilter {
  if (argv.includes("--mode=run") || argv.includes("--run")) {
    const seedsIdx = argv.indexOf("--seeds");
    const seeds =
      seedsIdx >= 0 && argv[seedsIdx + 1]
        ? Number(argv[seedsIdx + 1])
        : SEEDS_PER_CELL;
    return { kind: "run", seedsPerCell: seeds };
  }
  if (argv.includes("--bosses")) return { kind: "all-bosses" };
  const bossFlagIdx = argv.indexOf("--boss");
  if (bossFlagIdx >= 0) {
    const spec = argv[bossFlagIdx + 1];
    if (!spec) throw new Error("--boss requires <preset>:<bossId>");
    const [preset, bossId] = spec.split(":") as [Preset, string];
    if (!PRESETS.includes(preset)) throw new Error(`unknown preset: ${preset}`);
    if (!bossId) throw new Error(`--boss requires <preset>:<bossId>`);
    return { kind: "single-boss", preset, bossId };
  }
  return { kind: "default" };
}

function runDefaultSweep(): void {
  for (const preset of PRESETS) {
    const bank = getFlavorBank(preset);
    // Three-room shape: depth 1 (easy) and depth 2 (elite). Boss is separate.
    const standardDepths = [1, 2];
    for (const tier of [1, 2] as Tier[]) {
      for (const depth of standardDepths) {
        const rooms = bank.roomTemplates.filter(
          (r) => r.depth === depth && r.archetype === "combat",
        );
        const pool = Array.from(
          new Set(rooms.flatMap((r) => r.monsterPool ?? [])),
        );
        if (pool.length === 0) continue;
        runStandardRoom(preset, depth, pool, tier);
      }
      runBoss(preset, STARTER_BOSSES[preset], tier);
    }
  }
}

function runAllBosses(): void {
  for (const preset of PRESETS) {
    const bank = getFlavorBank(preset);
    for (const bossId of Object.keys(bank.bosses)) {
      runBoss(preset, bossId, 2 as Tier);
    }
  }
}

function main(): void {
  const filter = parseArgs(process.argv.slice(2));
  console.log("# Balance sweep");
  console.log(
    `Methodology: T1/T2 synthetic loadout, always-Strike, ${SEEDS_PER_CELL} seeds/cell, sfc32 rng.`,
  );
  console.log(
    "Columns: win% / loss% / stalemate% / mean turns on win / mean player HP on win.",
  );

  switch (filter.kind) {
    case "default":
      runDefaultSweep();
      break;
    case "all-bosses":
      runAllBosses();
      break;
    case "single-boss":
      runBoss(filter.preset, filter.bossId, 1 as Tier);
      runBoss(filter.preset, filter.bossId, 2 as Tier);
      break;
    case "run":
      runRunMode(filter.seedsPerCell);
      break;
  }
}

main();
