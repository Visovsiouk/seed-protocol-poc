/**
 * Schema definitions registered by the seeder on every starter realm.
 *
 * The PoC uses two ecosystem-owned schemas:
 *
 *   - **clearReceipt** — minted by the backend when a player defeats the
 *     starter realm's boss. The on-chain `AssetMinted` event under this
 *     schema is the durable, audit-able "boss cleared" record that the
 *     play page's tutorial overlay reads via `lib/reads/boss-clears.ts`.
 *
 *   - **loot** — minted by the backend when the player accepts a drop.
 *     The `runSeed` field commits the receipt to the deterministic run
 *     seed so a future on-chain claim-loot contract can verify the drop
 *     was reproducible from the player's pinned blockhash + nonce.
 *
 * Field names are stored on-chain as `bytes32` (right-padded UTF-8 with
 * length ≤ 32). The `FieldType` enum lives in `SeedTypes.sol`:
 *
 *   0 = Uint, 1 = Int, 2 = String, 3 = Bool, 4 = Address, 5 = Bytes
 *
 * If you change these definitions you must re-run `pnpm seed` against a
 * fresh deployment — registered schemas are immutable.
 */

import { stringToHex } from "viem";

/** Mirrors `SeedTypes.FieldType` on-chain. */
export const FieldType = {
  Uint: 0,
  Int: 1,
  String: 2,
  Bool: 3,
  Address: 4,
  Bytes: 5,
} as const;

export type FieldTypeValue = (typeof FieldType)[keyof typeof FieldType];

export type SchemaField = {
  /** Right-padded `bytes32` of the field's UTF-8 name. */
  name: `0x${string}`;
  fieldType: FieldTypeValue;
  required: boolean;
};

function field(
  name: string,
  fieldType: FieldTypeValue,
  required = true,
): SchemaField {
  return {
    name: stringToHex(name, { size: 32 }),
    fieldType,
    required,
  };
}

export const SCHEMAS = {
  clearReceipt: {
    name: "Realms.ClearReceipt",
    metadataURI: "ipfs://placeholder/clear-receipt.json",
    fields: [
      field("player", FieldType.Address),
      field("bossId", FieldType.Bytes),
      field("clearedAt", FieldType.Uint),
      field("runSeed", FieldType.Bytes),
      field("turns", FieldType.Uint),
      field("finalHp", FieldType.Uint),
    ] satisfies SchemaField[],
  },
  loot: {
    name: "Realms.Loot",
    metadataURI: "ipfs://placeholder/loot.json",
    fields: [
      field("kind", FieldType.Bytes),
      field("rarity", FieldType.Uint),
      field("runSeed", FieldType.Bytes),
      field("mintedAt", FieldType.Uint),
      field("sourceRealm", FieldType.Address),
    ] satisfies SchemaField[],
  },
  /**
   * The Colophon's kill receipt — one per contributor when an edition falls.
   *
   * Carries the *share* as well as the damage, because damage is meaningless
   * without the pool it came out of and a token should still be readable on
   * its own years later with no server to ask.
   *
   * Registered on every realm like the other two even though the raid is
   * global: minting needs an `EcosystemTemplate` to mint *from*, and reusing
   * a starter realm's existing minter delegate is far less machinery than
   * giving the raid an ecosystem of its own.
   */
  killReceipt: {
    name: "Realms.KillReceipt",
    metadataURI: "ipfs://placeholder/kill-receipt.json",
    fields: [
      field("player", FieldType.Address),
      field("edition", FieldType.Uint),
      field("damage", FieldType.Uint),
      field("shareBps", FieldType.Uint),
      field("attempts", FieldType.Uint),
      field("felledAt", FieldType.Uint),
    ] satisfies SchemaField[],
  },
} as const;

export type SchemaKey = keyof typeof SCHEMAS;

/**
 * Ordered list of `(key, definition)` pairs. The seeder iterates this
 * array — and only this array — so the on-chain registration order is
 * deterministic. Idempotent recovery from `SchemaRegistered` event logs
 * relies on this ordering matching `seededRealms.schemas` JSON keys.
 *
 * **Append, never insert.** Ids are handed out sequentially as schemas are
 * registered, so adding `killReceipt` at the end leaves every existing id
 * where it was and the seeder's log recovery assigns the new one the next
 * free number. Inserting it in the middle would renumber the schemas an
 * already-deployed chain had issued, and every persisted `schemaId` —
 * including the ones on minted tokens — would then point at the wrong thing.
 */
export const SCHEMA_ORDER: readonly SchemaKey[] = [
  "clearReceipt",
  "loot",
  "killReceipt",
];
