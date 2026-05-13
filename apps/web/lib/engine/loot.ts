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
  CatalogEffect,
  CatalogEffectName,
  LootRoll,
  Slot,
} from "./types";
import type { Rng } from "./rng";
import { rollEffectValue } from "./catalog";
import { type Difficulty, rollTier, tierStats } from "./tier";

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
}): LootRoll {
  const { rng, difficulty, slot, schemas } = args;
  const tier = rollTier(rng, difficulty);
  const stats = tierStats(tier, slot);
  const schema = schemas[slot];

  const catalogEffects: CatalogEffect[] = schema.catalogEffects.map((name) => ({
    name,
    value: rollEffectValue(rng, name, tier),
  }));

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
      ? { damageDie: stats.damageDie, attackBonus: stats.attackBonus }
      : { acBonus: stats.acBonus, hpBonus: stats.hpBonus }),
  };
  return loot;
}
