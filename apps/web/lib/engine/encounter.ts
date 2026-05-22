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
 * Non-boss archetype mix — 80% combat / 20% trial. Ledger rooms are
 * forced at a specific depth by the caller, not rolled here. Boss rooms
 * are forced to combat by the caller too.
 */
export function pickArchetype(
  rng: Rng,
): Exclude<EncounterArchetype, "ledger"> {
  return rng.next() < 0.8 ? "combat" : "trial";
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
 * Builds the trial room's plan. DC scales with depth (8 + depth); the
 * ability is picked deterministically off the rng. Bonus is locked in
 * at generation time so the player sees what they're rolling against.
 */
export function planTrial(
  rng: Rng,
  equipped: { weapon?: AssetCard; armor?: AssetCard },
  depth: number,
): TrialPlan {
  const ability: TrialAbility = rng.chance(0.5) ? "agility" : "endurance";
  const dc = 8 + depth;
  const bonus = trialBonusFor(ability, equipped);
  return { ability, dc, bonus };
}

export type TrialResult = {
  success: boolean;
  dieRoll: number;
  total: number;
  /** Heal on success (small, depth-scaled). */
  healOnSuccess: number;
  /** HP loss on failure (small, depth-scaled). */
  damageOnFail: number;
};

/**
 * Trial resolver. Rolls d20 + plan.bonus vs plan.dc. Pass: small heal
 * (2 + floor(depth / 2)). Fail: small HP loss (2 + floor(depth / 2)).
 */
export function resolveTrial(
  rng: Rng,
  plan: TrialPlan,
  depth: number,
): TrialResult {
  const dieRoll = rng.rollDie(20);
  const total = dieRoll + plan.bonus;
  const success = total >= plan.dc;
  const tick = 2 + Math.floor(depth / 2);
  return {
    success,
    dieRoll,
    total,
    healOnSuccess: success ? tick : 0,
    damageOnFail: success ? 0 : tick,
  };
}

