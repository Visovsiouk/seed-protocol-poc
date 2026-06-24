/**
 * Tier → mechanical stats and tier-roll distributions. Both tables are
 * verbatim from — change them only by changing the spec.
 *
 * The same tables apply to every preset by design (cross-preset fairness):
 * a T3 Fantasy weapon and a T3 Sci-Fi arm have identical stat profiles,
 * so adapters can map between them without a balance audit.
 */

import type { DamageDie, Slot, Tier } from "./types";
import type { Rng } from "./rng";

export type TierStats = {
  damageDie?: DamageDie;
  attackBonus?: number;
  damageBonus?: number;
  acBonus?: number;
  hpBonus?: number;
};

/**
 * Tier → mechanical power table. Slot determines which fields are set.
 *
 * Weapons get two independent flat bonuses, mirroring the D&D split:
 *   - `attackBonus` is added to the d20 to-hit roll (gates *whether* you hit).
 *   - `damageBonus` is added to the damage die roll (scales *how hard*).
 *
 * Crit doubles only the dice, not `damageBonus` (see combat.ts), so the flat
 * bonus is a stable floor and doesn't blow up on a nat-20.
 */
const WEAPON_STATS: Record<
  Tier,
  { damageDie: DamageDie; attackBonus: number; damageBonus: number }
> = {
  1: { damageDie: 4, attackBonus: 0, damageBonus: 0 },
  2: { damageDie: 6, attackBonus: 1, damageBonus: 1 },
  3: { damageDie: 8, attackBonus: 2, damageBonus: 2 },
  4: { damageDie: 10, attackBonus: 3, damageBonus: 3 },
  5: { damageDie: 12, attackBonus: 4, damageBonus: 4 },
};

const ARMOR_STATS: Record<Tier, { acBonus: number; hpBonus: number }> = {
  1: { acBonus: 1, hpBonus: 5 },
  2: { acBonus: 2, hpBonus: 10 },
  3: { acBonus: 3, hpBonus: 20 },
  4: { acBonus: 4, hpBonus: 35 },
  5: { acBonus: 5, hpBonus: 50 },
};

/** Returns canonical stat fields for a tier+slot. Accessory has none yet. */
export function tierStats(tier: Tier, slot: Slot): TierStats {
  switch (slot) {
    case "weapon":
      return { ...WEAPON_STATS[tier] };
    case "armor":
      return { ...ARMOR_STATS[tier] };
    case "accessory":
      return {};
  }
}

export type Difficulty = "trivial" | "standard" | "deep" | "boss";

/**
 * Tier distribution per encounter difficulty. Tuple sums to 100.
 *
 * Rebalance note (HP-carry era): T1 was re-introduced to `trivial` so
 * depth-1 drops are a mix of "junk" (T1, strictly worse than the d6/+1
 * starter) and "upgrade" (T2). The Hollow Reach is meant to feel like
 * a struggle — early loot churn is part of the difficulty curve, not
 * an instant ladder. Standard drops T2/T3/T4; Boss drops T3+. With
 * starter realms capped at maxTier 2, a `trivial` drop in a starter
 * realm is 70% T1 / 30% T2, and a `standard` drop collapses to all-T2.
 * Player-built realms earn their ceiling from distinct clearers (see
 * `playerRealmMaxTier` in lib/reads/realm-tier.ts).
 */
const TIER_DISTRIBUTION: Record<Difficulty, ReadonlyArray<readonly [Tier, number]>> = {
  trivial: [
    [1, 70],
    [2, 30],
  ],
  standard: [
    [2, 60],
    [3, 30],
    [4, 10],
  ],
  // Delve "deep" band — the pre-boss depth (≥5, below
  // bossDepth) under the push-your-luck loot loop. Strictly richer than
  // `standard`: drops T3 most of the time and opens T4/T5. Under starter
  // realms (maxTier 2) this collapses to all-T2 via `rollTier`'s cap, so
  // the tutorial stays gentle; player-built realms (higher caps) are the
  // place deep loot actually lives — which is the intended pull to push
  // deeper in a realm you can't extract from for free.
  deep: [
    [2, 20],
    [3, 45],
    [4, 30],
    [5, 5],
  ],
  boss: [
    [3, 40],
    [4, 45],
    [5, 15],
  ],
};

/**
 * Per-tier distribution over *how many catalog effects* a drop carries.
 * Each row sums to 100. Drives `rollEffectCount`.
 *
 *   T1: never carries effects — a T1 drop is a pure stat-ladder item,
 *       and most of the time it's a downgrade from the starter d6/+1
 *       weapon. T1 is the "junk drop" floor.
 *   T2: 15% chance of a single effect. At maxTier=2 starter realms
 *       that's ~one effected weapon per ~7 standard drops — the "ooh"
 *       moment stays rare.
 *   T3: 45/45/10 — a coin-flip whether any effect appears, two-effect
 *       drops surface occasionally.
 *   T4: most drops have one effect, a quarter have two.
 *   T5: every drop is effected; one-third stack two effects; a sliver
 *       roll three.
 *
 * The schema's declared `catalogEffects` is treated as a *pool* to draw
 * from (without replacement). When the rolled count exceeds the pool
 * size, we clamp — a 2-effect roll against a 1-effect schema just yields
 * that single effect rather than padding.
 */
const EFFECT_COUNT_DISTRIBUTION: Record<
  Tier,
  ReadonlyArray<readonly [number, number]>
> = {
  1: [[0, 100]],
  2: [
    [0, 85],
    [1, 15],
  ],
  3: [
    [0, 45],
    [1, 45],
    [2, 10],
  ],
  4: [
    [0, 20],
    [1, 55],
    [2, 25],
  ],
  5: [
    [1, 60],
    [2, 35],
    [3, 5],
  ],
};

/**
 * Rolls an effect-count for a drop of the given tier. Pure RNG draw —
 * the *pool clamp* (n vs schema.catalogEffects.length) happens at the
 * caller (`rollLoot`).
 */
export function rollEffectCount(rng: Rng, tier: Tier): number {
  const dist = EFFECT_COUNT_DISTRIBUTION[tier];
  const total = dist.reduce((sum, [, w]) => sum + w, 0);
  const roll = rng.nextInt(total);
  let cumulative = 0;
  for (const [count, weight] of dist) {
    cumulative += weight;
    if (roll < cumulative) return count;
  }
  return dist[dist.length - 1]![0];
}

/**
 * Rolls a tier per the difficulty distribution.
 *
 * `maxTier` (optional) truncates the distribution and renormalizes the
 * remaining weights so they still sum to 100. The probability mass that
 * would have landed on capped tiers is redistributed *proportionally*
 * across the surviving tiers — i.e. a starter-realm `maxTier: 2` `boss`
 * roll gives all 18% T4 + 2% T5 weight to T2/T3 in their original 30:50
 * ratio. This avoids piling every truncated drop onto the highest
 * surviving tier (which would make capped realms drop *more* T3s than
 * uncapped ones at boss depth).
 *
 * If every tier in the distribution is above `maxTier` (impossible with
 * the current tables but defensive), we fall back to `maxTier` itself.
 */
export function rollTier(
  rng: Rng,
  difficulty: Difficulty,
  maxTier?: Tier,
): Tier {
  const base = TIER_DISTRIBUTION[difficulty];
  const dist =
    maxTier === undefined ? base : base.filter(([t]) => t <= maxTier);
  if (dist.length === 0) {
    // No surviving tiers — clamp to the cap.
    return maxTier ?? base[base.length - 1]![0];
  }
  const total = dist.reduce((sum, [, w]) => sum + w, 0);
  const roll = rng.nextInt(total);
  let cumulative = 0;
  for (const [tier, weight] of dist) {
    cumulative += weight;
    if (roll < cumulative) return tier;
  }
  // Unreachable iff weights sum to `total`. Fall back to the last entry.
  return dist[dist.length - 1]![0];
}

/** Exposed for tests — read-only. */
export const _tierTablesForTests = {
  WEAPON_STATS,
  ARMOR_STATS,
  TIER_DISTRIBUTION,
  EFFECT_COUNT_DISTRIBUTION,
};
