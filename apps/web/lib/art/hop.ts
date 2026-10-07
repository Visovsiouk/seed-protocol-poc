/**
 * The archetype an item wears after a cross-realm hop.
 *
 * The *visual* half of a translation is pure. An item's archetype is modelled
 * as a lane ordinal, and `adapters.ts` translates it by round-tripping that
 * ordinal through the destination preset's vocabulary
 * (`weaponTypeIndex` → `weaponTypeFromIndex`). Nothing in that depends on
 * chain state, so the drawn hop can be resolved locally and instantly — and
 * stays correct even when the adapter's *stat* read is in flight or fails.
 *
 * This mirrors the adapter's own round-trip rather than reimplementing it, so
 * the picture and the contract cannot disagree about which archetype you end
 * up holding. `hop.test.ts` pins that against the real vocabularies.
 *
 * It lives in `lib/art/` beside the generators rather than in the component
 * that draws it, because it is pure logic and the rest of this layer keeps
 * geometry and resolution out of React.
 */

import {
  armorTypeFromIndex,
  armorTypeIndex,
  weaponTypeFromIndex,
  weaponTypeIndex,
  type Preset,
} from "@/lib/engine/types";

/** The subset of an engine `AssetCard` an archetype hop depends on. */
export type HopCard = {
  readonly slot: string;
  readonly weaponType?: string;
  readonly armorType?: string;
};

/**
 * The type string this card wears under `toPreset`.
 *
 * Returns `undefined` when the card carries no archetype at all (an accessory,
 * or gear minted without one) — the caller draws the generic silhouette rather
 * than inventing a lane.
 */
export function hopType(
  card: HopCard,
  fromPreset: Preset,
  toPreset: Preset,
): string | undefined {
  const isWeapon = card.slot === "weapon";
  const type = isWeapon ? card.weaponType : card.armorType;
  if (!type) return undefined;
  return isWeapon
    ? weaponTypeFromIndex(toPreset, weaponTypeIndex(fromPreset, type))
    : armorTypeFromIndex(toPreset, armorTypeIndex(fromPreset, type));
}
