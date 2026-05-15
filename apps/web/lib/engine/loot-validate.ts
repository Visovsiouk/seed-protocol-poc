/**
 * Server-side bounds validator for client-submitted `LootRoll`s.
 *
 * The `/api/realm/mint-loot` route receives a fully-stat'd loot drop
 * from the client. Until full replay-from-runSeed verification lands
 * (TODO in route docblock), this module catches the obvious forgeries:
 *
 *   - tier/stat consistency — a T1 weapon can't have a d12 + attack +4.
 *   - catalog effect values inside the per-tier range.
 *   - slot/effect compatibility — armor can't carry `lifesteal`.
 *   - tier vs difficulty — the tier distribution gates which tiers can
 *     drop at each depth; T5 at depth 1 is impossible from real RNG.
 *
 * This is *not* a runSeed-anchored check — a determined attacker who
 * picks bound-consistent values still gets through. But it makes the
 * trivial "send a T5 with crit_chance=99%" exploit fail.
 */

import { WEAPON_EFFECTS, ARMOR_EFFECTS, getEffectSpec } from "./catalog";
import type { CatalogEffect, LootRoll, Slot, Tier } from "./types";
import { tierStats, type Difficulty } from "./tier";

/** Tier sets that the distribution can produce per difficulty. */
const TIERS_BY_DIFFICULTY: Record<Difficulty, ReadonlySet<Tier>> = {
  trivial: new Set([1, 2]),
  standard: new Set([1, 2, 3]),
  boss: new Set([2, 3, 4, 5]),
};

/** Replica of `difficultyFor` in the engine — kept private to keep this module pure. */
function difficultyForDepth(depth: number, isBoss: boolean): Difficulty {
  if (isBoss) return "boss";
  if (depth <= 1) return "trivial";
  return "standard";
}

/**
 * Returns `null` if the LootRoll is internally consistent and could
 * have been produced by `rollLoot` at the given `(depth, isBoss)`;
 * otherwise a short reason string.
 */
export function validateLootRoll(
  loot: LootRoll,
  depth: number,
  isBoss: boolean,
): string | null {
  // 1. Tier matches the difficulty distribution.
  const difficulty = difficultyForDepth(depth, isBoss);
  if (!TIERS_BY_DIFFICULTY[difficulty].has(loot.tier)) {
    return `tier ${loot.tier} cannot drop at depth ${depth} (difficulty=${difficulty})`;
  }

  // 2. Tier/slot stat fields are exactly what the canonical table says.
  const expected = tierStats(loot.tier, loot.slot);
  if (loot.slot === "weapon") {
    if (loot.damageDie !== expected.damageDie) {
      return `weapon damageDie ${loot.damageDie} != tier ${loot.tier} canonical d${expected.damageDie}`;
    }
    if (loot.attackBonus !== expected.attackBonus) {
      return `weapon attackBonus ${loot.attackBonus} != tier ${loot.tier} canonical +${expected.attackBonus}`;
    }
    if (loot.acBonus !== undefined || loot.hpBonus !== undefined) {
      return `weapon has armor-slot fields set`;
    }
  } else if (loot.slot === "armor") {
    if (loot.acBonus !== expected.acBonus) {
      return `armor acBonus ${loot.acBonus} != tier ${loot.tier} canonical +${expected.acBonus}`;
    }
    if (loot.hpBonus !== expected.hpBonus) {
      return `armor hpBonus ${loot.hpBonus} != tier ${loot.tier} canonical +${expected.hpBonus}`;
    }
    if (loot.damageDie !== undefined || loot.attackBonus !== undefined) {
      return `armor has weapon-slot fields set`;
    }
  } else {
    return `slot ${loot.slot} not mintable from the engine`;
  }

  // 3. Catalog effects: each effect must belong to the slot, and its
  //    value must fall inside the per-tier range (or equal 1 for Bool).
  for (const eff of loot.catalogEffects) {
    const err = validateEffect(eff, loot.slot, loot.tier);
    if (err) return err;
  }

  return null;
}

function validateEffect(
  eff: CatalogEffect,
  slot: Slot,
  tier: Tier,
): string | null {
  const spec = getEffectSpec(eff.name);
  if (!spec) return `unknown catalog effect "${eff.name}"`;

  const slotTable = slot === "weapon" ? WEAPON_EFFECTS : ARMOR_EFFECTS;
  if (slotTable[eff.name] === undefined) {
    return `effect "${eff.name}" is not valid for slot ${slot}`;
  }

  const range = spec.range[tier];
  if (range === null) {
    // Bool effect.
    if (eff.value !== 1) {
      return `bool effect "${eff.name}" must have value 1 (got ${eff.value})`;
    }
    return null;
  }
  const [lo, hi] = range;
  if (!Number.isInteger(eff.value) || eff.value < lo || eff.value > hi) {
    return `effect "${eff.name}" value ${eff.value} outside tier ${tier} range [${lo}, ${hi}]`;
  }
  return null;
}
