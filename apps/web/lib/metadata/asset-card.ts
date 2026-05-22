/**
 * Pure mapping from on-chain `AssetSummary` + decoded metadata to the
 * engine-shaped `AssetCard`. Kept in `lib/metadata/` (alongside `decode.ts`)
 * so the unit tests don't transitively import the chain-config module
 * (`lib/chain.ts`) which validates `NEXT_PUBLIC_RPC_URL` at module load.
 *
 * The hydration pipeline (`lib/reads/inventory-cards.ts`) imports this
 * function and supplies the on-chain reads; this module knows nothing
 * about wagmi or viem.
 */

import type {
  ArmorType,
  AssetCard,
  CatalogEffect,
  CatalogEffectName,
  DamageDie,
  Element,
  Slot,
  Tier,
  WeaponType,
} from "@/lib/engine/types";
import {
  CYBERPUNK_ARMOR_TYPES,
  CYBERPUNK_ELEMENTS,
  CYBERPUNK_WEAPON_TYPES,
  FANTASY_ARMOR_TYPES,
  FANTASY_ELEMENTS,
  FANTASY_WEAPON_TYPES,
  SCIFI_ARMOR_TYPES,
  SCIFI_ELEMENTS,
  SCIFI_WEAPON_TYPES,
} from "@/lib/engine/types";
import { decodeMetadataURI } from "./decode";

const CATALOG_EFFECT_NAMES: readonly CatalogEffectName[] = [
  "lifesteal",
  "armor_pierce",
  "crit_chance",
  "multi_hit",
  "bleed",
  "regen",
  "thorns",
  "dodge_chance",
  "damage_reduction",
];

const CANONICAL_STAT_KEYS = new Set([
  "damage_die",
  "attack_bonus",
  "damage_bonus",
  "ac_bonus",
  "hp_bonus",
  "element",
  "resist_element",
  "weapon_type",
  "armor_type",
  "slot",
  // Tier/Schema are surfaced separately on the card; the renderer also
  // emits them as attributes so we filter them out of `extraFields`.
  "tier",
  "schema",
]);

const VALID_DAMAGE_DIES: ReadonlySet<number> = new Set([4, 6, 8, 10, 12]);

/**
 * Union of every preset's native element vocabulary. Each asset is
 * minted under one realm's schema and carries that schema's
 * vocabulary natively — but cards are decoded here without preset
 * context, so we accept any preset's vocab and let downstream
 * (`useTranslatedCard`) re-encode if the card is rendered against a
 * different realm.
 */
const VALID_ELEMENTS: ReadonlySet<string> = new Set<string>([
  ...FANTASY_ELEMENTS,
  ...SCIFI_ELEMENTS,
  ...CYBERPUNK_ELEMENTS,
]);

/** Same rationale as `VALID_ELEMENTS` — union of every preset's archetype vocab. */
const VALID_WEAPON_TYPES: ReadonlySet<string> = new Set<string>([
  ...FANTASY_WEAPON_TYPES,
  ...SCIFI_WEAPON_TYPES,
  ...CYBERPUNK_WEAPON_TYPES,
]);
const VALID_ARMOR_TYPES: ReadonlySet<string> = new Set<string>([
  ...FANTASY_ARMOR_TYPES,
  ...SCIFI_ARMOR_TYPES,
  ...CYBERPUNK_ARMOR_TYPES,
]);

function asNumber(v: string | number): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function inferSlot(args: {
  attrSlot?: string;
  hasWeaponStats: boolean;
  hasArmorStats: boolean;
  schemaId: number;
}): Slot {
  const { attrSlot, hasWeaponStats, hasArmorStats, schemaId } = args;
  if (attrSlot === "weapon" || attrSlot === "armor" || attrSlot === "accessory") {
    return attrSlot;
  }
  if (hasWeaponStats && !hasArmorStats) return "weapon";
  if (hasArmorStats && !hasWeaponStats) return "armor";
  // Canonical schemas (see app/play/[preset]/page.tsx) use odd ids for
  // weapon and even for armor. Harmless fallback for unknown schemas —
  // the drawer just routes them into the weapon tab.
  return schemaId % 2 === 1 ? "weapon" : "armor";
}

export function buildAssetCardFromMetadata(args: {
  tokenId: bigint;
  tier: Tier;
  schemaId: number;
  metadataURI: string;
  mintedByRealm: `0x${string}`;
}): AssetCard {
  const { tokenId, tier, schemaId, metadataURI, mintedByRealm } = args;

  let name = `Asset #${tokenId.toString()}`;
  let realmLabel = "";
  const catalogEffects: CatalogEffect[] = [];
  const extraFields: Record<string, string | number | boolean> = {};
  let damageDie: DamageDie | undefined;
  let attackBonus: number | undefined;
  let damageBonus: number | undefined;
  let acBonus: number | undefined;
  let hpBonus: number | undefined;
  let element: Element | undefined;
  let resistElement: Element | undefined;
  let weaponType: WeaponType | undefined;
  let armorType: ArmorType | undefined;
  let attrSlot: string | undefined;

  try {
    const decoded = decodeMetadataURI(metadataURI);
    name = decoded.json.name ?? name;
    realmLabel = decoded.json.seed_protocol?.minted_by_realm_label ?? "";

    for (const attr of decoded.json.attributes ?? []) {
      const key = String(attr.trait_type).toLowerCase();

      if (key === "slot" && typeof attr.value === "string") {
        attrSlot = attr.value.toLowerCase();
        continue;
      }

      const numeric = asNumber(attr.value);

      if (key === "damage_die" && numeric !== undefined && VALID_DAMAGE_DIES.has(numeric)) {
        damageDie = numeric as DamageDie;
        continue;
      }
      if (key === "attack_bonus" && numeric !== undefined) {
        attackBonus = numeric;
        continue;
      }
      if (key === "damage_bonus" && numeric !== undefined) {
        damageBonus = numeric;
        continue;
      }
      if (key === "ac_bonus" && numeric !== undefined) {
        acBonus = numeric;
        continue;
      }
      if (key === "hp_bonus" && numeric !== undefined) {
        hpBonus = numeric;
        continue;
      }
      if (key === "element" && typeof attr.value === "string") {
        const v = attr.value.toLowerCase();
        if (VALID_ELEMENTS.has(v)) element = v as Element;
        continue;
      }
      if (key === "resist_element" && typeof attr.value === "string") {
        const v = attr.value.toLowerCase();
        if (VALID_ELEMENTS.has(v)) resistElement = v as Element;
        continue;
      }
      if (key === "weapon_type" && typeof attr.value === "string") {
        const v = attr.value.toLowerCase();
        if (VALID_WEAPON_TYPES.has(v)) weaponType = v as WeaponType;
        continue;
      }
      if (key === "armor_type" && typeof attr.value === "string") {
        const v = attr.value.toLowerCase();
        if (VALID_ARMOR_TYPES.has(v)) armorType = v as ArmorType;
        continue;
      }
      if (
        CATALOG_EFFECT_NAMES.includes(key as CatalogEffectName) &&
        numeric !== undefined
      ) {
        catalogEffects.push({ name: key as CatalogEffectName, value: numeric });
        continue;
      }
      if (!CANONICAL_STAT_KEYS.has(key)) {
        extraFields[String(attr.trait_type)] = attr.value;
      }
    }
  } catch {
    // Non-renderer URI — fall through with the defaults so the engine can
    // still equip a known-tier asset using its loot-table defaults.
  }

  const slot = inferSlot({
    attrSlot,
    hasWeaponStats:
      damageDie !== undefined ||
      attackBonus !== undefined ||
      damageBonus !== undefined,
    hasArmorStats: acBonus !== undefined || hpBonus !== undefined,
    schemaId,
  });

  return {
    tokenId,
    schemaId,
    realm: mintedByRealm,
    realmName: realmLabel,
    slot,
    tier,
    name,
    damageDie,
    attackBonus,
    damageBonus,
    acBonus,
    hpBonus,
    // Only surface the element on the slot it belongs to. A weapon should
    // never carry `resistElement`, and armor should never carry `element` —
    // server-side `validateLootRoll` rejects either, but we double-guard
    // here so a malformed legacy metadata URI doesn't confuse the engine.
    element: slot === "weapon" ? element : undefined,
    resistElement: slot === "armor" ? resistElement : undefined,
    // Same slot-locking discipline for archetype: only a weapon carries a
    // weaponType; only armor carries an armorType.
    weaponType: slot === "weapon" ? weaponType : undefined,
    armorType: slot === "armor" ? armorType : undefined,
    catalogEffects,
    extraFields,
    metadataURI,
    preseed: false,
  };
}
