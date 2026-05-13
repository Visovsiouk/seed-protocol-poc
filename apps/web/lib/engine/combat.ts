/**
 * Combat round resolver. Owns Strike / Brace / Flank semantics (
 *) plus the player→monster and monster→player damage paths with all
 * catalog effects wired in.
 *
 * Turn order, per round:
 *   1. preTurn hook  — regen on the player
 *   2. player action — Strike / Brace / Flank (or flavor-equivalent)
 *   3. monster attack — unless monster died on the player's swing
 *   4. postTurn hook  — bleed DoT ticks down
 *   5. boss phase transition check (boss.ts, called by the caller of resolveRound)
 *
 * Critical: `resolveRound` is a pure function over `(state, choice, rng)`.
 * No mutation of inputs; the returned state replaces the old one.
 */

import {
  applyCatalogEffects,
  getActiveEffectValue,
  getMonsterEffectValue,
} from "./catalog";
import type {
  ActionChoice,
  AssetCard,
  BossDef,
  CombatState,
  MonsterDef,
  NarrationLine,
} from "./types";
import type { Rng } from "./rng";

const D20 = 20;

export type CombatTickResult = {
  state: CombatState;
  lines: NarrationLine[];
  /** True when the monster's HP reached zero during this round. */
  monsterDefeated: boolean;
  /** True when the player's HP reached zero during this round. */
  playerDefeated: boolean;
};

/** A player attack swing. Returns damage dealt (already accounting for crit/pierce). */
function rollPlayerAttack(
  state: CombatState,
  equipped: { weapon?: AssetCard; armor?: AssetCard },
  rng: Rng,
  modifiers: { damageMult?: number; alwaysHit?: boolean } = {},
): { hit: boolean; damage: number; crit: boolean; pierced: boolean } {
  const weapon = equipped.weapon;
  const damageDie = weapon?.damageDie ?? 4; // unarmed fallback: d4
  const attackBonus = weapon?.attackBonus ?? 0;
  const pierce = getActiveEffectValue(state, equipped, "armor_pierce") > 0;
  const monsterAc = pierce ? Math.max(10, state.monster.ac - 2) : state.monster.ac;

  const attackRoll = rng.rollDie(D20) + attackBonus;
  const hit = modifiers.alwaysHit ? true : attackRoll >= monsterAc;
  if (!hit) return { hit: false, damage: 0, crit: false, pierced: pierce };

  const baseDamage = rng.rollDie(damageDie);
  const critChance = getActiveEffectValue(state, equipped, "crit_chance") / 100;
  const crit = critChance > 0 && rng.chance(critChance);
  let damage = crit ? baseDamage * 2 : baseDamage;
  if (modifiers.damageMult !== undefined) {
    damage = Math.floor(damage * modifiers.damageMult);
  }
  // Damage is at least 1 on a hit (a successful attack always hurts).
  damage = Math.max(1, damage);
  return { hit: true, damage, crit, pierced: pierce };
}

/** Applies a player→monster damage event with lifesteal and bleed side-effects. */
function applyPlayerDamage(
  state: CombatState,
  equipped: { weapon?: AssetCard; armor?: AssetCard },
  damage: number,
): { state: CombatState; lifesteal: number; bleedApplied: boolean } {
  const next: CombatState = { ...state };
  next.monsterHp = Math.max(0, next.monsterHp - damage);

  // Lifesteal: heal up to half the damage dealt, capped at the catalog value.
  const lifestealVal = getActiveEffectValue(state, equipped, "lifesteal");
  let lifesteal = 0;
  if (lifestealVal > 0) {
    lifesteal = Math.min(lifestealVal, Math.floor(damage / 2));
    if (lifesteal > 0) {
      next.playerHp = Math.min(next.playerMaxHp, next.playerHp + lifesteal);
    }
  }

  // Bleed: applies a 3-turn DoT stack. We track stacks, not per-stack values —
  // bleed always re-stacks fully on a fresh hit (matches "apply N damage
  // per turn for 3 turns on hit"; consecutive hits refresh the timer).
  const bleedVal = getActiveEffectValue(state, equipped, "bleed");
  const bleedApplied = bleedVal > 0;
  if (bleedApplied) {
    next.bleedStacks = 3;
  }

  return { state: next, lifesteal, bleedApplied };
}

/** Monster swing → player. Honors dodge, damage_reduction, thorns, Brace, monster baked-in effects. */
function rollMonsterAttack(
  state: CombatState,
  equipped: { weapon?: AssetCard; armor?: AssetCard },
  rng: Rng,
): { hit: boolean; damageToPlayer: number; thornsToMonster: number; dodged: boolean; reducedBy: number } {
  // Dodge first.
  const dodge = getActiveEffectValue(state, equipped, "dodge_chance") / 100;
  if (dodge > 0 && rng.chance(dodge)) {
    return { hit: false, damageToPlayer: 0, thornsToMonster: 0, dodged: true, reducedBy: 0 };
  }

  // The monster's attack die comes from the boss's phase-2 bumped die when
  // we're in phase 2 (resolved by boss.ts before this fires).
  const attackDie =
    state.bossPhase === 2 && isBoss(state.monster)
      ? state.monster.phase2AttackDie
      : state.monster.attackDie;

  // Monster baked-in armor_pierce → reduce player AC by 2 (same magnitude as player's pierce).
  const monsterPierce = getMonsterEffectValue(state, "armor_pierce") > 0;
  const effectivePlayerAc =
    (monsterPierce ? Math.max(10, state.playerAc - 2) : state.playerAc) +
    (state.bracedThisTurn ? 2 : 0);

  const attackRoll = rng.rollDie(D20);
  if (attackRoll < effectivePlayerAc) {
    return { hit: false, damageToPlayer: 0, thornsToMonster: 0, dodged: false, reducedBy: 0 };
  }

  let damage = rng.rollDie(attackDie);

  // Monster crit_chance.
  const monsterCrit = getMonsterEffectValue(state, "crit_chance") / 100;
  if (monsterCrit > 0 && rng.chance(monsterCrit)) {
    damage *= 2;
  }

  // Damage reduction.
  const dr = getActiveEffectValue(state, equipped, "damage_reduction");
  const reducedBy = Math.min(dr, damage);
  damage = Math.max(0, damage - dr);

  // Thorns.
  const thorns = getActiveEffectValue(state, equipped, "thorns");

  return {
    hit: true,
    damageToPlayer: damage,
    thornsToMonster: thorns,
    dodged: false,
    reducedBy,
  };
}

function isBoss(m: MonsterDef | BossDef): m is BossDef {
  return "bakedEffects" in m;
}

/**
 * Resolves a full combat round: preTurn → player action → monster attack
 * → postTurn → boss-phase check. Pure over inputs.
 *
 * The caller is responsible for *deciding* the choice (Strike/Brace/Flank
 * for tactical rounds; flavor-verb for non-tactical rounds — both end up
 * here, with non-tactical rounds always mapping to Strike).
 */
export function resolveRound(
  state: CombatState,
  choice: ActionChoice,
  equipped: { weapon?: AssetCard; armor?: AssetCard },
  rng: Rng,
): CombatTickResult {
  const lines: NarrationLine[] = [];

  // --- 1. preTurn hook -----------------------------------------------------
  let s = state;
  // Reset the per-turn Brace flag — it's consumed by whatever incoming hit
  // came in last turn, never carried forward.
  s = { ...s, bracedThisTurn: false };
  const preTurn = applyCatalogEffects(s, equipped, "preTurn");
  s = preTurn.state;
  for (const n of preTurn.notes) {
    if (n.kind === "regen") {
      lines.push({ text: `You regenerate ${n.amount} HP.`, emphasis: "heal" });
    }
  }

  // --- 2. player action ----------------------------------------------------
  const isTactical = choice.kind === "tactical";
  const tacticalOption = isTactical ? choice.option : "strike"; // flavor verbs map to Strike

  if (isTactical && tacticalOption === "brace") {
    s = { ...s, bracedThisTurn: true };
    lines.push({ text: "You brace for the incoming blow.", emphasis: "info" });
  } else {
    // Strike or Flank — both swing.
    const modifiers =
      isTactical && tacticalOption === "flank"
        ? { damageMult: 1.5, alwaysHit: false }
        : {};

    // Flank: 50% miss roll BEFORE the d20 attack. On miss, swing aborts.
    if (isTactical && tacticalOption === "flank" && rng.chance(0.5)) {
      lines.push({ text: "You overcommit on the flank and miss.", emphasis: "info" });
    } else {
      // multi_hit adds N extra swings; each rolls independently.
      const multi = getActiveEffectValue(s, equipped, "multi_hit");
      const swings = 1 + multi;
      for (let i = 0; i < swings; i++) {
        if (s.monsterHp <= 0) break;
        const swing = rollPlayerAttack(s, equipped, rng, modifiers);
        if (!swing.hit) {
          lines.push({
            text: "Your strike goes wide.",
            emphasis: "info",
          });
          continue;
        }
        const applied = applyPlayerDamage(s, equipped, swing.damage);
        s = applied.state;
        const critTag = swing.crit ? " — CRITICAL!" : "";
        const pierceTag = swing.pierced ? " (armor pierced)" : "";
        lines.push({
          text: `You hit for ${swing.damage}${critTag}${pierceTag}.`,
          emphasis: swing.crit ? "drama" : "damage",
        });
        if (applied.lifesteal > 0) {
          lines.push({
            text: `Lifesteal restores ${applied.lifesteal} HP.`,
            emphasis: "heal",
          });
        }
        if (applied.bleedApplied) {
          lines.push({
            text: "The wound bleeds.",
            emphasis: "drama",
          });
        }
      }
    }
  }

  let monsterDefeated = s.monsterHp <= 0;
  let playerDefeated = false;

  // --- 3. monster attack ---------------------------------------------------
  if (!monsterDefeated) {
    const ma = rollMonsterAttack(s, equipped, rng);
    if (ma.dodged) {
      lines.push({ text: `You dodge the ${s.monster.name}'s attack.`, emphasis: "info" });
    } else if (!ma.hit) {
      lines.push({ text: `The ${s.monster.name}'s attack glances off.`, emphasis: "info" });
    } else {
      const reducedTag = ma.reducedBy > 0 ? ` (-${ma.reducedBy} reduced)` : "";
      s = { ...s, playerHp: Math.max(0, s.playerHp - ma.damageToPlayer) };
      lines.push({
        text: `The ${s.monster.name} hits you for ${ma.damageToPlayer}${reducedTag}.`,
        emphasis: "damage",
      });

      // Thorns reflects regardless of whether the player just died.
      if (ma.thornsToMonster > 0) {
        s = { ...s, monsterHp: Math.max(0, s.monsterHp - ma.thornsToMonster) };
        lines.push({
          text: `Thorns reflects ${ma.thornsToMonster} damage.`,
          emphasis: "damage",
        });
        if (s.monsterHp <= 0) monsterDefeated = true;
      }

      if (s.playerHp <= 0) playerDefeated = true;
    }
    // Brace was consumed by this incoming swing (whether or not it landed).
    s = { ...s, bracedThisTurn: false };
  }

  // --- 4. postTurn hook ----------------------------------------------------
  if (!monsterDefeated) {
    const postTurn = applyCatalogEffects(s, equipped, "postTurn");
    s = postTurn.state;
    for (const n of postTurn.notes) {
      if (n.kind === "bleed_tick") {
        lines.push({
          text: `The ${s.monster.name} bleeds for ${n.amount}.`,
          emphasis: "damage",
        });
      }
    }
    if (s.monsterHp <= 0) monsterDefeated = true;
  }

  // Bump turn counter at the very end.
  s = { ...s, turn: s.turn + 1 };

  return { state: s, lines, monsterDefeated, playerDefeated };
}
