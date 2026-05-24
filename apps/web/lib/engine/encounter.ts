/**
 * Encounter generators and non-combat resolvers.
 *
 * Three archetypes:
 *   - combat — handed off to `resolveRound` in combat.ts
 *   - trial  — visible skill check (d20 + armor-derived bonus vs DC). Pass
 *              heals; fail costs HP. Room clears either way.
 *   - ledger — once-per-run beat at a fixed depth before the boss; the
 *              player picks one of the upcoming boss's two baked effects
 *              to suppress for the boss fight (or skips).
 *
 * Boss rooms always pick `combat` (forced by the caller). Everything here
 * is pure: takes an `Rng`, returns decisions. State updates happen in
 * `index.ts` orchestration.
 */

import type {
  AssetCard,
  CombatState,
  EncounterArchetype,
  MonsterDef,
  RoomTemplate,
} from "./types";
import type { Rng } from "./rng";
import { getActiveEffectValue } from "./catalog";

/**
 * Non-boss archetype mix.
 *
 * Base distribution: 80% combat / 20% trial.
 *
 * Rest carve-out: when the player is meaningfully chipped (HP < 85% of
 * maxHp) AND past depth 2 (so the rest mechanic surfaces only after the
 * player has felt attrition), reshape to 60% combat / 20% trial / 20%
 * rest. At full HP rests would heal 0 — degenerate UX — so the carve-out
 * is HP-gated. The 85% threshold and 20% weight were dialed in via the
 * run-mode balance sweep: anything stingier left mean-rests near zero
 * and runs collapsed in depths 4-5 because recovery never surfaced.
 * Ledger rooms are still forced at a specific depth by the caller, not
 * rolled here. Boss rooms are forced to combat by the caller too.
 */
export function pickArchetype(
  rng: Rng,
  ctx: { depth: number; hp: number; maxHp: number },
): Exclude<EncounterArchetype, "ledger"> {
  const chippedEnough = ctx.maxHp > 0 && ctx.hp / ctx.maxHp < 0.85;
  const restEligible = ctx.depth >= 3 && chippedEnough;
  const roll = rng.next();
  if (restEligible) {
    if (roll < 0.6) return "combat";
    if (roll < 0.8) return "trial";
    return "rest";
  }
  return roll < 0.8 ? "combat" : "trial";
}

/**
 * Picks a monster from the room's pool, weighted by depth.
 *
 * Weighting scheme: the room template's `monsterPool` is treated as the
 * candidate set, and each candidate is weighted by `1 / (1 + |monster.hp -
 * targetHp|)` where `targetHp ≈ 4 * depth`. Stronger monsters (higher
 * HP) drift in as depth rises; weak ones still appear sometimes, just less
 * often. The exact curve is a PoC heuristic — the contract is "deeper
 * rooms favor harder monsters."
 *
 * Throws when the pool is empty or any id is unresolvable; both are
 * preset-authoring bugs.
 */
export function pickMonster(
  rng: Rng,
  room: RoomTemplate,
  monsters: Readonly<Record<string, MonsterDef>>,
): MonsterDef {
  const pool = room.monsterPool ?? [];
  if (pool.length === 0) {
    throw new Error(`pickMonster: room "${room.id}" has no monsterPool`);
  }
  const targetHp = 4 * room.depth;
  const candidates = pool.map((id) => {
    const m = monsters[id];
    if (!m) throw new Error(`pickMonster: unknown monster id "${id}"`);
    return { m, weight: 1 / (1 + Math.abs(m.hp - targetHp)) };
  });
  const total = candidates.reduce((acc, c) => acc + c.weight, 0);
  let r = rng.next() * total;
  for (const c of candidates) {
    r -= c.weight;
    if (r <= 0) return c.m;
  }
  return candidates[candidates.length - 1]!.m;
}

export type TrialAbility = "agility" | "endurance";

export type TrialPlan = {
  ability: TrialAbility;
  dc: number;
  bonus: number;
};

/**
 * Computes the player's bonus on a trial roll from equipped armor.
 *
 *   agility   → ceil(dodge_chance / 10)  (a 25% dodge armor gives +3)
 *   endurance → ceil(damage_reduction / 2) + max(0, ceil(hpBonus / 10))
 *
 * Bare armor or no relevant effect → bonus 0; the d20 + DC math still
 * works (a depth-3 trial at DC 11 + 0 bonus is ~50/50).
 */
export function trialBonusFor(
  ability: TrialAbility,
  equipped: { weapon?: AssetCard; armor?: AssetCard },
): number {
  // Synthetic state so getActiveEffectValue can be reused — only reads
  // `suppressedEffects` and we have none in this context.
  const fakeState = { suppressedEffects: [] } as unknown as CombatState;
  if (ability === "agility") {
    const dodge = getActiveEffectValue(fakeState, equipped, "dodge_chance");
    return Math.ceil(dodge / 10);
  }
  const dr = getActiveEffectValue(fakeState, equipped, "damage_reduction");
  const hpBonus = equipped.armor?.hpBonus ?? 0;
  return Math.ceil(dr / 2) + Math.max(0, Math.ceil(hpBonus / 10));
}

/**
 * Builds the trial room's plan. The ability is supplied by the caller
 * (driven by the chosen trial obstacle — see `FlavorBank.trials`), so
 * the prompt ("leap the chasm") always lines up with the check
 * ("agility"). DC scales with depth (8 + depth); bonus is computed off
 * equipped armor and locked at generation time.
 */
export function planTrial(
  ability: TrialAbility,
  equipped: { weapon?: AssetCard; armor?: AssetCard },
  depth: number,
): TrialPlan {
  const dc = 8 + depth;
  const bonus = trialBonusFor(ability, equipped);
  return { ability, dc, bonus };
}

export type TrialResult = {
  success: boolean;
  dieRoll: number;
  total: number;
  /** Heal on success (small reward — depth-scaled). */
  healOnSuccess: number;
  /** HP loss on failure (larger than the success heal — depth-scaled). */
  damageOnFail: number;
};

/**
 * Trial resolver. Rolls d20 + plan.bonus vs plan.dc. The swing is
 * intentionally asymmetric so the roll has real downside risk:
 *
 *   - Pass: heal = 1 + floor(depth / 3)  (small reward)
 *   - Fail: damage = 3 + depth          (real cost, scales harder)
 *
 * At depth 3 that's +2 HP vs −6 HP. Players who can't afford the swing
 * should be feeling the DC, not waved through.
 */
export function resolveTrial(
  rng: Rng,
  plan: TrialPlan,
  depth: number,
): TrialResult {
  const dieRoll = rng.rollDie(20);
  const total = dieRoll + plan.bonus;
  const success = total >= plan.dc;
  return {
    success,
    dieRoll,
    total,
    healOnSuccess: success ? 1 + Math.floor(depth / 3) : 0,
    damageOnFail: success ? 0 : 3 + depth,
  };
}

