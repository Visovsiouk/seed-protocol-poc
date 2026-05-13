/**
 * Boss encounter helpers — creation + phase-transition check.
 *
 * Boss combat differs from regular monster combat in two places:
 *   1. Bosses carry **baked-in catalog effects** (e.g. Lich: lifesteal+bleed).
 *      Combat resolution reads these via `getMonsterEffectValue` in catalog.ts;
 *      this module doesn't need to do anything special for them.
 *   2. At 50% HP, a **phase transition** fires once: the boss's attack die
 *      bumps to `phase2AttackDie` (combat.ts already keys off `bossPhase===2`)
 *      and an optional `phase2SuppressEffect` is added to
 *      `state.suppressedEffects`, removing one player effect for the rest of
 *      the fight.
 *
 * The phase check is a separate pass, run by the encounter loop *after*
 * `resolveRound` returns and before the next player action. Keeping it out
 * of combat.ts means the round resolver stays focused on one round of
 * Strike/Brace/Flank semantics.
 */

import type { BossDef, CombatState, NarrationLine } from "./types";

/**
 * Builds the initial CombatState for a boss encounter. `playerAc` includes
 * any equipped-armor bonus the caller has already summed in.
 */
export function createBossEncounter(args: {
  boss: BossDef;
  playerHp: number;
  playerMaxHp: number;
  playerAc: number;
}): CombatState {
  return {
    playerHp: args.playerHp,
    playerMaxHp: args.playerMaxHp,
    playerAc: args.playerAc,
    monster: args.boss,
    monsterHp: args.boss.baseHp,
    bossPhase: 1,
    bracedThisTurn: false,
    bleedStacks: 0,
    suppressedEffects: [],
    turn: 0,
  };
}

export type PhaseTransition = {
  state: CombatState;
  transitioned: boolean;
  /** Flavor bank key for the phase-2 narration, if a transition just fired. */
  narrationKey?: string;
  lines: NarrationLine[];
};

/** Type guard: is the encounter's monster actually a boss? */
function isBoss(m: CombatState["monster"]): m is BossDef {
  return "bakedEffects" in m;
}

/**
 * Checks whether the boss has crossed the 50% HP threshold. Idempotent —
 * already-phase-2 bosses (or non-boss monsters) return the state unchanged
 * with `transitioned: false`.
 *
 * The threshold is `monsterHp <= floor(baseHp / 2)`. We use `<=` and integer
 * floor so a boss with odd HP transitions one tick earlier rather than
 * never (e.g. baseHp 7 → trigger at 3).
 */
export function checkPhaseTransition(state: CombatState): PhaseTransition {
  const monster = state.monster;
  if (!isBoss(monster)) {
    return { state, transitioned: false, lines: [] };
  }
  if (state.bossPhase === 2) {
    return { state, transitioned: false, lines: [] };
  }
  // Defensive: bosses always have bossPhase set in `createBossEncounter`.
  // If for any reason it's missing, treat the boss as phase 1.
  const threshold = Math.floor(monster.baseHp / 2);
  if (state.monsterHp > threshold) {
    return { state, transitioned: false, lines: [] };
  }
  // Dead bosses don't transition — the run-over check happens before this.
  if (state.monsterHp <= 0) {
    return { state, transitioned: false, lines: [] };
  }

  const suppressedEffects = monster.phase2SuppressEffect
    ? [...state.suppressedEffects, monster.phase2SuppressEffect]
    : state.suppressedEffects;

  const next: CombatState = {
    ...state,
    bossPhase: 2,
    suppressedEffects,
  };

  const lines: NarrationLine[] = [
    { text: `The ${monster.name} grows more dangerous.`, emphasis: "drama" },
  ];
  if (monster.phase2SuppressEffect) {
    lines.push({
      text: `Your ${monster.phase2SuppressEffect.replace(/_/g, " ")} stops working.`,
      emphasis: "info",
    });
  }

  return {
    state: next,
    transitioned: true,
    narrationKey: monster.phase2NarrationKey,
    lines,
  };
}
