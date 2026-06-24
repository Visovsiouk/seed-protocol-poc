/**
 * One-shot comparison harness: runs the run-mode simulator three times
 * against the same seed set with different inter-room recovery configs,
 * so we can pick the one that best matches the desired "attrition felt"
 * pacing. Intentionally narrow — does not replace balance-sweep.ts.
 *
 *   pnpm exec tsx scripts/heal-variants.ts
 *
 * The run is pure combat (easy → elite → boss); the only recovery lever
 * is the inter-room advance-heal. Variants tested:
 *   A. advance-heal 10%, GATED on hp/maxHp < 0.85
 *   B. advance-heal 15%, no gate
 *   C. no advance-heal (no inter-room recovery at all)
 *
 * Reports per (preset, tier, variant): cleared %, median HP at boss
 * entry, 25th/75th percentile HP at boss entry (so we can see if "you
 * arrived chipped" is reliable or random), and death-depth histogram.
 */
/* eslint-disable no-console */

import type {
  AssetCard,
  CombatState,
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
const STARTER_BOSSES: Record<Preset, string> = {
  fantasy: "forest_hag",
  scifi: "ai_core",
  cyberpunk: "black_ice",
};
const BASE_HP = 40;
const BASE_AC = 10;
const TURN_CAP = 200;
const RUN_BOSS_DEPTH = 3;
const SEEDS_PER_CELL = 500;

type HealConfig = {
  label: string;
  advancePct: number;
  /** When true, only heal if hp/maxHp < 0.85 — i.e. spare full-HP players. */
  gateHeal: boolean;
};

const VARIANTS: readonly HealConfig[] = [
  { label: "A · adv 10% (gated <85%)", advancePct: 0.1, gateHeal: true },
  { label: "B · adv 15% (no gate)", advancePct: 0.15, gateHeal: false },
  { label: "C · no advance-heal", advancePct: 0, gateHeal: false },
];

function makeLoadout(tier: Tier): { weapon: AssetCard; armor: AssetCard } {
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

function resolveCombat(
  initial: CombatState,
  loadout: { weapon: AssetCard; armor: AssetCard },
  seed: `0x${string}`,
  isBoss: boolean,
): { hp: number; turns: number; died: boolean } {
  let combat = initial;
  let turns = 0;
  while (turns < TURN_CAP) {
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
  return { hp: combat.playerHp, turns, died: true };
}

function simulateEncounter(args: {
  preset: Preset;
  depth: number;
  hp: number;
  maxHp: number;
  loadout: { weapon: AssetCard; armor: AssetCard };
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

type RunOutcome =
  | { kind: "cleared"; hpAtBoss: number }
  | { kind: "died"; atDepth: number };

function simulateRun(
  preset: Preset,
  loadout: { weapon: AssetCard; armor: AssetCard },
  bossId: string,
  seed: `0x${string}`,
  cfg: HealConfig,
): RunOutcome {
  const maxHp = BASE_HP + (loadout.armor.hpBonus ?? 0);
  let hp = maxHp;

  for (let depth = 1; depth < RUN_BOSS_DEPTH; depth++) {
    const encSeed = seedHex(Number(BigInt(seed) ^ BigInt(depth * 31)));
    const r = simulateEncounter({
      preset,
      depth,
      hp,
      maxHp,
      loadout,
      seed: encSeed,
    });
    hp = r.hp;
    if (r.died) {
      return { kind: "died", atDepth: depth };
    }

    // Inter-room advance-heal (skip into boss).
    const nextDepth = depth + 1;
    if (nextDepth < RUN_BOSS_DEPTH && cfg.advancePct > 0) {
      const chipped = !cfg.gateHeal || hp / maxHp < 0.85;
      if (chipped) {
        const heal = Math.floor(maxHp * cfg.advancePct);
        hp = Math.min(hp + heal, maxHp);
      }
    }
  }

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
  if (bossResult.died) {
    return { kind: "died", atDepth: RUN_BOSS_DEPTH };
  }
  return { kind: "cleared", hpAtBoss };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(sorted.length * p)),
  );
  return sorted[idx]!;
}

function pct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

function runCell(
  preset: Preset,
  tier: Tier,
  cfg: HealConfig,
): {
  cleared: number;
  p25: number;
  p50: number;
  p75: number;
  deathDepths: Record<number, number>;
  maxHp: number;
} {
  const loadout = makeLoadout(tier);
  const bossId = STARTER_BOSSES[preset];
  const maxHp = BASE_HP + (loadout.armor.hpBonus ?? 0);
  const outcomes: RunOutcome[] = [];
  for (let i = 0; i < SEEDS_PER_CELL; i++) {
    const seed = seedHex(i + 70000 + tier * 1000);
    outcomes.push(simulateRun(preset, loadout, bossId, seed, cfg));
  }
  const cleared = outcomes.filter((o) => o.kind === "cleared");
  // HP-at-boss is sampled across ALL runs for which the player reached
  // the boss room — that's everyone except players who died before d6.
  // For died-at-boss runs we don't know their entering HP from outcome,
  // so we approximate by treating them as "reached boss". To keep this
  // clean we only sample HP-at-boss from runs that *cleared*; the
  // died-at-boss bar shows up in the death histogram instead.
  const hps = cleared
    .map((o) => (o as { hpAtBoss: number }).hpAtBoss)
    .sort((a, b) => a - b);
  const deathDepths: Record<number, number> = {};
  for (const o of outcomes) {
    if (o.kind === "died") {
      deathDepths[o.atDepth] = (deathDepths[o.atDepth] ?? 0) + 1;
    }
  }
  return {
    cleared: cleared.length / outcomes.length,
    p25: percentile(hps, 0.25),
    p50: percentile(hps, 0.5),
    p75: percentile(hps, 0.75),
    deathDepths,
    maxHp,
  };
}

function main(): void {
  console.log("# Advance-heal variant comparison");
  console.log(`Seeds per cell: ${SEEDS_PER_CELL}. Same seed set across variants.`);
  console.log("HP-at-boss percentiles are sampled from runs that *cleared*.\n");

  for (const preset of PRESETS) {
    for (const tier of [1, 2] as Tier[]) {
      console.log(`## ${preset} · T${tier}`);
      for (const cfg of VARIANTS) {
        const r = runCell(preset, tier, cfg);
        const deathParts = Object.keys(r.deathDepths)
          .map(Number)
          .sort((a, b) => a - b)
          .map((d) => {
            const label = d === RUN_BOSS_DEPTH ? "boss" : `d${d}`;
            return `${label}=${pct(r.deathDepths[d]! / SEEDS_PER_CELL)}`;
          })
          .join(" · ");
        console.log(
          `  ${cfg.label.padEnd(28)}  ` +
            `clr ${pct(r.cleared).padStart(6)}  ` +
            `HP@boss p25/p50/p75 = ${r.p25}/${r.p50}/${r.p75} / ${r.maxHp}  ` +
            `deaths: ${deathParts || "—"}`,
        );
      }
      console.log();
    }
  }
}

main();
