/**
 * Reader for the per-chain seeder output written by `pnpm seed`
 * (see `apps/web/scripts/seed-realms.ts`).
 *
 * The seeder produces `lib/contracts/generated/realms.json` — one entry per
 * `chainId` with the three starter-realm proxy addresses + the two schema
 * IDs registered by the seeder. The file is committed with zero
 * placeholders so dev/build still type-check before the seeder has run; a
 * zero address signals "not seeded yet" and the play route falls back to
 * the `Realm not deployed` panel via `isStarterRealmDeployed`.
 *
 * The file is consumed by:
 *   - `starter-realms.ts` (joins addresses with the engine-side `bossId`)
 *   - `/api/realm/*` routes (resolves the realm + owner per preset)
 *
 * It is *written* exclusively by the seeder script.
 */

import { activeChain } from "@/lib/chain";
import type { Preset } from "@/lib/engine/types";
import { ZERO_ADDRESS } from "./realm-picker";
import data from "./generated/realms.json";

/**
 * `killReceipt` is optional because a chain seeded before it was added has
 * no entry for it, and this reads whatever JSON is on disk.
 */
type SchemaPair = {
  clearReceipt: string;
  loot: string;
  killReceipt?: string;
};

type SeededChainEntry = {
  realms: Record<Preset, string>;
  /**
   * Schema IDs are global-monotonic in the SchemaRegistry, so each realm
   * has its own pair — the seeder runs `registerSchema` three times on
   * each preset's clone and gets {1,2}, {3,4}, {5,6}. Consumers that need
   * to filter `AssetMinted` events by schemaId must use the per-preset
   * pair, not a shared one.
   */
  schemas: Record<Preset, SchemaPair>;
  seededAt: string | null;
};

const raw = data as unknown as Record<string, SeededChainEntry | undefined>;

function entry(): SeededChainEntry | undefined {
  return raw[String(activeChain.id)];
}

/** Realm address for `preset` on the active chain, or zero if unseeded. */
export function getSeededRealm(preset: Preset): `0x${string}` {
  const e = entry();
  if (!e) return ZERO_ADDRESS;
  const addr = e.realms[preset];
  if (!addr) return ZERO_ADDRESS;
  return addr as `0x${string}`;
}

/**
 * Schema IDs registered by the seeder for `preset`'s realm. `0n` means
 * "not seeded yet" — routes that need a real schema ID (boss-cleared,
 * mint-loot) should reject the request rather than try a degenerate
 * on-chain call.
 */
export function getSeededSchemaIds(preset: Preset): {
  clearReceipt: bigint;
  loot: bigint;
  killReceipt: bigint;
} {
  // `killReceipt` defaults to 0n rather than being required, because a chain
  // seeded before it existed has no entry for it. 0n is the same "not
  // seeded" sentinel the other two already use, and callers already check
  // for it — see the `schema_not_seeded` branch in /api/realm/boss-cleared.
  const none = { clearReceipt: 0n, loot: 0n, killReceipt: 0n };
  const e = entry();
  if (!e) return none;
  const pair = e.schemas[preset];
  if (!pair) return none;
  return {
    clearReceipt: BigInt(pair.clearReceipt),
    loot: BigInt(pair.loot),
    killReceipt: BigInt(pair.killReceipt ?? "0"),
  };
}

/** ISO timestamp of the last successful seed for the active chain (or null). */
export function getSeededAt(): string | null {
  return entry()?.seededAt ?? null;
}
