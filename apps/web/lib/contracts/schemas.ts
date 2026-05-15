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
} as const;

export type SchemaKey = keyof typeof SCHEMAS;

/**
 * Ordered list of `(key, definition)` pairs. The seeder iterates this
 * array — and only this array — so the on-chain registration order is
 * deterministic. Idempotent recovery from `SchemaRegistered` event logs
 * relies on this ordering matching `seededRealms.schemas` JSON keys.
 */
export const SCHEMA_ORDER: readonly SchemaKey[] = ["clearReceipt", "loot"];
