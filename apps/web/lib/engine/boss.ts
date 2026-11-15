/**
 * Boss encounter helpers — creation + phase-transition check.
 *
 * Boss combat differs from regular monster combat in two places:
 *   1. Bosses carry **baked-in catalog effects** (e.g. Lich: lifesteal+bleed).
 *      Combat resolution reads these via `getMonsterEffectValue` in catalog.ts;
 *      this module doesn't need to do anything special for them. Eight of the
 *      nine catalog names have monster-side call sites; `bleed` does not, so
 *      a boss that bakes it gets nothing from that half of its pair. See the
 *      `combat.ts` module docblock for why that one is left out.
 *   2. At 50% HP, a **phase transition** fires once: the boss's attack die
 *      bumps to `phase2AttackDie` (combat.ts already keys off `bossPhase===2`)
 *      and an optional `phase2SuppressEffect` is added to
 *      `state.suppressedEffects`, removing one player effect for the rest of
 *      the fight. Player-side only: `getMonsterEffectValue` ignores the
 *      list, so naming an effect the boss also bakes suppresses the
 *      player's copy and not the boss's.
 *
 * The phase check is a separate pass, run by the encounter loop *after*
 * `resolveRound` returns and before the next player action. Keeping it out
 * of combat.ts means the round resolver stays focused on one round of
 * Strike/Brace/Flank semantics.
 */

import type { BossDef, CombatState, NarrationLine } from "./types";
import { monsterTitle } from "./narration";

/** The phase threshold, in one place: `monsterHp <= floor(baseHp / 2)`. */
export function phaseThreshold(baseHp: number): number {
  return Math.floor(baseHp / 2);
}

/**
 * Builds the initial CombatState for a boss encounter. `playerAc` includes
 * any equipped-armor bonus the caller has already summed in. The boss always
 * carries both of its baked-in catalog effects.
 *
 * `startHp` exists for the shared-pool raid, where the boss is not met at
 * full health. Pass the **edition total** as `boss.baseHp` and the **current
 * pool** as `startHp`: the transition then fires when the collective crosses
 * half rather than when one player does, so he changes for everyone at once.
 * Omit it and the boss opens at `baseHp`, which is every ordinary encounter.
 *
 * An encounter opening at or below the threshold starts **in phase 2**,
 * already buffed and already suppressing. Deriving that here rather than
 * leaving it to the caller is the point: a caller that forgot would hand the
 * player a phase-1 fight against a half-dead boss, and the bug would look
 * like a balance problem rather than a missing branch. No transition
 * narration is emitted — for a player arriving mid-pool the boss was already
 * like this, and `checkPhaseTransition`'s lines announce a change that did
 * not just happen.
 */
export function createBossEncounter(args: {
  boss: BossDef;
  playerHp: number;
  playerMaxHp: number;
  playerAc: number;
  /** Current pool for a shared-pool fight. Defaults to `boss.baseHp`. */
  startHp?: number;
}): CombatState {
  const boss = args.boss;
  const monsterHp = args.startHp ?? boss.baseHp;
  // `> 0` so a pool already at zero does not read as a live phase-2 fight.
  const openInPhase2 = monsterHp > 0 && monsterHp <= phaseThreshold(boss.baseHp);
  return {
    playerHp: args.playerHp,
    playerMaxHp: args.playerMaxHp,
    playerAc: args.playerAc,
    monster: boss,
    monsterHp,
    bossPhase: openInPhase2 ? 2 : 1,
    bracedThisTurn: false,
    guaranteedDodgeThisTurn: false,
    regenDoubledThisTurn: false,
    thornsDoubledThisTurn: false,
    focusPrimed: false,
    phase2PlayerBuffed: openInPhase2,
    bleedStacks: 0,
    suppressedEffects:
      openInPhase2 && boss.phase2SuppressEffect
        ? [boss.phase2SuppressEffect]
        : [],
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
  const threshold = phaseThreshold(monster.baseHp);
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
    // Rebalance: phase 2 also primes the player. The boss is exposed —
    // bleeding, off-balance — and the player gets +2 to-hit for the
    // rest of the fight. Combined with the unchanged `phase2AttackDie`
    // bump on the boss side, the beat reads as "trade blows harder",
    // not "you die faster". See.
    phase2PlayerBuffed: true,
  };

  const lines: NarrationLine[] = [
    { text: `${monsterTitle(monster)} stops holding back — whatever keeps it is done pretending.`, emphasis: "drama" },
    { text: "You see the opening. Your strikes find purchase.", emphasis: "heal" },
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
