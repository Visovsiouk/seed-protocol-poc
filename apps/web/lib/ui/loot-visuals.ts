/**
 * Single source of truth for loot presentation tokens — element hues,
 * catalog-effect metadata, and tier labels/colours. Previously these dicts
 * were copy-pasted across `components/game/HUD.tsx` and
 * `components/inventory/AssetCard.tsx`; consolidating them here keeps the
 * HUD chip, the inventory card, and the kit `Chip` family in visual lockstep.
 *
 * The engine never imports this — presentation is strictly a UI concern.
 */

import type { CatalogEffectName } from "@/lib/engine/types";

// ─── element hues ─────────────────────────────────────────────────────────────
// The three preset vocabularies share enum indices 1..5, so the
// canonical name and its sci-fi / cyberpunk synonyms collapse onto one hue:
//   1 fire / plasma / incendiary → ember
//   2 ice / cryo / cryogenic     → frost
//   3 shock / ion / emp          → spark
//   4 holy / photon / laser      → light
//   5 unholy / void / nano       → violet

/** Solid accent hue per element — drives borders, glows, and the HUD chip. */
const ELEMENT_HUE: Record<string, string> = {
  // fantasy
  fire: "#e85d04",
  ice: "#4cc9f0",
  shock: "#f8c020",
  holy: "#fffbcc",
  unholy: "#9d4edd",
  // scifi
  plasma: "#c77dff",
  cryo: "#48cae4",
  ion: "#f8c020",
  photon: "#eeeeee",
  void: "#7b2fff",
  // cyberpunk
  incendiary: "#e85d04",
  cryogenic: "#4cc9f0",
  emp: "#f8c020",
  laser: "#ff6b6b",
  nano: "#6a994e",
};

/** Solid accent hue for an element, or a neutral grey when unknown. */
export function elementColor(element: string): string {
  return ELEMENT_HUE[element.toLowerCase()] ?? "rgba(255,255,255,0.5)";
}

// Chip palette — softer bg + legible fg per hue group, tuned for small
// uppercase pills on the dark data-glass surface.
const EMBER = { bg: "rgba(255,120,40,0.18)", fg: "#ffb38a" };
const FROST = { bg: "rgba(120,200,255,0.18)", fg: "#a8dcff" };
const SPARK = { bg: "rgba(255,230,80,0.18)", fg: "#ffeb8a" };
const LIGHT = { bg: "rgba(255,220,140,0.18)", fg: "#ffd97a" };
const VIOLET = { bg: "rgba(180,120,255,0.18)", fg: "#caa6ff" };

const ELEMENT_CHIP: Record<string, { bg: string; fg: string }> = {
  fire: EMBER, plasma: EMBER, incendiary: EMBER,
  ice: FROST, cryo: FROST, cryogenic: FROST,
  shock: SPARK, ion: SPARK, emp: SPARK,
  holy: LIGHT, photon: LIGHT, laser: LIGHT,
  unholy: VIOLET, void: VIOLET, nano: VIOLET,
};

const ELEMENT_CHIP_FALLBACK = { bg: "rgba(180,180,180,0.18)", fg: "#cccccc" };

/** Soft bg + legible fg pair for an element chip. */
export function elementChip(element: string): { bg: string; fg: string } {
  return ELEMENT_CHIP[element.toLowerCase()] ?? ELEMENT_CHIP_FALLBACK;
}

// ─── catalog effects ──────────────────────────────────────────────────────────

export type EffectMeta = {
  label: string;
  color: string;
  format: (v: number) => string;
};

const EFFECT_META: Record<CatalogEffectName, EffectMeta> = {
  lifesteal:        { label: "Lifesteal",  color: "#e05252", format: (v) => `+${v} HP/hit` },
  armor_pierce:     { label: "Pierce",     color: "#e8a020", format: ()  => "ignores AC" },
  crit_chance:      { label: "Crit",       color: "#f8c020", format: (v) => `${v}%`       },
  multi_hit:        { label: "Multi-Hit",  color: "#c77dff", format: (v) => `×${v + 1}`   },
  bleed:            { label: "Bleed",      color: "#c1121f", format: (v) => `${v}/turn`   },
  regen:            { label: "Regen",      color: "#4cc9f0", format: (v) => `+${v}/turn`  },
  thorns:           { label: "Thorns",     color: "#6a994e", format: (v) => `${v} reflect` },
  dodge_chance:     { label: "Dodge",      color: "#9b5de5", format: (v) => `${v}%`       },
  damage_reduction: { label: "DR",         color: "#4361ee", format: (v) => `-${v} dmg`   },
};

/** Display metadata for a catalog effect, or undefined if unknown. */
export function effectMeta(name: CatalogEffectName): EffectMeta | undefined {
  return EFFECT_META[name];
}

// ─── tiers ────────────────────────────────────────────────────────────────────

export const TIER_LABEL: Record<number, string> = {
  1: "Common",
  2: "Uncommon",
  3: "Rare",
  4: "Epic",
  5: "Legendary",
};

/** CSS var reference for a tier's ramp colour (clamped to 1..5). */
export function tierColor(tier: number): string {
  const t = Math.min(5, Math.max(1, tier));
  return `var(--color-tier-${t})`;
}
