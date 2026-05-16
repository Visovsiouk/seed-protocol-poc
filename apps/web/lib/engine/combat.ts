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
  Element,
  MonsterDef,
  NarrationLine,
} from "./types";
import type { Rng } from "./rng";

const D20 = 20;

/**
 * Player→monster elemental multiplier. The weapon `element` is matched
 * against the monster's `weakTo` / `resistTo` declarations:
 *
 *   weapon.element matches monster.weakTo     → 1.5×
 *   weapon.element matches monster.resistTo   → 0.5×
 *   otherwise (incl. "none" on either side)   → 1×
 *
 * Returns the multiplier and the matched relationship so callers can pick
 * the right narration line.
 */
export function elementMultiplier(
  weaponElement: Element | undefined,
  monster: Pick<MonsterDef, "weakTo" | "resistTo">,
): { mult: number; tag: "weak" | "resist" | "neutral" } {
  if (!weaponElement || weaponElement === "none") {
    return { mult: 1, tag: "neutral" };
  }
  if (monster.weakTo && monster.weakTo === weaponElement) {
    return { mult: 1.5, tag: "weak" };
  }
  if (monster.resistTo && monster.resistTo === weaponElement) {
    return { mult: 0.5, tag: "resist" };
  }
  return { mult: 1, tag: "neutral" };
}

/**
 * Monster→player elemental multiplier. The armor's `resistElement`
 * halves damage from a matching incoming element. There is no inverse
 * "armor weak to X" axis in this slice — the spec frames resistance as a
 * one-sided ward, not a vulnerability.
 */
export function armorElementMultiplier(
  monsterElement: Element | undefined,
  armorResist: Element | undefined,
): { mult: number; resisted: boolean } {
  if (!monsterElement || monsterElement === "none") {
    return { mult: 1, resisted: false };
  }
  if (!armorResist || armorResist === "none") {
    return { mult: 1, resisted: false };
  }
  if (armorResist === monsterElement) {
    return { mult: 0.5, resisted: true };
  }
  return { mult: 1, resisted: false };
}

export type CombatTickResult = {
  state: CombatState;
  lines: NarrationLine[];
  /** True when the monster's HP reached zero during this round. */
  monsterDefeated: boolean;
  /** True when the player's HP reached zero during this round. */
  playerDefeated: boolean;
};

export type PlayerSwing = {
  hit: boolean;
  damage: number;
  /** True on a natural-20 attack roll OR a successful `crit_chance` proc. */
  crit: boolean;
  /** True on a natural-1 attack roll (auto-miss, regardless of bonuses). */
  fumble: boolean;
  pierced: boolean;
  /** Element relationship that drove the damage multiplier. */
  elementTag: "weak" | "resist" | "neutral";
  /** Raw d20 attack roll (1–20). */
  dieRoll: number;
  /** Weapon attackBonus applied to the d20. */
  attackBonus: number;
  /** Monster AC the attack was compared against (post-pierce). */
  targetAc: number;
  /** Damage die used (4/6/8/10/12 or 4 for unarmed). */
  damageDie: number;
  /** Raw damage die roll before crit/bonus/element/flank multipliers. 0 on a miss. */
  damageRoll: number;
  /** Weapon damageBonus added to the damage die (post-crit, pre-element). */
  damageBonus: number;
};

/**
 * A player attack swing.
 *
 * To-hit math:
 *   - nat-1 on the d20 → automatic miss (fumble), regardless of attackBonus.
 *   - nat-20 on the d20 → automatic hit + crit (2× damage), regardless of AC.
 *   - otherwise `(roll + weapon.attackBonus) >= monster.ac` to hit.
 *   - `modifiers.alwaysHit` only overrides the non-natural branch — it
 *     can't make a fumbled die land. (Reserved for future deterministic
 *     effects; currently unused.)
 *
 * Crit math:
 *   - nat-20 always crits.
 *   - Otherwise the `crit_chance` catalog effect rolls; one proc = crit.
 *   - Crit doubles the *die roll only*, not the flat `damageBonus`. This is
 *     the D&D 5e convention — flat bonuses stay flat. Stacking nat-20 with a
 *     crit_chance proc still caps the multiplier at 2×.
 *
 * Damage formula:
 *   damage = floor((dieRoll × critMult + damageBonus) × elemMult × flankMult)
 *   clamped to a minimum of 1 on a hit.
 *
 * Element math:
 *   - Multiplier applied to (post-crit + bonus) damage. See `elementMultiplier`.
 */
function rollPlayerAttack(
  state: CombatState,
  equipped: { weapon?: AssetCard; armor?: AssetCard },
  rng: Rng,
  modifiers: { damageMult?: number; alwaysHit?: boolean } = {},
): PlayerSwing {
  const weapon = equipped.weapon;
  const damageDie = weapon?.damageDie ?? 4; // unarmed fallback: d4
  const attackBonus = weapon?.attackBonus ?? 0;
  const damageBonus = weapon?.damageBonus ?? 0;
  const pierce = getActiveEffectValue(state, equipped, "armor_pierce") > 0;
  const monsterAc = pierce ? Math.max(10, state.monster.ac - 2) : state.monster.ac;

  const dieRoll = rng.rollDie(D20);

  // Fumble: nat-1 is always a miss, regardless of attackBonus or alwaysHit.
  if (dieRoll === 1) {
    return {
      hit: false,
      damage: 0,
      crit: false,
      fumble: true,
      pierced: pierce,
      elementTag: "neutral",
      dieRoll,
      attackBonus,
      targetAc: monsterAc,
      damageDie,
      damageRoll: 0,
      damageBonus,
    };
  }

  // Nat-20 auto-crits, bypassing AC.
  const isNat20 = dieRoll === 20;
  const attackRoll = dieRoll + attackBonus;
  const hit = isNat20 || modifiers.alwaysHit || attackRoll >= monsterAc;
  if (!hit) {
    return {
      hit: false,
      damage: 0,
      crit: false,
      fumble: false,
      pierced: pierce,
      elementTag: "neutral",
      dieRoll,
      attackBonus,
      targetAc: monsterAc,
      damageDie,
      damageRoll: 0,
      damageBonus,
    };
  }

  const baseDamage = rng.rollDie(damageDie);
  const critChance = getActiveEffectValue(state, equipped, "crit_chance") / 100;
  const critProc = critChance > 0 && rng.chance(critChance);
  const crit = isNat20 || critProc;
  // Crit doubles the dice only; the flat damageBonus is added after.
  let damage = (crit ? baseDamage * 2 : baseDamage) + damageBonus;

  // Element multiplier (applied to post-crit, post-bonus damage).
  const { mult: elemMult, tag: elementTag } = elementMultiplier(
    weapon?.element,
    state.monster,
  );
  damage = Math.floor(damage * elemMult);

  if (modifiers.damageMult !== undefined) {
    damage = Math.floor(damage * modifiers.damageMult);
  }
  // Damage is at least 1 on a hit (a successful attack always hurts).
  damage = Math.max(1, damage);
  return {
    hit: true,
    damage,
    crit,
    fumble: false,
    pierced: pierce,
    elementTag,
    dieRoll,
    attackBonus,
    targetAc: monsterAc,
    damageDie,
    damageRoll: baseDamage,
    damageBonus,
  };
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

export type MonsterSwing = {
  hit: boolean;
  damageToPlayer: number;
  thornsToMonster: number;
  dodged: boolean;
  reducedBy: number;
  /** True on nat-20 OR a successful crit_chance proc. */
  crit: boolean;
  /** True on nat-1 (auto-miss, regardless of AC). */
  fumble: boolean;
  /** True when the armor halved this hit via element resistance. */
  resisted: boolean;
  /** Raw d20 attack roll (1–20). Undefined when the swing was dodged. */
  dieRoll?: number;
  /** Effective player AC at the time of the swing (post-pierce, +brace). */
  targetAc?: number;
  /** Monster attack die size (4/6/8/10/12). */
  attackDie?: number;
  /** Raw damage die roll before crit/element multipliers. 0 on a miss. */
  damageRoll?: number;
};

/** Monster swing → player. Honors dodge, damage_reduction, thorns, Brace, monster baked-in effects, element resist. */
function rollMonsterAttack(
  state: CombatState,
  equipped: { weapon?: AssetCard; armor?: AssetCard },
  rng: Rng,
): MonsterSwing {
  // Dodge first — fires before the d20 even rolls.
  const dodge = getActiveEffectValue(state, equipped, "dodge_chance") / 100;
  if (dodge > 0 && rng.chance(dodge)) {
    return {
      hit: false,
      damageToPlayer: 0,
      thornsToMonster: 0,
      dodged: true,
      reducedBy: 0,
      crit: false,
      fumble: false,
      resisted: false,
    };
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

  const dieRoll = rng.rollDie(D20);

  // Fumble: nat-1 is always a miss for the monster too.
  if (dieRoll === 1) {
    return {
      hit: false,
      damageToPlayer: 0,
      thornsToMonster: 0,
      dodged: false,
      reducedBy: 0,
      crit: false,
      fumble: true,
      resisted: false,
      dieRoll,
      targetAc: effectivePlayerAc,
      attackDie,
      damageRoll: 0,
    };
  }

  const isNat20 = dieRoll === 20;
  if (!isNat20 && dieRoll < effectivePlayerAc) {
    return {
      hit: false,
      damageToPlayer: 0,
      thornsToMonster: 0,
      dodged: false,
      reducedBy: 0,
      crit: false,
      fumble: false,
      resisted: false,
      dieRoll,
      targetAc: effectivePlayerAc,
      attackDie,
      damageRoll: 0,
    };
  }

  const damageRoll = rng.rollDie(attackDie);
  let damage = damageRoll;

  // Crit: nat-20 always crits; crit_chance still rolls otherwise.
  const monsterCritChance = getMonsterEffectValue(state, "crit_chance") / 100;
  const critProc = monsterCritChance > 0 && rng.chance(monsterCritChance);
  const crit = isNat20 || critProc;
  if (crit) damage *= 2;

  // Element resist on the player's armor halves damage from a matching swing.
  const { mult: elemMult, resisted } = armorElementMultiplier(
    state.monster.element,
    equipped.armor?.resistElement,
  );
  damage = Math.floor(damage * elemMult);

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
    crit,
    fumble: false,
    resisted,
    dieRoll,
    targetAc: effectivePlayerAc,
    attackDie,
    damageRoll,
  };
}

function isBoss(m: MonsterDef | BossDef): m is BossDef {
  return "bakedEffects" in m;
}

/** Renders "+N" or "-N" or "" depending on the sign and magnitude. */
function bonusFragment(n: number): string {
  if (n === 0) return "";
  return n > 0 ? `+${n}` : `${n}`;
}

/**
 * Formats a player swing's roll math as a trailing tag. Labels are
 * explicit ("hit:"/"dmg:") so the two halves aren't confusable, and
 * each half shows the raw die roll, the flat bonus, and the resolved
 * total in `X+Y=Z` form.
 *
 * Examples:
 *   " [hit: d20 14+2=16 vs AC 12 · dmg: d6 3+1=4]"  (normal hit)
 *   " [hit: d20 8+2=10 vs AC 12]"                   (miss — no damage was rolled)
 *   " [hit: d20 1 — fumble]"                        (nat-1 miss)
 *   " [hit: d20 20 — auto-hit · dmg: d8 5+2=7]"     (nat-20 — bypasses AC)
 *   " [hit: d20 14 vs AC 12 · dmg: d4 3]"           (no attack/damage bonus on either side)
 *
 * The displayed `dmg` value is the raw die + bonus *before* crit and
 * element multipliers — the final damage on the narration line ("You
 * hit for N") shows the post-multiplier number. Crit doubles only the
 * dice (per the formula in `rollPlayerAttack`).
 */
function playerRollTag(swing: PlayerSwing): string {
  if (swing.fumble) return ` [hit: d20 1 — fumble]`;
  const atkBonus = bonusFragment(swing.attackBonus);
  const atkTotal = swing.dieRoll + swing.attackBonus;
  const hitPart =
    swing.dieRoll === 20
      ? `d20 20 — auto-hit`
      : atkBonus
        ? `d20 ${swing.dieRoll}${atkBonus}=${atkTotal} vs AC ${swing.targetAc}`
        : `d20 ${swing.dieRoll} vs AC ${swing.targetAc}`;
  if (!swing.hit) return ` [hit: ${hitPart}]`;

  const dmgBonus = bonusFragment(swing.damageBonus);
  const dmgRaw = swing.damageRoll;
  const dmgTotal = dmgRaw + swing.damageBonus;
  const dmgPart = dmgBonus
    ? `d${swing.damageDie} ${dmgRaw}${dmgBonus}=${dmgTotal}`
    : `d${swing.damageDie} ${dmgRaw}`;
  return ` [hit: ${hitPart} · dmg: ${dmgPart}]`;
}

function monsterRollTag(swing: MonsterSwing): string {
  if (swing.dieRoll === undefined) return ""; // dodged — no swing was rolled
  if (swing.fumble) return ` [hit: d20 1 — fumble]`;
  const hitPart =
    swing.dieRoll === 20
      ? `d20 20 — auto-hit`
      : `d20 ${swing.dieRoll} vs AC ${swing.targetAc}`;
  if (!swing.hit) return ` [hit: ${hitPart}]`;
  return ` [hit: ${hitPart} · dmg: d${swing.attackDie} ${swing.damageRoll}]`;
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
            text:
              (swing.fumble
                ? "You fumble the swing."
                : "Your strike goes wide.") + playerRollTag(swing),
            emphasis: "info",
          });
          continue;
        }
        const applied = applyPlayerDamage(s, equipped, swing.damage);
        s = applied.state;
        const critTag = swing.crit ? " — CRITICAL!" : "";
        const pierceTag = swing.pierced ? " (armor pierced)" : "";
        const elementTag =
          swing.elementTag === "weak"
            ? " (elementally weak)"
            : swing.elementTag === "resist"
              ? " (resisted)"
              : "";
        lines.push({
          text: `You hit for ${swing.damage}${critTag}${pierceTag}${elementTag}.${playerRollTag(swing)}`,
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
      lines.push({
        text:
          (ma.fumble
            ? `The ${s.monster.name} stumbles and misses.`
            : `The ${s.monster.name}'s attack glances off.`) + monsterRollTag(ma),
        emphasis: "info",
      });
    } else {
      const reducedTag = ma.reducedBy > 0 ? ` (-${ma.reducedBy} reduced)` : "";
      const critTag = ma.crit ? " — CRITICAL!" : "";
      const resistTag = ma.resisted ? " (your armor wards it)" : "";
      s = { ...s, playerHp: Math.max(0, s.playerHp - ma.damageToPlayer) };
      lines.push({
        text: `The ${s.monster.name} hits you for ${ma.damageToPlayer}${critTag}${resistTag}${reducedTag}.${monsterRollTag(ma)}`,
        emphasis: ma.crit ? "drama" : "damage",
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
