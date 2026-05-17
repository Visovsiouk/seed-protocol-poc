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

export type Difficulty = "trivial" | "standard" | "boss";

/** — Tier distribution per encounter difficulty. Tuple sums to 100. */
const TIER_DISTRIBUTION: Record<Difficulty, ReadonlyArray<readonly [Tier, number]>> = {
  trivial: [
    [1, 90],
    [2, 10],
  ],
  standard: [
    [1, 50],
    [2, 35],
    [3, 15],
  ],
  boss: [
    [2, 30],
    [3, 50],
    [4, 18],
    [5, 2],
  ],
};

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
};
