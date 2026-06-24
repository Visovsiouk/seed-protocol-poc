/**
 * Single source of truth for a loot card's player-facing headline.
 *
 * Both the inventory card (`AssetCard`) and the combat HUD (`PlayerBar`) — and
 * any future surface — must render the SAME string for the same asset. The
 * composition rules (per-realm evocative word + realm-native TYPE label, with
 * story-object overrides passed through verbatim) live here once so the
 * surfaces can't drift.
 *
 * Kept pure (imports only `names.ts` + types, no chain code) so it is cheap to
 * unit-test and safe to use anywhere. The caller resolves the card's home
 * preset (`card.realmPreset ?? presetForRealm(card.realm) ?? "fantasy"`) and
 * passes it in — both call sites already have it on hand.
 */

import type { AssetCard, Preset } from "@/lib/engine/types";
import {
  armorName,
  composeDisplayName,
  evocativeName,
  weaponName,
} from "@/lib/loot/names";

/**
 * Compose a card's headline: the evocative word (re-derived in the *display*
 * realm's vocabulary so it follows the element across genres — fantasy
 * "Inferno" → sci-fi "Meltdown") prefixed onto the realm-native TYPE label
 * ("Greataxe" / "Heavy Driver").
 *
 * Story-objects ship a verbatim `nameOverride` baked into `.name`; we detect
 * those by checking whether the stored name still equals what the source-realm
 * derivation produces. If it diverges it's an override and we pass it through
 * unchanged.
 *
 * @param source        Untranslated card — its identity + stored name decide
 *                      whether the name is a derived word or a verbatim override.
 * @param sourcePreset  The card's home-realm vocabulary (for override detection).
 * @param display       Card whose stats/element to show (the translated card on
 *                      a cross-realm hop). Defaults to `source`.
 * @param displayPreset Realm vocabulary to render in. Defaults to `sourcePreset`
 *                      (i.e. the asset's home realm).
 */
export function cardDisplayName(
  source: AssetCard,
  sourcePreset: Preset,
  display: AssetCard = source,
  displayPreset: Preset | null = sourcePreset,
): string {
  const preset = displayPreset ?? sourcePreset;

  const sourceEvocative = evocativeName(
    sourcePreset,
    source.tokenId,
    source.tier,
    source.element ?? source.resistElement,
  );
  const isOverride = source.name !== sourceEvocative;
  const evocative = isOverride
    ? display.name
    : evocativeName(
        preset,
        display.tokenId,
        display.tier,
        display.element ?? display.resistElement,
      );

  const typeLabel =
    display.slot === "weapon"
      ? weaponName(preset, display.weaponType, display.tier)
      : display.slot === "armor"
        ? armorName(preset, display.armorType, display.tier)
        : "";

  return composeDisplayName(evocative, typeLabel);
}
