/**
 * Combat round resolver. Owns the two-button combat surface (Attack /
 * Secondary) plus the player→monster and monster→player damage paths with
 * every catalog effect wired in.
 *
 * Turn order, per round:
 *   1. preTurn hook  — regen on the player (doubled if Secondary→Steady fired)
 *   2. player action — Attack (default swing) or Secondary (defensive)
 *   3. monster attack — unless monster died on the player's swing
 *   4. postTurn hook  — bleed DoT ticks down
 *   5. boss phase transition check (boss.ts, called by the caller of resolveRound)
 *
 * Secondary semantics depend on the equipped armor (see `secondaryFor`).
 * Trash mobs only show Attack; bosses show both. (The UI gates the button;
 * the resolver accepts either choice regardless — defensive coding.)
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
import { monsterLower, monsterTitle } from "./narration";

/**
 * Maps the equipped armor's defensive catalog effect to one of five
 * Secondary actions. The label drives the button text; the `flag` field
 * names the CombatState boolean that gets set when Secondary is chosen.
 *
 * Priority order matches the catalog spec layout — first matching effect
 * wins, so an armor card with multiple defensive lines collapses to a
 * single Secondary. Bare or non-defensive armor falls through to Focus,
 * which is purely offensive (next Attack auto-crits + 2 to-hit).
 */
export type SecondaryResolution =
  | { label: "Dodge"; flag: "guaranteedDodgeThisTurn" }
  | { label: "Brace"; flag: "bracedThisTurn" }
  | { label: "Steady"; flag: "regenDoubledThisTurn" }
  | { label: "Reflect"; flag: "thornsDoubledThisTurn" }
  | { label: "Focus"; flag: "focusPrimed" };

export function secondaryFor(armor: AssetCard | undefined): SecondaryResolution {
  const effects = armor?.catalogEffects ?? [];
  const has = (name: string) =>
    effects.some((e) => e.name === name && e.value > 0);
  if (has("dodge_chance")) return { label: "Dodge", flag: "guaranteedDodgeThisTurn" };
  if (has("damage_reduction")) return { label: "Brace", flag: "bracedThisTurn" };
  if (has("regen")) return { label: "Steady", flag: "regenDoubledThisTurn" };
  if (has("thorns")) return { label: "Reflect", flag: "thornsDoubledThisTurn" };
  return { label: "Focus", flag: "focusPrimed" };
}

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
  modifiers: { damageMult?: number; alwaysHit?: boolean; focusPrimed?: boolean } = {},
): PlayerSwing {
  const weapon = equipped.weapon;
  const damageDie = weapon?.damageDie ?? 4; // unarmed fallback: d4
  // Focus-primed attacks add +2 to-hit on top of the weapon's attackBonus.
  // The flag is set by the previous turn's Secondary→Focus; the caller
  // clears it after this roll so the next swing reverts to baseline.
  //
  // Rebalance: when `phase2PlayerBuffed` is set (boss crossed the 50% HP
  // threshold), every player swing for the rest of the fight gets a
  // permanent +2 to-hit. Paired with the unchanged phase-2 attack-die
  // bump on the boss side, the beat reads as "trade blows harder", not
  // "you die faster". See.
  const attackBonus =
    (weapon?.attackBonus ?? 0) +
    (modifiers.focusPrimed ? 2 : 0) +
    (state.phase2PlayerBuffed ? 2 : 0);
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
  // Focus-primed swings auto-crit on a successful hit, in addition to the
  // standard nat-20 and crit_chance procs.
  const crit = isNat20 || critProc || !!modifiers.focusPrimed;
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
  // Dodge first — fires before the d20 even rolls. Secondary→Dodge sets
  // `guaranteedDodgeThisTurn` for an auto-dodge regardless of the catalog
  // value; otherwise we fall back to the rolled `dodge_chance` proc.
  const guaranteedDodge = state.guaranteedDodgeThisTurn;
  const dodge = getActiveEffectValue(state, equipped, "dodge_chance") / 100;
  if (guaranteedDodge || (dodge > 0 && rng.chance(dodge))) {
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

  // Thorns. Secondary→Reflect doubles the reflected damage this turn.
  const baseThorns = getActiveEffectValue(state, equipped, "thorns");
  const thorns = state.thornsDoubledThisTurn ? baseThorns * 2 : baseThorns;

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
  // Reset per-turn defensive flags — they're consumed by whatever incoming
  // hit came in last turn, never carried forward. `focusPrimed` is NOT
  // reset here — it persists until consumed by an Attack action.
  s = {
    ...s,
    bracedThisTurn: false,
    guaranteedDodgeThisTurn: false,
    thornsDoubledThisTurn: false,
    // regenDoubledThisTurn is consumed by the preTurn hook below, then cleared.
  };
  const preTurn = applyCatalogEffects(s, equipped, "preTurn");
  s = preTurn.state;
  for (const n of preTurn.notes) {
    if (n.kind === "regen") {
      // Steady doubles the heal — applied here, after the catalog has
      // produced the base note. We re-clamp against maxHp so a Steady on
      // near-full health doesn't overheal.
      const doubled = s.regenDoubledThisTurn
        ? Math.min(s.playerMaxHp - s.playerHp, n.amount) // headroom after base heal
        : 0;
      if (doubled > 0) {
        s = { ...s, playerHp: s.playerHp + doubled };
        lines.push({
          text: `You regenerate ${n.amount + doubled} HP.`,
          emphasis: "heal",
        });
      } else {
        lines.push({ text: `You regenerate ${n.amount} HP.`, emphasis: "heal" });
      }
    }
  }
  // regen-double flag now consumed regardless of outcome.
  s = { ...s, regenDoubledThisTurn: false };

  // --- 2. player action ----------------------------------------------------
  if (choice.kind === "secondary") {
    // The defensive action — resolution depends on the equipped armor.
    // No swing happens; the chosen flag is consumed by either this round's
    // monster swing (Brace/Dodge/Reflect) or by the next round's Attack
    // (Focus). Steady's effect already fired in the preTurn block above
    // when the next round's preTurn runs.
    const sec = secondaryFor(equipped.armor);
    s = { ...s, [sec.flag]: true } as CombatState;
    const verb = (() => {
      switch (sec.label) {
        case "Dodge":
          return "You read the swing — guaranteed to slip it.";
        case "Brace":
          return "You brace for the incoming blow.";
        case "Steady":
          return "You steady your breath; the wound knits.";
        case "Reflect":
          return "You set your guard — thorns ready.";
        case "Focus":
          return "You focus. The next strike will land hard.";
      }
    })();
    lines.push({ text: verb, emphasis: "info" });
  } else {
    // Attack — the only swing path. multi_hit adds N extra swings; each
    // rolls independently. Focus is consumed by the FIRST swing only —
    // subsequent multi-hit swings revert to baseline.
    const wasFocusPrimed = s.focusPrimed;
    if (wasFocusPrimed) s = { ...s, focusPrimed: false };
    const multi = getActiveEffectValue(s, equipped, "multi_hit");
    const swings = 1 + multi;
    for (let i = 0; i < swings; i++) {
      if (s.monsterHp <= 0) break;
      const swing = rollPlayerAttack(s, equipped, rng, {
        focusPrimed: i === 0 && wasFocusPrimed,
      });
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

  let monsterDefeated = s.monsterHp <= 0;
  let playerDefeated = false;

  // --- 3. monster attack ---------------------------------------------------
  // Rebalance: monster-side `multi_hit` (baked into some bosses' bakedEffects,
  // e.g. Dragon) was previously dead code — `rollMonsterAttack` only ever
  // produced one swing. We now honor it the same way the player path does:
  // 1 + N swings, each rolled independently. Boss baked-effect values are
  // capped in `getMonsterEffectValue` so this is "+1 swing", not "+2".
  // Brace and other per-turn defensive flags persist across the swing
  // sequence (only consumed once at the end of the monster's turn).
  if (!monsterDefeated) {
    const monsterMulti = getMonsterEffectValue(s, "multi_hit");
    const monsterSwings = 1 + monsterMulti;
    for (let i = 0; i < monsterSwings; i++) {
      if (playerDefeated || monsterDefeated) break;
      const ma = rollMonsterAttack(s, equipped, rng);
      if (ma.dodged) {
        lines.push({ text: `You dodge ${monsterLower(s.monster)}'s attack.`, emphasis: "info" });
      } else if (!ma.hit) {
        lines.push({
          text:
            (ma.fumble
              ? `${monsterTitle(s.monster)} stumbles and misses.`
              : `${monsterTitle(s.monster)}'s attack glances off.`) + monsterRollTag(ma),
          emphasis: "info",
        });
      } else {
        const reducedTag = ma.reducedBy > 0 ? ` (-${ma.reducedBy} reduced)` : "";
        const critTag = ma.crit ? " — CRITICAL!" : "";
        const resistTag = ma.resisted ? " (your armor wards it)" : "";
        s = { ...s, playerHp: Math.max(0, s.playerHp - ma.damageToPlayer) };
        lines.push({
          text: `${monsterTitle(s.monster)} hits you for ${ma.damageToPlayer}${critTag}${resistTag}${reducedTag}.${monsterRollTag(ma)}`,
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
    }
    // Brace was consumed by this incoming swing-sequence (whether or not anything landed).
    s = { ...s, bracedThisTurn: false };
  }

  // --- 4. postTurn hook ----------------------------------------------------
  if (!monsterDefeated) {
    const postTurn = applyCatalogEffects(s, equipped, "postTurn");
    s = postTurn.state;
    for (const n of postTurn.notes) {
      if (n.kind === "bleed_tick") {
        lines.push({
          text: `${monsterTitle(s.monster)} bleeds for ${n.amount}.`,
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
