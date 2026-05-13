/**
 * Encounter generators and non-combat resolvers.
 *
 * Three archetypes:
 *   - combat   — handed off to `resolveRound` in combat.ts
 *   - hazard   — single-roll, gated by armor's `dodge_chance` (or flat 50%)
 *   - discovery — narrative beat; one of two flavor outcomes is "refund",
 *                 the other is "lore"
 *
 * Boss rooms always pick `combat` (forced by the caller). Tactical-vs-flavor
 * action choices for combat encounters are decided here too (one combat
 * round in three offers Strike/Brace/Flank; the rest just present flavor
 * verbs that all resolve as Strike — see combat.ts).
 *
 * Everything here is pure: takes an `Rng`, returns decisions. State updates
 * happen in `index.ts` orchestration.
 */

import type {
  AssetCard,
  EncounterArchetype,
  MonsterDef,
  RoomTemplate,
} from "./types";
import type { Rng } from "./rng";
import { getActiveEffectValue } from "./catalog";
import type { CombatState } from "./types";

/**
 * Archetype mix — 70% combat / 20% hazard / 10% discovery.
 * Boss rooms are forced to combat by the caller; we don't special-case here.
 */
export function pickArchetype(rng: Rng): EncounterArchetype {
  const r = rng.next();
  if (r < 0.7) return "combat";
  if (r < 0.9) return "hazard";
  return "discovery";
}

/**
 * One combat round in three offers the tactical triplet. Decided
 * per-encounter, not per-round — the encounter's mode is set on creation
 * and never flips mid-encounter.
 */
export function pickCombatChoiceMode(rng: Rng): "tactical" | "flavor" {
  return rng.next() < 1 / 3 ? "tactical" : "flavor";
}

/**
 * Picks a monster from the room's pool, weighted by depth.
 *
 * Weighting scheme: the room template's `monsterPool` is treated as the
 * candidate set, and each candidate is weighted by `1 / (1 + |monster.hp -
 * targetHp|)` where `targetHp ≈ 8 + depth * 4`. Stronger monsters (higher
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

export type HazardResult = {
  success: boolean;
  /** Dodge chance used in the roll, in [0, 1]. 0.5 when no armor effect. */
  rollChance: number;
  /** Damage taken on failure (small, scaled to depth). */
  damageOnFail: number;
};

/**
 * Hazard resolver. One roll, gated by the equipped armor's
 * `dodge_chance` (catalog field) — or a flat 50% if no relevant effect is
 * present.
 *
 * `damageOnFail` scales with depth: 2 + floor(depth / 2). Caps at the
 * player's current HP minus 1 in the caller (we don't kill the player on
 * a hazard fail — they lose HP, run continues; the loot table doesn't
 * award a hazard-fail prize).
 */
export function resolveHazard(
  rng: Rng,
  equipped: { weapon?: AssetCard; armor?: AssetCard },
  depth: number,
): HazardResult {
  // Build a synthetic CombatState shim because getActiveEffectValue wants
  // one. Hazards don't carry combat state, but the only field it reads is
  // suppressedEffects (which is empty here).
  const fakeState = { suppressedEffects: [] } as unknown as CombatState;
  const dodge = getActiveEffectValue(fakeState, equipped, "dodge_chance");
  const rollChance = dodge > 0 ? Math.min(1, dodge / 100) : 0.5;
  const success = rng.chance(rollChance);
  const damageOnFail = 2 + Math.floor(depth / 2);
  return { success, rollChance, damageOnFail };
}

export type DiscoveryOutcome = "refund" | "lore";

/**
 * Discovery resolver. Player picks between two flavor-equivalent
 * options; one is the "refund" outcome (small emission-budget refund visible
 * to the realm), the other is "lore" (small extraField appended to the next
 * minted item). The mapping is randomized per encounter so neither option
 * is consistently better.
 *
 * Returns a 2-tuple where `outcomes[i]` corresponds to player choice index i.
 */
export function rollDiscoveryOutcomes(
  rng: Rng,
): [DiscoveryOutcome, DiscoveryOutcome] {
  return rng.chance(0.5) ? ["refund", "lore"] : ["lore", "refund"];
}
