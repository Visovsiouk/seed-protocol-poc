/**
 * Off-chain adapter integration.
 *
 * When a player carries a card minted under one preset's loot schema
 * into another preset's realm, the engine still needs to read canonical
 * stats off the card. The adapters live on-chain — one
 * `PresetWeaponAdapter` / `PresetArmorAdapter` per ordered preset pair,
 * registered against the `AdapterRegistry` by `pnpm seed:adapters`.
 *
 * This module is the read-side bridge:
 *
 *   1. `presetForRealm(realm)` resolves a card's source preset by
 *      address (uses the seeded-realms map).
 *
 *   2. `encodeWeaponExt` / `encodeArmorExt` pack a card's stats into the
 *      ABI shape the adapter expects on `extensionData`. The shape mirrors
 *      `contracts/src/PresetTypes.sol :: WeaponExt / ArmorExt` exactly —
 *      changing either side without the other will produce a
 *      `BufferUnderrunError` at decode time.
 *
 *   3. `translateCardForRealm({card, targetRealm, publicClient})` calls
 *      `IAdapter.translate` (a `view`), takes the resulting metadata URI
 *      back through the same `buildAssetCardFromMetadata` path on-chain
 *      cards use, and returns the translated card. The card's
 *      `metadataURI` is rewritten so metadata-as-truth is preserved — the
 *      engine reads translated stats the same way it reads native ones.
 *
 *   4. `useTranslatedCard(card, targetRealm)` wraps (3) in a React Query
 *      that caches by `(tokenId, targetSchemaId)` — re-equipping the same
 *      card across realm hops doesn't re-hit the chain.
 *
 * No translation happens for native cards (`card.realm === targetRealm`
 * by preset, or the preset can't be resolved). The hook returns the
 * input card unchanged in that case.
 */

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import {
  decodeAbiParameters,
  encodeAbiParameters,
  parseAbiParameters,
  type PublicClient,
} from "viem";

import type {
  AssetCard,
  Element,
  Preset,
  Tier,
} from "@/lib/engine/types";
import { buildAssetCardFromMetadata } from "@/lib/metadata/asset-card";
import { adapterAbi } from "./adapter-abi";
import { getAdapterAddress } from "./seeded-adapters";
import { getSeededRealm } from "./seeded-realms";

// ---------------------------------------------------------------------------
// Preset/element/die enum encoders. Order MUST match the Solidity enums in
// contracts/src/PresetTypes.sol — changing either side without the other
// silently produces wrong stats. The Solidity enums are documented as
// "matches off-chain order"; this module is the off-chain side of that pact.
// ---------------------------------------------------------------------------

const PRESET_TO_ONCHAIN: Record<Preset, number> = {
  fantasy: 0,
  scifi: 1,
  cyberpunk: 2,
};

const ELEMENT_TO_ONCHAIN: Record<Element, number> = {
  none: 0,
  fire: 1,
  ice: 2,
  shock: 3,
  holy: 4,
  unholy: 5,
};

const ONCHAIN_TO_ELEMENT: readonly Element[] = [
  "none",
  "fire",
  "ice",
  "shock",
  "holy",
  "unholy",
] as const;

// DamageDie enum: 0=D4, 1=D6, 2=D8, 3=D10, 4=D12 (PresetTypes.sol).
const DIE_TO_ONCHAIN: Record<number, number> = { 4: 0, 6: 1, 8: 2, 10: 3, 12: 4 };
const ONCHAIN_TO_DIE: readonly number[] = [4, 6, 8, 10, 12];

// CoreAttributes.Tier on-chain is 0-indexed (T1=0..T5=4); engine surface is 1..5.
function tierToOnchain(t: Tier): number {
  return Math.max(0, t - 1);
}
function onchainToTier(n: number): Tier {
  return (Math.min(5, Math.max(1, n + 1))) as Tier;
}

// ---------------------------------------------------------------------------
// Preset resolution
// ---------------------------------------------------------------------------

const PRESETS: readonly Preset[] = ["fantasy", "scifi", "cyberpunk"] as const;

/**
 * Maps a realm address (the card's `mintedBy`) back to its preset by
 * scanning the seeded-realms map. Returns null when the realm isn't one
 * of the three starter realms — for the PoC this also means "we have no
 * adapter for it" since adapters are deployed only against the canonical
 * preset schemas.
 */
export function presetForRealm(realm: `0x${string}`): Preset | null {
  if (!realm || realm === "0x0000000000000000000000000000000000000000") return null;
  const target = realm.toLowerCase();
  for (const p of PRESETS) {
    if (getSeededRealm(p).toLowerCase() === target) return p;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Extension data codec
// ---------------------------------------------------------------------------

// Tuple shapes mirror `contracts/src/PresetTypes.sol`:
//   WeaponExt { DamageDie damageDie; int8 attackBonus; int8 damageBonus; Element element; }
//   ArmorExt  { int8 acBonus; int8 hpBonus; Element resistElement; }
const WEAPON_EXT_TUPLE = parseAbiParameters(
  "(uint8 damageDie, int8 attackBonus, int8 damageBonus, uint8 element)",
);
const ARMOR_EXT_TUPLE = parseAbiParameters(
  "(int8 acBonus, int8 hpBonus, uint8 resistElement)",
);

function encodeWeaponExt(card: AssetCard): `0x${string}` {
  // Default die is D6 if absent. Real on-chain cards always have one (the
  // mint route's bounds validator requires it), but starter-gear cards
  // emitted by `runtime.ts` can technically omit it. We never call the
  // adapter on starter gear (it has schemaId=0, no preset match), so this
  // is a defensive default rather than an expected code path.
  const die = card.damageDie ?? 6;
  const dieOnchain = DIE_TO_ONCHAIN[die];
  if (dieOnchain === undefined) {
    throw new Error(`Card ${card.tokenId} has invalid damageDie=${die}`);
  }
  return encodeAbiParameters(WEAPON_EXT_TUPLE, [
    {
      damageDie: dieOnchain,
      attackBonus: card.attackBonus ?? 0,
      damageBonus: card.damageBonus ?? 0,
      element: ELEMENT_TO_ONCHAIN[card.element ?? "none"],
    },
  ]);
}

function encodeArmorExt(card: AssetCard): `0x${string}` {
  return encodeAbiParameters(ARMOR_EXT_TUPLE, [
    {
      acBonus: card.acBonus ?? 0,
      hpBonus: card.hpBonus ?? 0,
      resistElement: ELEMENT_TO_ONCHAIN[card.resistElement ?? "none"],
    },
  ]);
}

type DecodedWeaponStats = {
  damageDie: number;
  attackBonus: number;
  damageBonus: number;
  element: Element;
};
type DecodedArmorStats = { acBonus: number; hpBonus: number; resistElement: Element };

function decodeWeaponExt(data: `0x${string}`): DecodedWeaponStats {
  const [ext] = decodeAbiParameters(WEAPON_EXT_TUPLE, data);
  const dieOnchain = Number(ext.damageDie);
  const elemOnchain = Number(ext.element);
  return {
    damageDie: ONCHAIN_TO_DIE[dieOnchain] ?? 6,
    attackBonus: Number(ext.attackBonus),
    damageBonus: Number(ext.damageBonus),
    element: ONCHAIN_TO_ELEMENT[elemOnchain] ?? "none",
  };
}

function decodeArmorExt(data: `0x${string}`): DecodedArmorStats {
  const [ext] = decodeAbiParameters(ARMOR_EXT_TUPLE, data);
  const elemOnchain = Number(ext.resistElement);
  return {
    acBonus: Number(ext.acBonus),
    hpBonus: Number(ext.hpBonus),
    resistElement: ONCHAIN_TO_ELEMENT[elemOnchain] ?? "none",
  };
}

// ---------------------------------------------------------------------------
// Metadata rebuild — the translated stats need to become a new metadata
// URI so the card we hand back to the engine is *decoded* the same way as
// every other AssetCard. We rebuild a minimal data: URI here rather than
// reusing `buildLootMetadataURI` from loot-derive, because we don't have a
// `LootRoll` in hand (and don't want to invent one) — the input is the
// decoded translation tuple plus the original card's name/realm/tier.
// ---------------------------------------------------------------------------

function b64(s: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(s, "utf8").toString("base64");
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

/**
 * Minimal inline SVG. `decodeMetadataURI` validates that
 * `json.image` is a base64 SVG data URI and throws otherwise — and
 * `buildAssetCardFromMetadata` silently swallows that throw and returns
 * a stat-less card. Translated cards don't surface an image anywhere,
 * but the contract has to be honoured.
 */
const TRANSLATED_PLACEHOLDER_SVG_URI =
  "data:image/svg+xml;base64," +
  (typeof Buffer !== "undefined"
    ? Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>', "utf8").toString(
        "base64",
      )
    : btoa('<svg xmlns="http://www.w3.org/2000/svg"/>'));

function buildTranslatedMetadataURI(args: {
  original: AssetCard;
  translatedSchemaId: number;
  targetPreset: Preset;
  weapon?: DecodedWeaponStats;
  armor?: DecodedArmorStats;
}): string {
  const { original, translatedSchemaId, targetPreset, weapon, armor } = args;
  const attributes: { trait_type: string; value: string | number }[] = [
    { trait_type: "Tier", value: `T${original.tier}` },
    { trait_type: "Schema", value: `${targetPreset}:${translatedSchemaId}` },
    { trait_type: "slot", value: original.slot },
  ];
  if (weapon) {
    attributes.push({ trait_type: "damage_die", value: weapon.damageDie });
    attributes.push({ trait_type: "attack_bonus", value: weapon.attackBonus });
    attributes.push({ trait_type: "damage_bonus", value: weapon.damageBonus });
    if (weapon.element !== "none") {
      attributes.push({ trait_type: "element", value: weapon.element });
    }
  }
  if (armor) {
    attributes.push({ trait_type: "ac_bonus", value: armor.acBonus });
    attributes.push({ trait_type: "hp_bonus", value: armor.hpBonus });
    if (armor.resistElement !== "none") {
      attributes.push({ trait_type: "resist_element", value: armor.resistElement });
    }
  }
  for (const eff of original.catalogEffects) {
    attributes.push({ trait_type: eff.name, value: eff.value });
  }
  const json = {
    name: original.name,
    description: `${original.name} (translated for ${targetPreset}).`,
    image: TRANSLATED_PLACEHOLDER_SVG_URI,
    attributes,
    seed_protocol: {
      schemaId: translatedSchemaId,
      tier: original.tier,
      // The original realm label is kept so the inventory drawer can still
      // surface "Minted in <foreign realm>" — translation doesn't change
      // provenance, only stats.
      minted_by_realm_label: original.realmName,
      translated_target_preset: targetPreset,
    },
  };
  return `data:application/json;base64,${b64(JSON.stringify(json))}`;
}

// ---------------------------------------------------------------------------
// Translation (on-chain view call)
// ---------------------------------------------------------------------------

export type TranslateArgs = {
  card: AssetCard;
  /** The realm the player is *entering* — translation target. */
  targetRealm: `0x${string}`;
  publicClient: PublicClient;
};

/**
 * Thrown when the adapter `view` call reverts or the address has no
 * bytecode. The most common cause in dev is `.seeded-adapters.json`
 * pointing at addresses on a stale Anvil instance — re-run
 * `pnpm --filter web seed:adapters` after restarting the chain.
 */
export class AdapterCallFailed extends Error {
  readonly adapter: `0x${string}`;
  constructor(adapter: `0x${string}`, cause: unknown) {
    super(`adapter ${adapter} call failed: ${String(cause)}`);
    this.name = "AdapterCallFailed";
    this.adapter = adapter;
  }
}

/**
 * Returns a new `AssetCard` whose metadata URI carries the target
 * preset's translated stats, or the input card unchanged when no
 * translation is needed / possible:
 *
 *   - Source preset can't be resolved from `card.realm` (foreign realm
 *     not in the seeded map).
 *   - Source and target are the same preset.
 *   - Adapter is not registered for the (slot, source, target) triple.
 *   - Adapter call reverts.
 *
 * In every fall-back case the original card flows through unchanged, so
 * a missing adapter degrades to "use native stats" rather than blocking
 * the equip.
 */
export async function translateCardForRealm({
  card,
  targetRealm,
  publicClient,
}: TranslateArgs): Promise<AssetCard> {
  const sourcePreset = presetForRealm(card.realm);
  const targetPreset = presetForRealm(targetRealm);
  if (!sourcePreset || !targetPreset) return card;
  if (sourcePreset === targetPreset) return card;
  if (card.slot !== "weapon" && card.slot !== "armor") return card;

  const adapter = getAdapterAddress(card.slot, sourcePreset, targetPreset);
  if (adapter === "0x0000000000000000000000000000000000000000") return card;

  const extensionData =
    card.slot === "weapon" ? encodeWeaponExt(card) : encodeArmorExt(card);

  let translated: readonly [
    { tier: number; extensionSchemaId: bigint; metadataURI: string },
    `0x${string}`,
  ];
  try {
    translated = (await publicClient.readContract({
      address: adapter,
      abi: adapterAbi,
      functionName: "translate",
      args: [
        card.tokenId,
        {
          tier: tierToOnchain(card.tier),
          extensionSchemaId: BigInt(card.schemaId),
          metadataURI: card.metadataURI,
        },
        extensionData,
      ],
    })) as typeof translated;
  } catch (err) {
    // Adapter unavailable / reverted / RPC dropped. Surface as a thrown
    // error so the React Query layer can flip `isError` and the UI strip
    // can distinguish "translating…" from "tried and failed". Callers
    // outside the hook (e.g. `handleEquip`) catch and fall back to the
    // native card themselves.
    throw new AdapterCallFailed(adapter, err);
  }

  const [translatedAttrs, translatedExt] = translated;
  const translatedSchemaId = Number(translatedAttrs.extensionSchemaId);

  let weapon: DecodedWeaponStats | undefined;
  let armor: DecodedArmorStats | undefined;
  if (card.slot === "weapon") weapon = decodeWeaponExt(translatedExt);
  else armor = decodeArmorExt(translatedExt);

  const metadataURI = buildTranslatedMetadataURI({
    original: card,
    translatedSchemaId,
    targetPreset,
    weapon,
    armor,
  });

  // Hand the URI back through the canonical decoder so the translated
  // card has the same shape as a freshly-minted one.
  return buildAssetCardFromMetadata({
    tokenId: card.tokenId,
    tier: onchainToTier(Number(translatedAttrs.tier)),
    schemaId: translatedSchemaId,
    metadataURI,
    mintedByRealm: card.realm,
  });
}

// ---------------------------------------------------------------------------
// React hook — caches by (tokenId, targetSchemaId).
// ---------------------------------------------------------------------------

/**
 * Resolves a translated card for the target realm. Returns the original
 * card synchronously when no translation is needed; otherwise issues a
 * `view` call against the adapter and caches the result by
 * `(tokenId, targetSchemaId)` so re-equipping is free.
 *
 * Returns `data: card` when no translation is in-flight — the caller can
 * always read `data` and trust it's either the native card or the
 * translated one. `isFetching` is exposed for "translating…" UI affordances.
 */
export function useTranslatedCard(
  card: AssetCard | undefined,
  targetRealm: `0x${string}`,
): { data: AssetCard | undefined; isFetching: boolean; isError: boolean } {
  const publicClient = usePublicClient();

  const sourcePreset = card ? presetForRealm(card.realm) : null;
  const targetPreset = presetForRealm(targetRealm);
  const needsTranslation =
    !!card &&
    !!sourcePreset &&
    !!targetPreset &&
    sourcePreset !== targetPreset &&
    (card.slot === "weapon" || card.slot === "armor");

  // Cache key uses (tokenId, targetRealm). tokenId is unique per asset
  // and targetRealm carries the targetSchemaId implicitly via the
  // adapter map — so re-equipping the same card across the same hop
  // re-uses the cached translation, but a fresh mint with a different
  // tokenId triggers a new lookup.
  const query = useQuery<AssetCard | undefined>({
    queryKey: [
      "translatedCard",
      card?.tokenId?.toString() ?? "none",
      targetRealm.toLowerCase(),
    ],
    enabled: needsTranslation && !!publicClient,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      if (!card || !publicClient) return card;
      return translateCardForRealm({ card, targetRealm, publicClient });
    },
  });

  if (!needsTranslation) {
    return { data: card, isFetching: false, isError: false };
  }
  return {
    data: query.data ?? card,
    isFetching: query.isFetching,
    isError: query.isError,
  };
}

// Re-export for tests that exercise the codec without a chain.
export const __internal = {
  encodeWeaponExt,
  encodeArmorExt,
  decodeWeaponExt,
  decodeArmorExt,
  buildTranslatedMetadataURI,
};
