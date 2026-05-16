/**
 * Reader for the per-chain adapter map written by `pnpm seed:adapters`
 * (see `apps/web/scripts/seed-adapters.ts`).
 *
 * `seeded-adapters.json` mirrors the `seeded-realms.json` shape: one
 * entry per chainId, with a per-(slot, sourcePreset, targetPreset) map
 * of deployed adapter addresses. Zero address means "not deployed yet"
 * — callers should bail out gracefully (the equip path falls back to
 * the foreign card's untranslated stats so play isn't blocked).
 *
 * Pure: no React, no wagmi. Safe to import from server and client.
 */

import { activeChain } from "@/lib/chain";
import type { Preset } from "@/lib/engine/types";
import { ZERO_ADDRESS } from "./realm-picker";
import data from "./.seeded-adapters.json";

type Slot = "weapon" | "armor";
type AdaptersBySlot = Record<Slot, Record<Preset, Record<Preset, string>>>;

type SeededChainEntry = {
  adapters: AdaptersBySlot;
  seededAt: string | null;
};

const raw = data as unknown as Record<string, SeededChainEntry | undefined>;

function entry(): SeededChainEntry | undefined {
  return raw[String(activeChain.id)];
}

/**
 * Adapter address for translating a `slot` asset from `source` preset's
 * schema into `target` preset's schema. Returns the zero address when
 * the seeder has not deployed this pair yet, or when source == target
 * (a no-op translation is a bug — caller should detect mismatch first).
 */
export function getAdapterAddress(
  slot: Slot,
  source: Preset,
  target: Preset,
): `0x${string}` {
  if (source === target) return ZERO_ADDRESS;
  const e = entry();
  if (!e) return ZERO_ADDRESS;
  const addr = e.adapters?.[slot]?.[source]?.[target];
  if (!addr) return ZERO_ADDRESS;
  return addr as `0x${string}`;
}

/** ISO timestamp of the last successful adapter seed for the active chain. */
export function getAdaptersSeededAt(): string | null {
  return entry()?.seededAt ?? null;
}
