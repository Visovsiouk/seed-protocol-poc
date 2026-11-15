/**
 * The Colophon's stat block.
 *
 * Deliberately **not** in a flavor bank. Every other boss is static data
 * keyed by id, but this one's `baseHp` is the live edition's HP total, which
 * is runtime state — so it is a factory over the edition total rather than a
 * constant, and `startRun({ raidBoss })` takes it directly.
 *
 * Pure and un-marked, so the server (authoritative) and the client (which
 * runs the fight through the same engine) share one definition. One copy
 * matters more than usual here: the client's simulation and any later
 * server-side replay must agree exactly, and two copies would drift the
 * first time the block was tuned.
 *
 * ## Why this pair
 *
 * `damage_reduction` + `thorns`, lifted verbatim from the warden — the only
 * block in the tuned roster where every T5 build resolves inside ~30 rounds.
 * S1 measured the alternatives and they leave live stalemates: a DR+dodge T5
 * tank against the lich-shaped block (ac 14, d6, lifesteal) rides the
 * 300-round loop guard **92%** of the time, and against the dragon-shaped
 * block survives a median of 176 rounds. Thorns is what breaks that — it is
 * unavoidable chip damage that bypasses the player's whole dodge/DR
 * mitigation stack, so the fight always ends.
 *
 * It also makes damage per attempt nearly build-independent (344 offense /
 * 377 tank at a 30-round limit, ~10% apart), which is what lets one HP total
 * be fair to every loadout.
 *
 * And it is thematically exact: the weight of two hundred years absorbing a
 * blow, and the cost of striking something that has been struck before.
 *
 * Re-measure with `scripts/colophon-damage.ts` after any combat change —
 * `scripts/lib/raid-damage.test.ts` fails on drift by design.
 */

import type { BossDef } from "@/lib/engine/types";

/** Stable id. Narration and the codex key off it. */
export const COLOPHON_BOSS_ID = "the_colophon";

/**
 * Build the Colophon for a given edition.
 *
 * `editionHp` becomes `baseHp`, which is what makes the phase transition
 * fire when the *collective* crosses half rather than when one player does
 * — see `createBossEncounter`'s `startHp`.
 */
export function colophonBoss(editionHp: number): BossDef {
  return {
    id: COLOPHON_BOSS_ID,
    // The raid is presented in the fantasy register regardless of which
    // realm a player came from: the Colophon is the book itself, not any
    // one realm's genre.
    preset: "fantasy",
    name: "The Colophon",
    baseHp: editionHp,
    attackDie: 6,
    ac: 15,
    bakedEffects: ["damage_reduction", "thorns"],
    phase2NarrationKey: "colophon_phase2",
    phase2AttackDie: 8,
  };
}

/** Rounds per attempt is flat — see `RAID_TURN_LIMIT` in `lib/env.ts`. */
export const COLOPHON_DEPTH = 1;
