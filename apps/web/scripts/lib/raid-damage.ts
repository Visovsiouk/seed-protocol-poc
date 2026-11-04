/**
 * Raid damage-distribution harness — S1 of the Colophon plan.
 *
 * Measures how much damage a single attempt takes off a shared, effectively
 * bottomless HP pool, across many run seeds.
 *
 * **What it is for.** An edition's HP total is not a number to pick and
 * then hope about; it is `median damage per attempt × how many attempts
 * the edition should take`. Only the first factor is measurable, and only
 * once a turn limit is chosen, because the turn limit is what ends most
 * attempts. So this answers two linked questions:
 *
 *   1. **What turn limit?** S6 ties it to the tier of the surrendered
 *      entry item. The distribution says where it wants to sit: at or
 *      above median survival, death is the usual ending and "dying
 *      contributes" means something; well below it, the limit is the only
 *      ending and no one ever dies. `turnsSurvived` on each cell is the
 *      number that decides it.
 *
 *   2. **What HP total?** Median damage at that limit, times the attempt
 *      count you want. Read off the distribution, not inferred from d12+4.
 *
 * The figure that matters is **attempts-to-kill**, not HP. HP is just
 * attempts-to-kill multiplied out, and it is the less legible of the two:
 * an edition sized for hundreds of attempts moves the bar a fraction of a
 * percent per fight and never falls on a demo server, so nobody sees the
 * kill, the contributor list, or the felled-editions record — the parts
 * that most need exercising. `editionSizing` in `colophon-damage.ts`
 * reports the percentage the bar moves per attempt alongside the total,
 * because that is the figure a reader can sanity-check.
 *
 * This is a measuring instrument, not product code: no routes, no db, no
 * chain, no I/O beyond the caller's stdout. It lives in the repo so the
 * same code re-measures after any combat change — that is the whole point
 * of keeping it rather than throwing it away.
 *
 * ## What it simulates
 *
 * S6 of the plan specifies the raid fight as `startRun({ bossDepth: 1 })` —
 * a single boss room, no descent, no loot path. `startRun` can't be called
 * directly yet because it resolves `bossId` against a static flavor bank
 * and there is no Colophon in any bank (injecting one is S6's engine
 * change). So this module drives the same loop `step()` drives — real
 * `resolveRound`, real `checkPhaseTransition`, real `playerStartHp`, real
 * `subSeed` imported from the engine rather than copied — against a boss
 * definition supplied by the caller.
 *
 * The RNG discipline is the engine's, exactly: one `Rng` per round, seeded
 * `subSeed(rngSeed, depth=1, turn+1)`. Nothing here re-implements combat.
 *
 * ## What is an assumption, and therefore an input
 *
 * The Colophon's stat block does not exist yet, and damage per attempt
 * depends on it heavily — boss AC sets the player's hit rate, boss
 * `damage_reduction` is subtracted once per *swing* (three times a round
 * against a T5 multi_hit weapon), and the attack die and baked effects set
 * how long the player survives. So the stat block is a *parameter* with
 * four declared profiles lifted from the existing boss roster
 * (`COLOPHON_PROFILES`), and the report is a sensitivity table across them.
 * Any single headline number is conditional on a profile, and the CLI says
 * which.
 *
 * ## Why trajectories rather than one run per turn limit
 *
 * S6 ties the turn limit to the tier of the surrendered entry item, so the
 * turn limit is a design dial that is not yet set. Rather than re-simulate
 * per candidate limit, each attempt records cumulative damage at every
 * checkpoint in `TURN_CHECKPOINTS` as it goes. One pass over the seeds
 * yields the distribution at every turn limit at once.
 *
 * ## The seed-grinding question, settled and set aside
 *
 * `deriveRunSeed`'s nonce is a client timestamp, so a client could
 * brute-force nonces offline and submit its luckiest run — replay would
 * accept it, correctly, because it *is* a legitimate run. Measured: the
 * gain is `spread` (max/median) ≈ 2.2 at 100k nonces, and the last decade
 * of brute force moved it 3%, so even an unbounded grinder lands near 2.5.
 * That is small enough to ignore, and it is dwarfed by the 41× spread
 * across gear and turn limit in the same table.
 *
 * It is still reported — `spread` on every `Distribution`, and
 * `tailGrowth` — because it is nearly free once the distribution exists
 * and because `spread` doubles as the sampling check: it is how you tell
 * whether a cell's `max` has converged or the sample is just too small.
 */

import type {
  ActionChoice,
  AssetCard,
  BossDef,
  CatalogEffect,
  CombatState,
  Tier,
} from "../../lib/engine/types";
import { createRng } from "../../lib/engine/rng";
import { resolveRound, secondaryFor } from "../../lib/engine/combat";
import { checkPhaseTransition } from "../../lib/engine/boss";
import { playerStartHp, subSeed } from "../../lib/engine/index";
import { tierStats } from "../../lib/engine/tier";
import { deriveRunSeed } from "../../lib/engine/run-seed";

/**
 * The raid fight is a single room, so the engine's depth salt is always 1
 * (`startRun` opens at depth 1 and `bossDepth: 1` makes that the boss room).
 */
const RAID_DEPTH = 1;

/**
 * Hard ceiling on rounds per attempt. Not a game rule — a loop guard. Some
 * (profile, loadout) pairs stalemate outright: a `damage_reduction: 4`
 * player against a d6 boss takes ~0 net damage per round while the pool is
 * bottomless, so neither side can end the fight. Attempts that reach this
 * are reported as `capped` so a run where the cap is doing the work is
 * never mistaken for one where death is — and any cell with a non-zero
 * `capped` share is telling you a turn limit is load-bearing, not optional.
 */
export const HARD_TURN_CAP = 300;

/**
 * Turn limits the distribution is reported at. Cumulative damage is
 * snapshotted at each of these, so every one is read off the same
 * simulated attempt. The top entry is `HARD_TURN_CAP` so the unbounded
 * case is always present.
 */
export const TURN_CHECKPOINTS: readonly number[] = [
  5, 10, 20, 30, 50, 100, HARD_TURN_CAP,
];

// ---------------------------------------------------------------------------
// Boss profiles
// ---------------------------------------------------------------------------

export type ProfileName = "roster" | "lethal" | "stonewall" | "hard";

/** A profile plus the pool numbers that shape its phase maths. */
export type RaidBossProfile = {
  name: ProfileName;
  /** Why this stat block, in one line, for the report header. */
  rationale: string;
  boss: BossDef;
};

/**
 * Eight of the nine catalog effects do something when a boss declares
 * them. `bleed` is the exception, and deliberately so: honouring it needs
 * a player-directed DoT counter, and `CombatState.bleedStacks` is
 * monster-directed only.
 *
 * Worth knowing because it was recently not true — until the baked-effects
 * fix, only `armor_pierce`, `crit_chance` and `multi_hit` had monster-side
 * call sites, and the other six were inert. The profiles below are chosen
 * over the live set, so this list is what makes them meaningfully
 * different rather than three spellings of the same fight. If `bleed` ever
 * gains a call site, drop it from here and re-measure.
 */
export const LIVE_BOSS_EFFECTS = [
  "armor_pierce",
  "crit_chance",
  "multi_hit",
  "lifesteal",
  "regen",
  "thorns",
  "dodge_chance",
  "damage_reduction",
] as const;

/** The one catalog effect a boss can declare to no effect. */
export const INERT_BOSS_EFFECTS = ["bleed"] as const;

/**
 * Candidate Colophon stat blocks.
 *
 * The roster in `lib/flavor/*.ts` is the only tuned boss data in the repo —
 * each non-starter entry sits in a measured 30–55% win band against T2 gear
 * (see `scripts/balance-sweep.ts --bosses`) — so three of these four are
 * lifted from it verbatim rather than invented, on every field except
 * `baseHp`.
 *
 * They span the three shapes the roster actually has, which is worth
 * something now that mitigation works on a boss: a near-baseline, a
 * damage-dealer, and a damage-*suppressor*. `stonewall` is the one that
 * matters most for sizing — flat DR comes off every swing, and a T5
 * multi_hit weapon swings three times a round, so it is subtracted three
 * times per round rather than once.
 *
 * `hard` is the one deliberate extrapolation, and it is here because the
 * roster is tuned against T1/T2 gear while the raid is fought at T5: the
 * roster's highest AC, a die step above the roster, two live effects.
 *
 * `baseHp` is a placeholder the caller overrides — the real one is the
 * edition total, because the phase transition keys off `floor(baseHp / 2)`
 * and S6 wants that to fire when the *collective* crosses half. The
 * roster's own `baseHp` values are tuned for a single player meeting the
 * boss once and carry no information here.
 */
export const COLOPHON_PROFILES: Readonly<Record<ProfileName, RaidBossProfile>> =
  {
    roster: {
      name: "roster",
      rationale:
        "lich's block verbatim (ac 14, d6→d8), baked lifesteal+bleed. bleed is the one effect inert on a monster, so this is a near-baseline: one live effect, and it only heals the pool back.",
      boss: {
        id: "colophon_roster",
        preset: "fantasy",
        name: "The Colophon",
        baseHp: 1,
        attackDie: 6,
        ac: 14,
        bakedEffects: ["lifesteal", "bleed"],
        phase2NarrationKey: "colophon_phase2",
        phase2AttackDie: 8,
      },
    },
    lethal: {
      name: "lethal",
      rationale:
        "dragon's block verbatim (ac 14, d6→d8) — multi_hit (two swings a round) + armor_pierce (-2 player AC). Ends attempts in death soonest.",
      boss: {
        id: "colophon_lethal",
        preset: "fantasy",
        name: "The Colophon",
        baseHp: 1,
        attackDie: 6,
        ac: 14,
        bakedEffects: ["multi_hit", "armor_pierce"],
        phase2NarrationKey: "colophon_phase2",
        phase2AttackDie: 8,
      },
    },
    stonewall: {
      name: "stonewall",
      rationale:
        "warden's block verbatim (ac 15, d6→d8) — damage_reduction + thorns. Flat DR off every player swing, and a T5 multi_hit weapon takes it three times a round. The least damage-permissive block in the roster, so the floor on any HP budget.",
      boss: {
        id: "colophon_stonewall",
        preset: "fantasy",
        name: "The Colophon",
        baseHp: 1,
        attackDie: 6,
        ac: 15,
        bakedEffects: ["damage_reduction", "thorns"],
        phase2NarrationKey: "colophon_phase2",
        phase2AttackDie: 8,
      },
    },
    hard: {
      name: "hard",
      rationale:
        "Extrapolated past the roster, which is tuned for T1/T2: ac 15 (roster high), d8→d10 (one step up), multi_hit + crit_chance. The hardest *lethality* block the engine can express today.",
      boss: {
        id: "colophon_hard",
        preset: "fantasy",
        name: "The Colophon",
        baseHp: 1,
        attackDie: 8,
        ac: 15,
        bakedEffects: ["multi_hit", "crit_chance"],
        phase2NarrationKey: "colophon_phase2",
        phase2AttackDie: 10,
      },
    },
  };

// ---------------------------------------------------------------------------
// T5 loadouts
// ---------------------------------------------------------------------------

export type LoadoutName = "bare" | "offense" | "tank";

export type Loadout = {
  name: LoadoutName;
  rationale: string;
  weapon: AssetCard;
  armor: AssetCard;
};

const HARNESS_REALM =
  "0x0000000000000000000000000000000000000001" as `0x${string}`;

function card(
  partial: Pick<AssetCard, "tokenId" | "schemaId" | "slot" | "tier" | "name"> &
    Partial<AssetCard>,
): AssetCard {
  return {
    realm: HARNESS_REALM,
    realmName: "harness",
    catalogEffects: [],
    extraFields: {},
    metadataURI: "data:harness",
    preseed: false,
    ...partial,
  };
}

/** T5 stat floor from the canonical table: d12, +4 to-hit, +4 damage. */
const T5_WEAPON = tierStats(5 satisfies Tier, "weapon");
/** T5 armor: +5 AC, +50 HP — a 90 HP pool off the base 40. */
const T5_ARMOR = tierStats(5 satisfies Tier, "armor");

function t5Weapon(
  name: string,
  effects: CatalogEffect[],
  tokenId: bigint,
): AssetCard {
  return card({
    tokenId,
    schemaId: 1,
    slot: "weapon",
    tier: 5,
    name,
    damageDie: T5_WEAPON.damageDie,
    attackBonus: T5_WEAPON.attackBonus,
    damageBonus: T5_WEAPON.damageBonus,
    catalogEffects: effects,
  });
}

function t5Armor(
  name: string,
  effects: CatalogEffect[],
  tokenId: bigint,
): AssetCard {
  return card({
    tokenId,
    schemaId: 2,
    slot: "armor",
    tier: 5,
    name,
    acBonus: T5_ARMOR.acBonus,
    hpBonus: T5_ARMOR.hpBonus,
    catalogEffects: effects,
  });
}

/**
 * Fixed T5 loadouts. Values are the T5 end of each effect's range in
 * `catalog.ts` — `multi_hit` is [2,2] at T5 so a T5 multi_hit weapon always
 * rolls 2 extra swings; `crit_chance` is [22,25] and `damage_reduction`
 * [4,4]; `dodge_chance` [22,25].
 *
 * `bare` is the arithmetic floor and is **not** a realistic drop: T5's
 * effect-count distribution is 60/35/5 over one/two/three effects, so every
 * real T5 item carries at least one. It is here because it isolates how
 * much of the damage number is the d12+4 stat line and how much is the
 * catalog — which is the difference between tuning the tier table and
 * tuning the catalog.
 *
 * Note the armor choice also picks the Secondary action, via
 * `secondaryFor`: `dodge_chance` → Dodge, `damage_reduction` → Brace, bare
 * armor → Focus. That is why `tank` and `offense` respond differently to
 * the `alternate` strategy.
 */
export const T5_LOADOUTS: Readonly<Record<LoadoutName, Loadout>> = {
  bare: {
    name: "bare",
    rationale:
      "T5 stat line only (d12 +4/+4, +5 AC, +50 HP), no catalog effects. Not a drop that exists — the floor the tier table alone buys.",
    weapon: t5Weapon("T5 Weapon (bare)", [], 501n),
    armor: t5Armor("T5 Armor (bare)", [], 502n),
  },
  offense: {
    name: "offense",
    rationale:
      "Two-effect T5 weapon (multi_hit 2 → 3 swings/round, crit_chance 25), bare armor. Secondary resolves to Focus.",
    weapon: t5Weapon(
      "T5 Weapon (multi_hit, crit)",
      [
        { name: "multi_hit", value: 2 },
        { name: "crit_chance", value: 25 },
      ],
      511n,
    ),
    armor: t5Armor("T5 Armor (bare)", [], 512n),
  },
  tank: {
    name: "tank",
    rationale:
      "multi_hit 2 weapon with a two-effect T5 armor (damage_reduction 4, dodge_chance 25). Survives longest, so it banks the most damage when a turn limit is not the binding constraint. Secondary resolves to Dodge.",
    weapon: t5Weapon("T5 Weapon (multi_hit)", [{ name: "multi_hit", value: 2 }], 521n),
    armor: t5Armor(
      "T5 Armor (DR, dodge)",
      [
        { name: "damage_reduction", value: 4 },
        { name: "dodge_chance", value: 25 },
      ],
      522n,
    ),
  },
};

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

/**
 * `ActionChoice` is a two-member union, so a player's whole input is a
 * bitstring. These are the two endpoints of it: never spend a round
 * defending, or spend every other one. Real play lands between them, so
 * the pair brackets how much the HP budget depends on how well the fight
 * is played — see `bestOf`.
 */
export type StrategyName = "attack" | "alternate";

export const STRATEGIES: readonly StrategyName[] = ["attack", "alternate"];

function choiceFor(strategy: StrategyName, turn: number): ActionChoice {
  if (strategy === "attack") return { kind: "attack" };
  // Secondary on even turns, Attack on odd. With Focus armor this trades a
  // round for an auto-crit; with Dodge armor it trades a round for a free
  // swing absorbed.
  return turn % 2 === 0 ? { kind: "secondary" } : { kind: "attack" };
}

// ---------------------------------------------------------------------------
// One attempt
// ---------------------------------------------------------------------------

export type AttemptOutcome = "died" | "capped" | "felled";

export type Attempt = {
  /** Cumulative damage dealt at each entry of the `checkpoints` passed in. */
  damageAt: readonly number[];
  /** Damage at the moment the attempt ended. */
  damage: number;
  /** Rounds resolved. */
  turns: number;
  outcome: AttemptOutcome;
};

export type AttemptArgs = {
  rngSeed: `0x${string}`;
  boss: BossDef;
  loadout: Loadout;
  strategy: StrategyName;
  /**
   * The edition's total HP. Only used for the phase threshold
   * (`floor(editionHp / 2)`); the pool is never actually exhausted at the
   * scales this harness runs at.
   */
  editionHp: number;
  /**
   * The pool the attempt opens against — S6's `startHp`, distinct from
   * `baseHp`. Set it above `editionHp / 2` to measure phase 1 and at or
   * below to measure phase 2.
   */
  startHp: number;
  checkpoints?: readonly number[];
  hardCap?: number;
};

/**
 * Simulate one attempt. Mirrors the boss-room branch of `step()`: one
 * `Rng` per round from `subSeed(rngSeed, 1, turn + 1)`, `resolveRound`,
 * then `checkPhaseTransition` only when both combatants are still standing.
 */
export function simulateAttempt(args: AttemptArgs): Attempt {
  const checkpoints = args.checkpoints ?? TURN_CHECKPOINTS;
  const hardCap = args.hardCap ?? HARD_TURN_CAP;
  const { loadout, boss, strategy } = args;
  const equipped = { weapon: loadout.weapon, armor: loadout.armor };
  const start = playerStartHp(equipped);

  // Same shape `createBossEncounter` builds, except `monsterHp` is the
  // current shared pool rather than `boss.baseHp` — S6's startHp/baseHp
  // split, which is what makes the phase transition fire on the *edition*
  // crossing half rather than on each attempt.
  let combat: CombatState = {
    playerHp: start.hp,
    playerMaxHp: start.maxHp,
    playerAc: start.ac,
    monster: { ...boss, baseHp: args.editionHp },
    monsterHp: args.startHp,
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
  // An attempt opening at or below the threshold is already in phase 2.
  const opening = checkPhaseTransition(combat);
  if (opening.transitioned) combat = opening.state;

  const damageAt = new Array<number>(checkpoints.length).fill(0);
  let outcome: AttemptOutcome = "capped";
  let turns = 0;

  for (let turn = 0; turn < hardCap; turn++) {
    const rng = createRng(subSeed(args.rngSeed, RAID_DEPTH, combat.turn + 1));
    const result = resolveRound(
      combat,
      choiceFor(strategy, turn),
      equipped,
      rng,
    );
    combat = result.state;
    turns = turn + 1;

    // Regen can push the pool back *above* where the attempt opened, so
    // clamp at 0: an attempt never contributes negative damage.
    const dealt = Math.max(0, args.startHp - combat.monsterHp);
    // Every checkpoint at or past the round just resolved advances to the
    // running total. A checkpoint below it is already frozen at the damage
    // that stood when that round passed, and an attempt that ends early
    // leaves its final damage standing at every later checkpoint — which is
    // what we want, since the turn limit was not what stopped it.
    for (let i = 0; i < checkpoints.length; i++) {
      if (turns <= checkpoints[i]!) damageAt[i] = dealt;
    }

    if (result.monsterDefeated) {
      outcome = "felled";
      break;
    }
    if (result.playerDefeated) {
      outcome = "died";
      break;
    }
    const pt = checkPhaseTransition(combat);
    if (pt.transitioned) combat = pt.state;
  }

  const damage = Math.max(0, args.startHp - combat.monsterHp);
  return { damageAt, damage, turns, outcome };
}

// ---------------------------------------------------------------------------
// Grinding the nonce — the attack, run as the measurement
// ---------------------------------------------------------------------------

export type GrindArgs = {
  player: `0x${string}`;
  blockhash: `0x${string}`;
  /** First nonce; the sweep runs upward from here. */
  nonceStart?: bigint;
  count: number;
};

/**
 * Produce `count` run seeds by holding `player` and `blockhash` fixed and
 * sweeping the nonce — which is how `run-seed.ts` derives a seed in
 * production, where the nonce is the run-start timestamp.
 *
 * Calling the real `deriveRunSeed` rather than fabricating hex is what
 * makes the sample trustworthy: the seeds are distributed exactly like the
 * ones real runs get, and when S2 replaces the nonce with the entry tx
 * hash this harness re-measures the *new* derivation without being edited.
 *
 * It also happens to be, verbatim, what a client brute-forcing nonces
 * offline would do, which is why `tailGrowth` over a prefix of the result
 * answers the grinding question for free.
 */
export function grindSeeds(args: GrindArgs): `0x${string}`[] {
  const start = args.nonceStart ?? 0n;
  const out: `0x${string}`[] = new Array(args.count);
  for (let i = 0; i < args.count; i++) {
    out[i] = deriveRunSeed({
      player: args.player,
      blockhash: args.blockhash,
      nonce: start + BigInt(i),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

/**
 * Nearest-rank quantile on an ascending array. Nearest-rank rather than
 * interpolated because every reported figure is a damage number a real
 * attempt actually produced — an interpolated p99.99 is not a run anyone
 * can have.
 */
export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil(q * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))]!;
}

export type Distribution = {
  n: number;
  min: number;
  median: number;
  mean: number;
  p90: number;
  p99: number;
  p999: number;
  p9999: number;
  max: number;
  /**
   * `max / median`. Two readings: how lucky the luckiest attempt in the
   * sample got, and — because it stops climbing once the sample is big
   * enough — whether `max` has converged or `n` is simply too small.
   */
  spread: number;
};

export function describe(values: readonly number[]): Distribution {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const median = quantile(sorted, 0.5);
  const max = n === 0 ? 0 : sorted[n - 1]!;
  const mean = n === 0 ? 0 : sorted.reduce((s, v) => s + v, 0) / n;
  return {
    n,
    min: n === 0 ? 0 : sorted[0]!,
    median,
    mean,
    p90: quantile(sorted, 0.9),
    p99: quantile(sorted, 0.99),
    p999: quantile(sorted, 0.999),
    p9999: quantile(sorted, 0.9999),
    max,
    spread: median === 0 ? Infinity : max / median,
  };
}

// ---------------------------------------------------------------------------
// A measured cell
// ---------------------------------------------------------------------------

export type CellArgs = {
  profile: RaidBossProfile;
  loadout: Loadout;
  strategy: StrategyName;
  seeds: readonly `0x${string}`[];
  editionHp: number;
  startHp: number;
  checkpoints?: readonly number[];
  hardCap?: number;
};

export type Cell = {
  profile: ProfileName;
  loadout: LoadoutName;
  strategy: StrategyName;
  /** Resolved Secondary label for this loadout's armor, for the report. */
  secondary: string;
  checkpoints: readonly number[];
  /** Distribution of cumulative damage at each checkpoint. */
  byCheckpoint: readonly Distribution[];
  /** Distribution of damage at the attempt's natural end. */
  unbounded: Distribution;
  /** Rounds survived, for reading off where a turn limit stops binding. */
  turnsSurvived: Distribution;
  outcomes: Record<AttemptOutcome, number>;
  /** Per-seed damage at the attempt's natural end, for `bestOf`. */
  perSeedDamage: readonly number[];
  /** Per-seed damage at each checkpoint, for `bestOf`. */
  perSeedByCheckpoint: readonly (readonly number[])[];
};

export function measureCell(args: CellArgs): Cell {
  const checkpoints = args.checkpoints ?? TURN_CHECKPOINTS;
  const byCheckpoint: number[][] = checkpoints.map(() => []);
  const finals: number[] = [];
  const turns: number[] = [];
  const outcomes: Record<AttemptOutcome, number> = {
    died: 0,
    capped: 0,
    felled: 0,
  };

  for (const rngSeed of args.seeds) {
    const attempt = simulateAttempt({
      rngSeed,
      boss: args.profile.boss,
      loadout: args.loadout,
      strategy: args.strategy,
      editionHp: args.editionHp,
      startHp: args.startHp,
      checkpoints,
      hardCap: args.hardCap,
    });
    for (let i = 0; i < checkpoints.length; i++) {
      byCheckpoint[i]!.push(attempt.damageAt[i]!);
    }
    finals.push(attempt.damage);
    turns.push(attempt.turns);
    outcomes[attempt.outcome] += 1;
  }

  return {
    profile: args.profile.name,
    loadout: args.loadout.name,
    strategy: args.strategy,
    secondary: secondaryFor(args.loadout.armor).label,
    checkpoints,
    byCheckpoint: byCheckpoint.map(describe),
    unbounded: describe(finals),
    turnsSurvived: describe(turns),
    outcomes,
    perSeedDamage: finals,
    perSeedByCheckpoint: byCheckpoint,
  };
}

// ---------------------------------------------------------------------------
// Inverting the distribution: attempts-to-kill → HP total
// ---------------------------------------------------------------------------

export type Sizing = {
  attempts: number;
  turnLimit: number;
  /** Median damage per attempt while the pool is above half. */
  phase1Median: number;
  /** Median damage per attempt once it is below. */
  phase2Median: number;
  totalHp: number;
  /** How the attempt budget splits across the two halves. */
  phase1Attempts: number;
  phase2Attempts: number;
  /** Share of the whole pool one phase-1 attempt removes, as a percentage. */
  pctPerAttempt: number;
};

/**
 * The report's inverse: given the attempt count an edition should take,
 * return the HP total to open it with.
 *
 * Worth a function rather than a multiplication because **the two halves of
 * an edition are not the same fight**. At the halfway mark the boss's attack
 * die steps up and the player gains a permanent +2 to hit, so damage per
 * attempt changes — and the flat `median × attempts` table in
 * `colophon-damage.ts` quietly prices the whole pool at the phase-1 rate.
 * The attempt budget is the sum of the two halves:
 *
 *   attempts = (total/2) / phase1Median + (total/2) / phase2Median
 *
 * solved for `total`. That is a harmonic blend, so it sits nearer the
 * *slower* half — which is the right direction for a number whose expensive
 * failure mode is an edition that never falls.
 *
 * Not circular, though it looks it: the phase threshold is
 * `floor(editionHp / 2)` and we are solving for `editionHp`. One attempt
 * never comes close to exhausting the pool at these scales, so damage per
 * attempt does not depend on the pool's size — only on which side of the
 * threshold it is on. Measuring both sides against any large placeholder
 * gives the same two medians the real total would.
 */
export function sizeEdition(args: {
  profile: RaidBossProfile;
  loadout: Loadout;
  strategy: StrategyName;
  seeds: readonly `0x${string}`[];
  turnLimit: number;
  attempts: number;
  /** Large placeholder pool. Only its half-point is used. */
  poolHp?: number;
}): Sizing {
  const poolHp = args.poolHp ?? 1_000_000;
  const common = {
    profile: args.profile,
    loadout: args.loadout,
    strategy: args.strategy,
    seeds: args.seeds,
    editionHp: poolHp,
    checkpoints: [args.turnLimit] as const,
    // The turn limit ends the attempt, so the loop guard must sit above it.
    hardCap: Math.max(HARD_TURN_CAP, args.turnLimit),
  };
  const phase1 = measureCell({ ...common, startHp: poolHp });
  const phase2 = measureCell({ ...common, startHp: Math.floor(poolHp / 2) });

  const d1 = phase1.byCheckpoint[0]!.median;
  const d2 = phase2.byCheckpoint[0]!.median;
  // A zero median means the median attempt cannot scratch this block — no
  // HP total makes the edition fall, so say so rather than returning a
  // number that reads like an answer.
  if (d1 <= 0 || d2 <= 0) {
    throw new Error(
      `cannot size: median damage at ${args.turnLimit} rounds is ` +
        `${d1} (phase 1) / ${d2} (phase 2) for ` +
        `${args.profile.name}/${args.loadout.name}/${args.strategy}`,
    );
  }

  const attemptsPerHp = 0.5 / d1 + 0.5 / d2;
  const totalHp = Math.round(args.attempts / attemptsPerHp);
  return {
    attempts: args.attempts,
    turnLimit: args.turnLimit,
    phase1Median: d1,
    phase2Median: d2,
    totalHp,
    phase1Attempts: totalHp / 2 / d1,
    phase2Attempts: totalHp / 2 / d2,
    pctPerAttempt: (d1 / totalHp) * 100,
  };
}

/**
 * Running max over nested prefixes of the sample — how far the best-found
 * attempt moves as more seeds are tried.
 *
 * Primarily a **convergence check**: `max` and `p99.99` are the least
 * stable figures in any `Distribution`, and this is how you tell whether
 * the sample is big enough to quote them. Once the per-decade gain is a
 * few percent, it is; while it is still climbing steeply, it is not.
 *
 * Because `grindSeeds` sweeps the nonce in order, a prefix is also exactly
 * "a client that gave up brute-forcing earlier", so the same table bounds
 * the grinding question without a second measurement.
 */
export function tailGrowth(
  values: readonly number[],
  sizes: readonly number[],
): { size: number; median: number; max: number; spread: number }[] {
  return sizes
    .filter((s) => s <= values.length)
    .map((size) => {
      const prefix = values.slice(0, size);
      const d = describe(prefix);
      return { size, median: d.median, max: d.max, spread: d.spread };
    });
}

/**
 * Element-wise max over cells sharing a seed list — the damage a player
 * gets by picking the better *strategy* for each seed.
 *
 * Here to answer "does the HP budget have to account for skilled play?"
 * Comparing this against the best single-strategy cell says how much
 * headroom optimal play has over the fixed strategy the budget was sized
 * from. If the two are near-identical, strategy is not a dial and one
 * strategy is enough to size an edition from.
 */
export function bestOf(cells: readonly Cell[]): {
  unbounded: Distribution;
  byCheckpoint: readonly Distribution[];
} {
  if (cells.length === 0) {
    return { unbounded: describe([]), byCheckpoint: [] };
  }
  const first = cells[0]!;
  const n = first.perSeedDamage.length;
  const unbounded: number[] = new Array(n);
  for (let s = 0; s < n; s++) {
    let best = -Infinity;
    for (const c of cells) best = Math.max(best, c.perSeedDamage[s]!);
    unbounded[s] = best;
  }
  const byCheckpoint = first.checkpoints.map((_, i) => {
    const vals: number[] = new Array(n);
    for (let s = 0; s < n; s++) {
      let best = -Infinity;
      for (const c of cells) best = Math.max(best, c.perSeedByCheckpoint[i]![s]!);
      vals[s] = best;
    }
    return describe(vals);
  });
  return { unbounded: describe(unbounded), byCheckpoint };
}
