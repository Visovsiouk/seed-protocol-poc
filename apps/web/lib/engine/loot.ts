/**
 * Loot generator — turns an encounter clear into a `LootRoll` ready to be
 * minted under the realm's schema.
 *
 * Inputs:
 *   Difficulty: feeds the tier roll so harder rooms drop better.
 *   - Realm schema bundle: which `schemaId` to mint under for each slot,
 *     and which catalog effects that schema declares. When the
 *     realm has a signature schema for the rolled slot, we use it and roll
 *     values for its declared catalog fields. Otherwise we fall back to
 *     the canonical preset schema (no catalog effects, just `damage_die`
 *     / `attack_bonus` or `ac_bonus` / `hp_bonus`).
 *
 * The output is a pure data object (`LootRoll`) — the on-chain mint
 * happens elsewhere. Name assembly happens here too, via `nameSeed`, but
 * we only commit the seed (a uint256). The actual adjective+noun lookup
 * lives in the flavor bank because it's preset-specific.
 */

import type {
  ArmorType,
  CatalogEffect,
  CatalogEffectName,
  Element,
  LootRoll,
  Preset,
  Slot,
  Tier,
  WeaponType,
} from "./types";
import {
  combatArmorTypesFor,
  combatElementsFor,
  combatWeaponTypesFor,
} from "./types";
import type { Rng } from "./rng";
import { rollEffectValue } from "./catalog";
import { type Difficulty, rollTier, tierStats } from "./tier";

/**
 * Per-drop element roll. Half of weapon drops carry a non-"none" element
 * (and likewise armor resists); the other half stay mundane so the bank
 * doesn't drown in elemental gear. Kept deterministic on the same `rng`
 * the rest of the loot draws share.
 *
 * The pool is preset-native: a fantasy realm draws from
 * `fire/ice/shock/holy/unholy`, sci-fi from `plasma/cryo/...`, cyberpunk
 * from `incendiary/cryogenic/...`. The 12 ordered-pair adapter
 * contracts translate by index when an asset crosses a realm.
 */
const ELEMENT_DROP_CHANCE = 0.5;

function rollElement(rng: Rng, preset: Preset): Element {
  if (!rng.chance(ELEMENT_DROP_CHANCE)) return "none";
  return rng.pick(combatElementsFor(preset)) as Element;
}

/**
 * Per-drop archetype roll. Unlike the element roll there is no
 * "mundane" fallback — every weapon/armor drop is archetyped so the
 * on-chain `name(type, tier)` ladder resolves. The "none" lane is
 * reserved for story-objects (overridden by `nameOverride`) and
 * legacy un-archetyped loot.
 */
function rollWeaponType(rng: Rng, preset: Preset): WeaponType {
  return rng.pick(combatWeaponTypesFor(preset)) as WeaponType;
}

function rollArmorType(rng: Rng, preset: Preset): ArmorType {
  return rng.pick(combatArmorTypesFor(preset)) as ArmorType;
}

export type SchemaSpec = {
  schemaId: number;
  /** Catalog effects declared by this schema (empty for canonical). */
  catalogEffects: readonly CatalogEffectName[];
};

export type RealmSchemas = {
  weapon: SchemaSpec;
  armor: SchemaSpec;
  /** Accessory slot is type-reserved but not minted in the PoC. */
  accessory?: SchemaSpec;
  /**
   * Optional realm-level ceiling on tier rolls. When set, `rollLoot`
   * truncates the distribution at this tier and renormalizes the
   * surviving weights so harder-realm tiers (T3+) can't drop. Starter
   * realms cap at T2 to keep the seed liquidity floor; player-authored
   * realms scale this cap with `EcosystemRegistry.size`.
   */
  maxTier?: Tier;
};

/**
 * Picks a slot for the drop. Weapon and armor 50/50 — the PoC doesn't
 * mint accessories from the engine (accessory mints are owner-driven if
 * they happen at all).
 */
export function pickSlot(rng: Rng): Exclude<Slot, "accessory"> {
  return rng.chance(0.5) ? "weapon" : "armor";
}

/**
 * Composes a full LootRoll for a given slot and difficulty.
 *
 * Field order matters for determinism: we draw tier, then canonical
 * stats, then catalog effect values in the order the schema declared
 * them, then the name seed last. Any reshuffling here would change every
 * existing test's expected output.
 */
export function rollLoot(args: {
  rng: Rng;
  difficulty: Difficulty;
  slot: Exclude<Slot, "accessory">;
  schemas: RealmSchemas;
  /**
   * The preset whose vocabulary the rolled element should be drawn
   * from. Required: every realm in the PoC has exactly one preset,
   * and the loot's element name must match its source schema so the
   * on-chain encoder (`encodeWeaponExt` / `encodeArmorExt` in
   * `lib/contracts/adapters.ts`) maps it to a valid enum index.
   */
  preset: Preset;
}): LootRoll {
  const { rng, difficulty, slot, schemas, preset } = args;
  const tier = rollTier(rng, difficulty, schemas.maxTier);
  const stats = tierStats(tier, slot);
  const schema = schemas[slot];

  const catalogEffects: CatalogEffect[] = schema.catalogEffects.map((name) => ({
    name,
    value: rollEffectValue(rng, name, tier),
  }));

  // Element roll. Drawn AFTER catalog effects so seeds covering pre-element
  // tests still produce the same tier/stats/effect sequence; only the post-
  // effect draws shift. Weapons carry a damage element; armor carries a
  // resist element.
  const element: Element = rollElement(rng, preset);

  // Archetype roll. Drawn AFTER the element so the existing element-
  // sensitive tests keep their seed budget; the type roll is a new
  // suffix on the RNG stream. Slot-conditioned — weapons draw from
  // the preset's weapon archetypes, armor from its armor archetypes.
  const weaponType: WeaponType | undefined =
    slot === "weapon" ? rollWeaponType(rng, preset) : undefined;
  const armorType: ArmorType | undefined =
    slot === "armor" ? rollArmorType(rng, preset) : undefined;

  // Name seed: 256-bit value drawn from 8 successive uint32s. Combines
  // tier/slot/effect rolls into a single bigint we can ship to the mint
  // call. We don't try to make this collision-proof — duplicates are fine
  // (two identical-name items are just two identical-name items).
  let nameSeed = 0n;
  for (let i = 0; i < 8; i++) {
    nameSeed = (nameSeed << 32n) | BigInt(Math.floor(rng.next() * 0x100000000));
  }

  const loot: LootRoll = {
    tier,
    slot,
    schemaId: schema.schemaId,
    catalogEffects,
    nameSeed,
    extraFields: {},
    ...(slot === "weapon"
      ? {
          damageDie: stats.damageDie,
          attackBonus: stats.attackBonus,
          damageBonus: stats.damageBonus,
          element,
          weaponType,
        }
      : {
          acBonus: stats.acBonus,
          hpBonus: stats.hpBonus,
          resistElement: element,
          armorType,
        }),
  };
  return loot;
}
