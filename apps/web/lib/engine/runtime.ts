/**
 * Shared runtime helpers for the play routes.
 *
 * Extracted from `app/play/[preset]/page.tsx` so the upcoming
 * `app/play/realm/[address]/page.tsx` (creator-realm trial mode) can
 * reuse the same starter gear, schema map, fallback seed, and
 * mock-card conversion without duplicating the logic.
 *
 * Everything here is pure (no React, no `server-only`) and safe to
 * call from both client components and tests.
 */

import type { AssetCard as AssetCardType, LootRoll, Preset } from "@/lib/engine/types";
import type { RealmSchemas } from "@/lib/engine/loot";
import { assembleLootName, getFlavorBank } from "@/lib/flavor";

export const VALID_PRESETS: ReadonlySet<Preset> = new Set([
  "fantasy",
  "scifi",
  "cyberpunk",
]);

// Starter weapon/armor handed to the player at run start. These are
// in-memory cards (tokenId 0n, empty metadataURI) — not real on-chain
// assets — so the first encounter is winnable out of the box. Stats are
// modest so loot drops still feel like an upgrade: d6 + 1 attack vs.
// bare-handed, and +5 HP / +1 AC vs. base 25 HP / AC 10.
export function makeStarterGear(
  preset: Preset,
  realm: `0x${string}`,
  realmName: string,
): { weapon: AssetCardType; armor: AssetCardType } {
  const names: Record<Preset, { weapon: string; armor: string }> = {
    fantasy: { weapon: "Rusted Shortsword", armor: "Patched Leather" },
    scifi: { weapon: "Service Sidearm", armor: "Crew Coveralls" },
    cyberpunk: { weapon: "Stun Baton", armor: "Scuffed Jacket" },
  };
  const base = {
    tokenId: 0n,
    realm,
    realmName,
    tier: 1 as const,
    catalogEffects: [],
    extraFields: {},
    metadataURI: "",
    preseed: false,
  };
  return {
    weapon: {
      ...base,
      schemaId: 0,
      slot: "weapon",
      name: names[preset].weapon,
      damageDie: 6,
      attackBonus: 1,
    },
    armor: {
      ...base,
      schemaId: 0,
      slot: "armor",
      name: names[preset].armor,
      acBonus: 1,
      hpBonus: 5,
    },
  };
}

// PoC: canonical schema ids per preset. Real schemas come from the realm
// contract; the engine only needs (schemaId, declared catalog effects).
export const CANONICAL_SCHEMAS: Record<Preset, RealmSchemas> = {
  fantasy: {
    weapon: { schemaId: 101, catalogEffects: [] },
    armor: { schemaId: 102, catalogEffects: [] },
  },
  scifi: {
    weapon: { schemaId: 201, catalogEffects: [] },
    armor: { schemaId: 202, catalogEffects: [] },
  },
  cyberpunk: {
    weapon: { schemaId: 301, catalogEffects: [] },
    armor: { schemaId: 302, catalogEffects: [] },
  },
};

/**
 * Draw a 256-bit hex seed from the browser's CSPRNG. The connected
 * play path uses an on-chain commitment instead; this is the
 * disconnected / trial-mode fallback.
 */
export function fallbackSeed(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return ("0x" +
    Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")) as `0x${string}`;
}

/**
 * Mock AssetCard built from a LootRoll, used to populate the local
 * disconnected / trial-mode inventory. The tokenId counter is module-
 * scoped so concurrently mounted play routes still produce unique
 * synthetic ids within a session.
 */
let nextMockTokenId = 1n;
export function lootRollToMockCard(
  loot: LootRoll,
  preset: Preset,
  realm: `0x${string}`,
  realmName: string,
): AssetCardType {
  const bank = getFlavorBank(preset);
  return {
    tokenId: nextMockTokenId++,
    schemaId: loot.schemaId,
    realm,
    realmName,
    slot: loot.slot,
    tier: loot.tier,
    name: assembleLootName(bank, loot.slot as "weapon" | "armor", loot.nameSeed),
    damageDie: loot.damageDie,
    attackBonus: loot.attackBonus,
    damageBonus: loot.damageBonus,
    acBonus: loot.acBonus,
    hpBonus: loot.hpBonus,
    catalogEffects: loot.catalogEffects,
    extraFields: loot.extraFields,
    metadataURI: "",
    preseed: false,
  };
}
