/**
 * Off-chain adapter integration.
 *
 * Each preset is now its own schema family — the weapon/armor extension
 * structs are declared natively per preset (Fantasy {fire/ice/...},
 * Sci-Fi {plasma/cryo/...}, Cyberpunk {incendiary/cryogenic/...}). The
 * three structs are *shape-identical* on the wire (the PoC has 1:1
 * stat parity), but the element enum names differ. The 12
 * ordered-pair adapter contracts under `contracts/src/adapters/`
 * encode the schema crossing — each adapter decodes its source
 * schema, applies its hard-coded rebalance (cyberpunk-direction for
 * weapons, fantasy-direction for armor), and re-encodes against its
 * target schema.
 *
 * This module is the off-chain mirror:
 *
 *   1. `presetForRealm(realm)` resolves a card's source preset by
 *      address (uses the seeded-realms map).
 *
 *   2. `encodeWeaponExt(card, sourcePreset)` / `encodeArmorExt(card,
 *      sourcePreset)` pack a card's stats into the ABI shape the
 *      adapter expects on `extensionData`. The wire shape mirrors any
 *      one of the three weapon/armor schemas (all three are
 *      shape-identical) — what differs is the element index, which is
 *      taken from the source preset's native vocabulary.
 *
 *   3. `translateCardForRealm({card, targetRealm, publicClient})`
 *      picks the right (slot, source→target) adapter from the seeded
 *      map, calls `IAdapter.translate` (a `view`), and rebuilds an
 *      `AssetCard` with the target preset's native vocabulary
 *      (decoding the element index against `elementsFor(targetPreset)`).
 *
 *   4. `useTranslatedCard(card, targetRealm)` wraps (3) in a React
 *      Query keyed by `(tokenId, targetRealm)`.
 *
 * No translation happens for native cards (same preset) or for cards
 * whose source preset cannot be resolved (the realm is not in the
 * seeded map). The hook returns the input card unchanged in those
 * cases — the caller's UI continues to render the card's native
 * vocabulary.
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
  ArmorType,
  AssetCard,
  Element,
  Preset,
  Tier,
  WeaponType,
} from "@/lib/engine/types";
import {
  armorTypeFromIndex,
  armorTypeIndex,
  elementFromIndex,
  elementIndex,
  weaponTypeFromIndex,
  weaponTypeIndex,
} from "@/lib/engine/types";
import { buildAssetCardFromMetadata } from "@/lib/metadata/asset-card";
import { armorName, weaponName } from "@/lib/loot/names";
import { adapterAbi } from "./adapter-abi";
import { getAdapterAddress } from "./seeded-adapters";
import { getSeededRealm } from "./seeded-realms";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

// ---------------------------------------------------------------------------
// DamageDie enum (shared library DamageDie.sol). Identical across every
// weapon schema — the die ladder is the unit of combat math.
// ---------------------------------------------------------------------------

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
 * scanning the seeded-realms map. Returns null when the realm isn't
 * one of the three starter realms — for the PoC this also means "we
 * have no adapter for it" since adapters are deployed only against
 * the canonical preset schemas.
 */
export function presetForRealm(realm: `0x${string}`): Preset | null {
  if (!realm || realm === ZERO_ADDRESS) return null;
  const target = realm.toLowerCase();
  for (const p of PRESETS) {
    if (getSeededRealm(p).toLowerCase() === target) return p;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Element label lookup
// ---------------------------------------------------------------------------

/**
 * Picks a deployed adapter that *names* `preset` in either its source
 * or target schema, and reports which view (`sourceElementLabel` vs
 * `targetElementLabel`) maps a numeric index onto a string in that
 * vocabulary. Used by the on-chain label lookup below. Returns null
 * when nothing has been seeded yet.
 */
function findLabelAdapter(
  preset: Preset,
): { adapter: `0x${string}`; view: "sourceElementLabel" | "targetElementLabel" } | null {
  // Prefer the weapon-slot adapter where `preset` is the source.
  for (const tgt of PRESETS) {
    if (tgt === preset) continue;
    const addr = getAdapterAddress("weapon", preset, tgt);
    if (addr !== ZERO_ADDRESS) return { adapter: addr, view: "sourceElementLabel" };
  }
  // Fall back to where `preset` is the target.
  for (const src of PRESETS) {
    if (src === preset) continue;
    const addr = getAdapterAddress("weapon", src, preset);
    if (addr !== ZERO_ADDRESS) return { adapter: addr, view: "targetElementLabel" };
  }
  return null;
}

/**
 * Reads the on-chain label for `(preset, element)` from a deployed
 * adapter that names `preset` in its schema family.
 *
 * Note: in the post-refactor world, `card.element` already carries
 * the *native* string for its source preset, so most UIs can just
 * render `card.element` directly without consulting this hook.
 * Kept for components that want to verify "this element index, as
 * read by the on-chain schema, renders as X" — a contract-anchored
 * cross-check rather than a routine display path.
 *
 * The synchronous placeholder while the read resolves is `element`
 * itself, which is already a valid display string post-refactor.
 */
export function useElementLabel(
  element: Element,
  preset: Preset | null,
): string {
  const publicClient = usePublicClient();
  const labelAdapter = preset ? findLabelAdapter(preset) : null;
  const elementIdx = preset ? elementIndex(preset, element) : 0;

  const query = useQuery<string>({
    queryKey: [
      "elementLabel",
      labelAdapter?.adapter.toLowerCase() ?? "none",
      labelAdapter?.view ?? "none",
      preset ?? "none",
      elementIdx,
    ],
    enabled: !!publicClient && !!labelAdapter && preset !== null,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const label = (await publicClient!.readContract({
        address: labelAdapter!.adapter,
        abi: adapterAbi,
        functionName: labelAdapter!.view,
        args: [elementIdx],
      })) as string;
      return label;
    },
  });

  return query.data ?? element;
}

// ---------------------------------------------------------------------------
// Extension data codec
// ---------------------------------------------------------------------------

// Wire tuple shape — identical across every preset's weapon schema (the
// three schemas declare structurally identical structs over their own
// native element + weaponType enums).
//
//   WeaponSchema.Ext { DamageDie damageDie; int8 attackBonus; int8 damageBonus;
//                      Element element; WeaponType weaponType; }
//   ArmorSchema.Ext  { int8 acBonus; int8 hpBonus;
//                      Element resistElement; ArmorType armorType; }
//
// Both new uint8 fields are index-identity cast across presets by the on-
// chain adapters (1=heavy/Axe/Shotgun/Cannon, 2=light/Dagger/Knife/Pistol, etc.)
// just like Element. Per-(adapter, sourceType) stat deltas land in the
// adapter contracts, not the wire shape.
const WEAPON_EXT_TUPLE = parseAbiParameters(
  "(uint8 damageDie, int8 attackBonus, int8 damageBonus, uint8 element, uint8 weaponType)",
);
const ARMOR_EXT_TUPLE = parseAbiParameters(
  "(int8 acBonus, int8 hpBonus, uint8 resistElement, uint8 armorType)",
);

/**
 * Pack a weapon card's stats into the on-chain extension bytes the
 * adapter expects. `sourcePreset` selects which preset's vocabulary
 * the `element` string is interpreted against — the resulting enum
 * index is whatever that preset's `Element` enum has at the matching
 * position.
 */
function encodeWeaponExt(card: AssetCard, sourcePreset: Preset): `0x${string}` {
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
      element: elementIndex(sourcePreset, card.element ?? "none"),
      weaponType: weaponTypeIndex(sourcePreset, card.weaponType ?? "none"),
    },
  ]);
}

function encodeArmorExt(card: AssetCard, sourcePreset: Preset): `0x${string}` {
  return encodeAbiParameters(ARMOR_EXT_TUPLE, [
    {
      acBonus: card.acBonus ?? 0,
      hpBonus: card.hpBonus ?? 0,
      resistElement: elementIndex(sourcePreset, card.resistElement ?? "none"),
      armorType: armorTypeIndex(sourcePreset, card.armorType ?? "none"),
    },
  ]);
}

type DecodedWeaponStats = {
  damageDie: number;
  attackBonus: number;
  damageBonus: number;
  element: Element;
  weaponType: WeaponType;
};
type DecodedArmorStats = {
  acBonus: number;
  hpBonus: number;
  resistElement: Element;
  armorType: ArmorType;
};

/**
 * Decode the adapter's returned extension bytes back into a JS object.
 * `targetPreset` selects which preset's vocabulary the element + type
 * indexes map onto — same index, different name across presets (PoC's
 * index-identity rule).
 */
function decodeWeaponExt(
  data: `0x${string}`,
  targetPreset: Preset,
): DecodedWeaponStats {
  const [ext] = decodeAbiParameters(WEAPON_EXT_TUPLE, data);
  const dieOnchain = Number(ext.damageDie);
  const elemOnchain = Number(ext.element);
  const typeOnchain = Number(ext.weaponType);
  return {
    damageDie: ONCHAIN_TO_DIE[dieOnchain] ?? 6,
    attackBonus: Number(ext.attackBonus),
    damageBonus: Number(ext.damageBonus),
    element: elementFromIndex(targetPreset, elemOnchain),
    weaponType: weaponTypeFromIndex(targetPreset, typeOnchain),
  };
}

function decodeArmorExt(
  data: `0x${string}`,
  targetPreset: Preset,
): DecodedArmorStats {
  const [ext] = decodeAbiParameters(ARMOR_EXT_TUPLE, data);
  const elemOnchain = Number(ext.resistElement);
  const typeOnchain = Number(ext.armorType);
  return {
    acBonus: Number(ext.acBonus),
    hpBonus: Number(ext.hpBonus),
    resistElement: elementFromIndex(targetPreset, elemOnchain),
    armorType: armorTypeFromIndex(targetPreset, typeOnchain),
  };
}

// ---------------------------------------------------------------------------
// Metadata rebuild — translated stats become a new metadata URI so the
// returned card is decoded via the same `buildAssetCardFromMetadata`
// path every other card uses.
// ---------------------------------------------------------------------------

function b64(s: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(s, "utf8").toString("base64");
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

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
    if (weapon.weaponType !== "none") {
      attributes.push({ trait_type: "weapon_type", value: weapon.weaponType });
    }
  }
  if (armor) {
    attributes.push({ trait_type: "ac_bonus", value: armor.acBonus });
    attributes.push({ trait_type: "hp_bonus", value: armor.hpBonus });
    if (armor.resistElement !== "none") {
      attributes.push({ trait_type: "resist_element", value: armor.resistElement });
    }
    if (armor.armorType !== "none") {
      attributes.push({ trait_type: "armor_type", value: armor.armorType });
    }
  }
  for (const eff of original.catalogEffects) {
    attributes.push({ trait_type: eff.name, value: eff.value });
  }
  // Translated display name: mirror of the on-chain `name(type, tier)`
  // view for the target preset, when a type was present. Falls back to
  // the original (source-preset) name for un-archetyped legacy gear.
  const translatedName =
    weapon && weapon.weaponType !== "none"
      ? weaponName(targetPreset, weapon.weaponType, original.tier) || original.name
      : armor && armor.armorType !== "none"
        ? armorName(targetPreset, armor.armorType, original.tier) || original.name
        : original.name;
  const json = {
    name: translatedName,
    description: `${translatedName} (translated for ${targetPreset}).`,
    image: TRANSLATED_PLACEHOLDER_SVG_URI,
    attributes,
    seed_protocol: {
      schemaId: translatedSchemaId,
      tier: original.tier,
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

export class AdapterCallFailed extends Error {
  readonly adapter: `0x${string}`;
  constructor(adapter: `0x${string}`, cause: unknown) {
    super(`adapter ${adapter} call failed: ${String(cause)}`);
    this.name = "AdapterCallFailed";
    this.adapter = adapter;
  }
}

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
  if (adapter === ZERO_ADDRESS) return card;

  const extensionData =
    card.slot === "weapon"
      ? encodeWeaponExt(card, sourcePreset)
      : encodeArmorExt(card, sourcePreset);

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
    throw new AdapterCallFailed(adapter, err);
  }

  const [translatedAttrs, translatedExt] = translated;
  const translatedSchemaId = Number(translatedAttrs.extensionSchemaId);

  let weapon: DecodedWeaponStats | undefined;
  let armor: DecodedArmorStats | undefined;
  if (card.slot === "weapon") weapon = decodeWeaponExt(translatedExt, targetPreset);
  else armor = decodeArmorExt(translatedExt, targetPreset);

  const metadataURI = buildTranslatedMetadataURI({
    original: card,
    translatedSchemaId,
    targetPreset,
    weapon,
    armor,
  });

  return buildAssetCardFromMetadata({
    tokenId: card.tokenId,
    tier: onchainToTier(Number(translatedAttrs.tier)),
    schemaId: translatedSchemaId,
    metadataURI,
    mintedByRealm: card.realm,
  });
}

// ---------------------------------------------------------------------------
// React hook — caches by (tokenId, targetRealm).
// ---------------------------------------------------------------------------

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

  const query = useQuery<AssetCard | undefined>({
    // In-memory starters share tokenId 0n across slots, so the key must
    // also distinguish slot + source realm — otherwise the armor chip
    // subscribes to the weapon's cached translation (and vice versa).
    queryKey: [
      "translatedCard",
      card?.slot ?? "none",
      card?.realm?.toLowerCase() ?? "none",
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
