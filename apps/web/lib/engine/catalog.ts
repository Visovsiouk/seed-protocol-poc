/**
 * Catalog of optional gameplay-effect fields. The catalog
 * is a closed set: 5 weapon-slot effects, 4 armor-slot effects, all with
 * per-tier value ranges and hard caps.
 *
 * Responsibilities of this module:
 *   - publish the slot-keyed catalog (`WEAPON_EFFECTS` / `ARMOR_EFFECTS`)
 *   - roll a per-drop value for one effect at a given tier (`rollEffectValue`)
 *   - apply catalog effects to a combat state at the right hook
 *     (`applyCatalogEffects`)
 *
 * The applier reads catalog values from *any* equipped asset and from boss
 * baked-in effects the same way — the engine treats both as "an
 * effect with a name and a value." Hook order is what makes "Brace" feel
 * Brace-y: `onIncoming` runs after the player has chosen Brace this turn,
 * so `damage_reduction` and `dodge_chance` stack with the +2 AC.
 */

import type {
  AssetCard,
  CatalogEffect,
  CatalogEffectName,
  CombatState,
  Tier,
} from "./types";
import type { Rng } from "./rng";

export type CatalogHook = "preTurn" | "onHit" | "onIncoming" | "postTurn";

type EffectSlot = "weapon" | "armor";

export type EffectSpec = {
  name: CatalogEffectName;
  slot: EffectSlot;
  /** Inclusive value range per tier. `null` means the effect is binary/Bool. */
  range: Readonly<Record<Tier, readonly [number, number] | null>>;
  /** Hard cap on the rolled value (informational; ranges already clamp it). */
  cap: number;
  /** Where this effect runs in the turn cycle. */
  hook: CatalogHook;
};

/**
 * weapon-slot effects.
 * Per-tier ranges chosen so a T1 sits near the floor and a T5 sits at cap.
 * Linear interpolation between tier-1 and tier-5 bounds, snapped to ints.
 */
export const WEAPON_EFFECTS: Readonly<Record<CatalogEffectName, EffectSpec | undefined>> = {
  lifesteal: {
    name: "lifesteal",
    slot: "weapon",
    range: { 1: [1, 1], 2: [1, 2], 3: [2, 3], 4: [3, 4], 5: [4, 5] },
    cap: 5,
    hook: "onHit",
  },
  armor_pierce: {
    name: "armor_pierce",
    slot: "weapon",
    range: { 1: null, 2: null, 3: null, 4: null, 5: null }, // Bool
    cap: 1,
    hook: "onHit",
  },
  crit_chance: {
    name: "crit_chance",
    slot: "weapon",
    range: { 1: [5, 8], 2: [8, 13], 3: [13, 18], 4: [18, 22], 5: [22, 25] },
    cap: 25,
    hook: "onHit",
  },
  multi_hit: {
    name: "multi_hit",
    slot: "weapon",
    range: { 1: [1, 1], 2: [1, 1], 3: [1, 2], 4: [2, 2], 5: [2, 2] },
    cap: 2,
    hook: "onHit",
  },
  bleed: {
    name: "bleed",
    slot: "weapon",
    range: { 1: [1, 1], 2: [1, 2], 3: [2, 3], 4: [3, 4], 5: [4, 5] },
    cap: 5,
    hook: "onHit",
  },
  // armor names appear as undefined entries here so a single-record lookup works
  regen: undefined,
  thorns: undefined,
  dodge_chance: undefined,
  damage_reduction: undefined,
} as const;

/** armor-slot effects. */
export const ARMOR_EFFECTS: Readonly<Record<CatalogEffectName, EffectSpec | undefined>> = {
  regen: {
    name: "regen",
    slot: "armor",
    range: { 1: [1, 1], 2: [1, 2], 3: [2, 2], 4: [2, 3], 5: [3, 3] },
    cap: 3,
    hook: "preTurn",
  },
  thorns: {
    name: "thorns",
    slot: "armor",
    range: { 1: [1, 1], 2: [1, 2], 3: [2, 3], 4: [3, 4], 5: [4, 5] },
    cap: 5,
    hook: "onIncoming",
  },
  dodge_chance: {
    name: "dodge_chance",
    slot: "armor",
    range: { 1: [5, 8], 2: [8, 13], 3: [13, 18], 4: [18, 22], 5: [22, 25] },
    cap: 25,
    hook: "onIncoming",
  },
  damage_reduction: {
    name: "damage_reduction",
    slot: "armor",
    range: { 1: [1, 1], 2: [1, 2], 3: [2, 3], 4: [3, 4], 5: [4, 4] },
    cap: 4,
    hook: "onIncoming",
  },
  lifesteal: undefined,
  armor_pierce: undefined,
  crit_chance: undefined,
  multi_hit: undefined,
  bleed: undefined,
} as const;

/** Look up an effect's spec; returns undefined for names not in the catalog. */
export function getEffectSpec(name: CatalogEffectName): EffectSpec | undefined {
  return WEAPON_EFFECTS[name] ?? ARMOR_EFFECTS[name];
}

/**
 * Rolls a per-drop value for an effect at a given tier, using the per-tier
 * range. For Bool-typed effects (range entry is null) returns 1 — the
 * Bool's presence is the effect; downstream code reads `value !== 0`.
 */
export function rollEffectValue(
  rng: Rng,
  effect: CatalogEffectName,
  tier: Tier,
): number {
  const spec = getEffectSpec(effect);
  if (!spec) {
    throw new Error(`rollEffectValue: unknown effect "${effect}"`);
  }
  const range = spec.range[tier];
  if (range === null) return 1;
  const [lo, hi] = range;
  return lo + rng.nextInt(hi - lo + 1);
}

/** Collects all catalog effects from the equipped weapon and armor. */
function collectEffects(equipped: {
  weapon?: AssetCard;
  armor?: AssetCard;
}): { hook: CatalogHook; effect: CatalogEffect; spec: EffectSpec }[] {
  const out: { hook: CatalogHook; effect: CatalogEffect; spec: EffectSpec }[] = [];
  for (const card of [equipped.weapon, equipped.armor]) {
    if (!card) continue;
    for (const eff of card.catalogEffects) {
      const spec = getEffectSpec(eff.name);
      if (!spec) continue;
      out.push({ hook: spec.hook, effect: eff, spec });
    }
  }
  return out;
}

/**
 * Applies catalog effects fired by a given `hook`. Mutates a copy of
 * `state` — callers should treat the returned `CombatState` as the new
 * source of truth. Returns narration-friendly notes for downstream rendering.
 *
 * Supported hooks:
 *  - `preTurn`: regen — heal on the player at the start of their turn
 *  - `onHit`: lifesteal, crit_chance, bleed, multi_hit, armor_pierce —
 *    consumed by combat.ts when resolving Strike/Flank damage
 *  - `onIncoming`: dodge_chance, damage_reduction, thorns — modifies an
 *    incoming hit
 *  - `postTurn`: bleed DoT tick on the monster
 *
 * Effects whose name appears in `state.suppressedEffects` (phase-2 boss
 * suppression) are skipped. Bool effects (armor_pierce) are exposed
 * via `getActiveEffectValue` rather than mutated here.
 */
export type CatalogTick = {
  state: CombatState;
  /** Narration-friendly hints; combat.ts decides how to render them. */
  notes: { kind: "regen" | "bleed_tick"; amount: number }[];
};

export function applyCatalogEffects(
  state: CombatState,
  equipped: { weapon?: AssetCard; armor?: AssetCard },
  hook: CatalogHook,
): CatalogTick {
  const next: CombatState = {
    ...state,
    suppressedEffects: [...state.suppressedEffects],
  };
  const notes: CatalogTick["notes"] = [];

  for (const { hook: effHook, effect, spec: _spec } of collectEffects(equipped)) {
    if (effHook !== hook) continue;
    if (next.suppressedEffects.includes(effect.name)) continue;

    switch (effect.name) {
      case "regen": {
        if (next.playerHp <= 0) break;
        const heal = Math.min(effect.value, next.playerMaxHp - next.playerHp);
        if (heal > 0) {
          next.playerHp += heal;
          notes.push({ kind: "regen", amount: heal });
        }
        break;
      }
      // onHit and onIncoming effects are consulted by combat.ts via
      // `getActiveEffectValue`; they don't mutate state here.
      case "lifesteal":
      case "crit_chance":
      case "multi_hit":
      case "bleed":
      case "armor_pierce":
      case "thorns":
      case "dodge_chance":
      case "damage_reduction":
        break;
    }
  }

  // postTurn: tick bleed DoT on the monster.
  if (hook === "postTurn" && next.bleedStacks > 0) {
    // bleed_per_turn is stored on the *attacker*'s weapon, which is the
    // player here. Look it up directly from equipped — we only kept stack
    // count on state, not amount, because all bleed sources stack uniformly.
    const bleedEff = equipped.weapon?.catalogEffects.find((e) => e.name === "bleed");
    if (bleedEff) {
      const tickDamage = bleedEff.value;
      next.monsterHp = Math.max(0, next.monsterHp - tickDamage);
      next.bleedStacks -= 1;
      notes.push({ kind: "bleed_tick", amount: tickDamage });
    }
  }

  return { state: next, notes };
}

/**
 * Returns the active value of an effect for the equipped gear (and boss
 * baked-in effects, if you pass them as a synthetic AssetCard). Returns 0
 * when the effect isn't present or has been suppressed. Used by combat.ts
 * to consult onHit/onIncoming effects without applying state mutations.
 */
export function getActiveEffectValue(
  state: CombatState,
  equipped: { weapon?: AssetCard; armor?: AssetCard },
  name: CatalogEffectName,
): number {
  if (state.suppressedEffects.includes(name)) return 0;
  for (const card of [equipped.weapon, equipped.armor]) {
    if (!card) continue;
    const eff = card.catalogEffects.find((e) => e.name === name);
    if (eff) return eff.value;
  }
  return 0;
}

/**
 * Boss baked-effect strength table. Hand-tuned so a baseline-equipped
 * player has a credible chance against a starter boss.
 *
 * History: previously this returned `spec.cap` for every effect — i.e.
 * every boss ran with end-game-cap effect values. That made starter
 * bosses unwinnable at maxTier 2 (regen 3/turn alone exceeded the
 * player's expected DPS at T1–T2 weapons). The new values are roughly
 * 40–60% of cap, tuned per-effect rather than uniformly.
 *
 * For Boolean effects (`armor_pierce`) the value is 1 — the effect's
 * presence is the effect.
 */
const MONSTER_EFFECT_STRENGTH: Readonly<Record<CatalogEffectName, number>> = {
  // weapon-side
  lifesteal: 2, // was 5
  armor_pierce: 1, // boolean — keep
  crit_chance: 12, // was 25 (% chance)
  multi_hit: 1, // was 2 (extra swings — caps boss-side combos)
  bleed: 2, // was 5 (DoT per turn, 3 turns)
  // armor-side
  regen: 1, // was 3 (HP / turn — the big offender pre-rebalance)
  thorns: 2, // was 5
  dodge_chance: 12, // was 25 (% chance)
  damage_reduction: 2, // was 4 (flat DR; was eating most of a d4–d6)
};

/**
 * Same lookup, but for the monster's baked-in effects (boss data carries
 * `bakedEffects`; a hostile monster doesn't). Encapsulated here so combat.ts
 * doesn't need to know boss vs monster shape distinctions.
 *
 * Returns the value from `MONSTER_EFFECT_STRENGTH` rather than `spec.cap`
 * (which is intended as the *player* gear cap, not a boss baseline).
 */
export function getMonsterEffectValue(
  state: CombatState,
  name: CatalogEffectName,
): number {
  // Monsters never carry effects; only bosses do.
  const monster = state.monster as { bakedEffects?: readonly CatalogEffectName[] };
  if (!monster.bakedEffects) return 0;
  if (!monster.bakedEffects.includes(name)) return 0;
  return MONSTER_EFFECT_STRENGTH[name] ?? 1;
}
