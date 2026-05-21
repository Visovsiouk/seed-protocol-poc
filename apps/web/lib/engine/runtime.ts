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
 *
 * Metadata-as-truth: every in-memory `AssetCard` produced here — starter
 * gear, disconnected loot drops, locally-equipped fresh mints — is built
 * by routing a LootRoll-shaped record through `buildLootMetadataURI` and
 * back out through `buildAssetCardFromMetadata`. The engine therefore
 * reads stats off the same place regardless of whether a card is
 * synthetic or backed by an on-chain `mintAsset` call, which is the
 * integration seam the adapter work plugs into (an adapter just
 * rewrites the URI; the decoder handles the rest).
 */

import type { AssetCard as AssetCardType, LootRoll, Preset } from "@/lib/engine/types";
import type { RealmSchemas } from "@/lib/engine/loot";
import { assembleLootName, getFlavorBank } from "@/lib/flavor";
import { buildLootMetadataURI } from "@/lib/contracts/loot-derive";
import { buildAssetCardFromMetadata } from "@/lib/metadata/asset-card";

export const VALID_PRESETS: ReadonlySet<Preset> = new Set([
  "fantasy",
  "scifi",
  "cyberpunk",
]);

// Per-preset starter weapon/armor names. Stats live in `makeStarterGear`
// below — modest on purpose so the first encounter is winnable bare-bones
// and real loot still feels like an upgrade.
const STARTER_NAMES: Record<Preset, { weapon: string; armor: string }> = {
  fantasy: { weapon: "Rusted Shortsword", armor: "Patched Leather" },
  scifi: { weapon: "Service Sidearm", armor: "Crew Coveralls" },
  cyberpunk: { weapon: "Stun Baton", armor: "Scuffed Jacket" },
};

/**
 * Single chokepoint for turning a `LootRoll` into an `AssetCard`. Builds the
 * renderer-compatible metadata data URI from the loot, then immediately
 * decodes it back through the same path on-chain assets use. The result is
 * a card whose `metadataURI` is the canonical source of truth for every
 * stat the engine reads — `damageDie`, `attackBonus`, `element`,
 * catalog effects, and `extraFields` all flow through the URI rather than
 * being synthesized into the card directly.
 */
function lootRoundtripToCard(args: {
  loot: LootRoll;
  preset: Preset;
  realm: `0x${string}`;
  realmName: string;
  assembledName: string;
  tokenId: bigint;
}): AssetCardType {
  const metadataURI = buildLootMetadataURI({
    loot: args.loot,
    preset: args.preset,
    realmLabel: args.realmName,
    assembledName: args.assembledName,
  });
  return buildAssetCardFromMetadata({
    tokenId: args.tokenId,
    tier: args.loot.tier,
    schemaId: args.loot.schemaId,
    metadataURI,
    mintedByRealm: args.realm,
  });
}

// Starter weapon/armor handed to the player at run start. These are
// in-memory cards (tokenId 0n) — not real on-chain assets — so the first
// encounter is winnable out of the box. Stats are pinned to the
// Tier 1 floor (d4 / +0 / +0 for weapons, +1 AC / +5 HP for armor) so
// every real drop — even another T1 — is a strictly equal-or-better roll
// once flavor effects land. The cards are produced by the same metadata
// roundtrip every other card uses (see `lootRoundtripToCard`), so the
// engine never has to special-case starter gear.
export function makeStarterGear(
  preset: Preset,
  realm: `0x${string}`,
  realmName: string,
): { weapon: AssetCardType; armor: AssetCardType } {
  const names = STARTER_NAMES[preset];
  const weaponLoot: LootRoll = {
    tier: 1,
    slot: "weapon",
    schemaId: 0,
    damageDie: 4,
    attackBonus: 0,
    damageBonus: 0,
    catalogEffects: [],
    nameSeed: 0n,
    extraFields: {},
  };
  const armorLoot: LootRoll = {
    tier: 1,
    slot: "armor",
    schemaId: 0,
    acBonus: 1,
    hpBonus: 5,
    catalogEffects: [],
    nameSeed: 0n,
    extraFields: {},
  };
  return {
    weapon: lootRoundtripToCard({
      loot: weaponLoot,
      preset,
      realm,
      realmName,
      assembledName: names.weapon,
      tokenId: 0n,
    }),
    armor: lootRoundtripToCard({
      loot: armorLoot,
      preset,
      realm,
      realmName,
      assembledName: names.armor,
      tokenId: 0n,
    }),
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
 * AssetCard built from a LootRoll, used to populate the local disconnected
 * / trial-mode inventory and to auto-equip a freshly-minted drop without
 * waiting for the on-chain inventory query to refetch.
 *
 * `tokenId` override: pass the value returned by `useMintLoot` so the
 * locally-equipped card reconciles by id with the on-chain card once the
 * inventoryCards query lands. Omit it in disconnected mode and the module-
 * scoped counter assigns a unique synthetic id.
 */
let nextMockTokenId = 1n;
export function lootRollToMockCard(
  loot: LootRoll,
  preset: Preset,
  realm: `0x${string}`,
  realmName: string,
  opts?: { tokenId?: bigint },
): AssetCardType {
  const bank = getFlavorBank(preset);
  // Story-object drops (e.g. Genesis' Pilgrim's Brand) ship with a name
  // override on the LootRoll; skip the realm-themed adjective+noun assembly
  // so the card reads as the named object the narration just described.
  const assembledName =
    loot.nameOverride ??
    assembleLootName(bank, loot.slot as "weapon" | "armor", loot.nameSeed);
  return lootRoundtripToCard({
    loot,
    preset,
    realm,
    realmName,
    assembledName,
    tokenId: opts?.tokenId ?? nextMockTokenId++,
  });
}
