/**
 * Encounter generators. The run is three rooms — easy,
 * elite, boss — and every room is combat, handed off to `resolveRound` in
 * combat.ts. Everything here is pure: takes an `Rng`, returns decisions.
 * State updates happen in `index.ts` orchestration.
 */

import type { MonsterDef, RoomTemplate } from "./types";
import type { Rng } from "./rng";

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
