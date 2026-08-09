/**
 * Resolver for the on-chain `CatalogEffectRegistry`.
 *
 * Architecture:
 *
 *     on-chain CatalogEffectRegistry  ──┐
 *                                       ├─→ seed script ─→ generated/catalog.json ─→ this resolver
 *        CANONICAL_CATALOG_EFFECTS (seed-time input only) ──┘
 *
 * Reads the build artifact `generated/catalog.json` synchronously — same
 * pattern as `seeded-realms.ts`. The chain is the source of truth in
 * connected play; the JSON is a regenerated mirror. When no entry exists
 * for the active chain (or the entry is unseeded zeros), falls back to
 * the canonical off-chain table so disconnected/trial mode and pre-seed
 * Base Sepolia still surface plausible effects.
 *
 * On-chain shape:
 *   ONE loot schemaId per preset (confirmed
 *   against `apps/web/lib/contracts/schemas.ts` which only registers
 *   `clearReceipt` + `loot` per realm). The on-chain registry therefore
 *   keys off that single schemaId; this resolver partitions the returned
 *   list by slot (weapon vs armor) using the
 *   `WEAPON_EFFECTS` / `ARMOR_EFFECTS` tables from
 *   `lib/engine/catalog.ts`.
 */

import { activeChain } from "@/lib/chain";
import type { CatalogEffectName, Preset, Slot } from "@/lib/engine/types";
import { ARMOR_EFFECTS, WEAPON_EFFECTS } from "@/lib/engine/catalog";
import {
  CANONICAL_CATALOG_EFFECTS,
  CATALOG_EFFECT_NAMES,
} from "./catalog-effects-config";
import { getSeededSchemaIds } from "./seeded-realms";
import data from "./generated/catalog.json";

type SeededCatalogEntry = {
  registry: string;
  schemas: Record<string, string[]>;
  seededAt: string | null;
};

const raw = data as unknown as Record<string, SeededCatalogEntry | undefined>;
const ZERO = "0x0000000000000000000000000000000000000000";

function entry(): SeededCatalogEntry | undefined {
  return raw[String(activeChain.id)];
}

/** True iff a real registry has been deployed for the active chain. */
export function isCatalogRegistrySeeded(): boolean {
  const e = entry();
  return Boolean(e && e.registry && e.registry !== ZERO && e.seededAt);
}

/** Registry address for the active chain, or null if unseeded. */
export function getCatalogRegistryAddress(): `0x${string}` | null {
  const e = entry();
  if (!e || e.registry === ZERO || !e.seededAt) return null;
  return e.registry as `0x${string}`;
}

/**
 * Filter unknown / malformed names. Anything in the JSON that doesn't
 * map to a known `CatalogEffectName` is dropped — never crashes the
 * loot roll.
 */
function sanitizeNames(names: readonly string[]): CatalogEffectName[] {
  const out: CatalogEffectName[] = [];
  for (const n of names) {
    if ((CATALOG_EFFECT_NAMES as readonly string[]).includes(n)) {
      out.push(n as CatalogEffectName);
    } else if (typeof console !== "undefined" && n !== "") {
      // eslint-disable-next-line no-console
      console.warn(`[catalog-effects] dropping unknown effect name "${n}"`);
    }
  }
  return out;
}

/**
 * Return the on-chain–declared (or fallback) catalog effects for a
 * given preset's loot schema, partitioned by slot. The returned arrays
 * preserve declaration order, filtered by which slot each effect
 * belongs to according to `catalog.ts`.
 */
export function getEffectsByPreset(
  preset: Preset,
): { weapon: CatalogEffectName[]; armor: CatalogEffectName[] } {
  const seeded = entry();
  const lootId = getSeededSchemaIds(preset).loot;

  // Prefer the registry-mirrored JSON when seeded — that's the truth in
  // connected play. Fall back to the canonical off-chain table otherwise.
  let union: CatalogEffectName[];
  if (
    seeded &&
    seeded.registry !== ZERO &&
    seeded.seededAt &&
    lootId !== 0n &&
    seeded.schemas[String(lootId)]
  ) {
    union = sanitizeNames(seeded.schemas[String(lootId)]);
  } else {
    union = [...CANONICAL_CATALOG_EFFECTS[preset]];
  }

  const weapon: CatalogEffectName[] = [];
  const armor: CatalogEffectName[] = [];
  for (const name of union) {
    if (WEAPON_EFFECTS[name]) {
      weapon.push(name);
    } else if (ARMOR_EFFECTS[name]) {
      armor.push(name);
    }
    // If neither table claims the name, it's a slot-less effect — drop.
  }
  return { weapon, armor };
}

/**
 * Lookup catalog effects for a specific (preset, slot). Thin wrapper
 * around `getEffectsByPreset` for call-sites that only care about one
 * slot at a time.
 */
export function getCatalogEffectsForSlot(
  preset: Preset,
  slot: Exclude<Slot, "accessory">,
): CatalogEffectName[] {
  const both = getEffectsByPreset(preset);
  return slot === "weapon" ? both.weapon : both.armor;
}
