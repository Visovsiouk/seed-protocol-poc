/**
 * Colour resolution for the art layer.
 *
 * Specs carry **geometry only** — never a colour. Every stroke and fill is
 * resolved here, at render time, from the entity's traits. That split is what
 * makes the art theme itself: a creature drawn in `currentColor` inherits the
 * realm's phosphor under `[data-theme="crt"]`, the genre palette under
 * `[data-preset]`, and a player realm's custom accent, with no per-component
 * wiring and no spec regeneration.
 *
 * Hues are never authored here either — they come from
 * `lib/ui/loot-visuals.ts`, which is the single source of truth the HUD,
 * inventory card, and chip family already share. This module only composes
 * them into the stroke/fill/glow expressions the SVG needs.
 */

import { elementColor, tierColor } from "@/lib/ui/loot-visuals";

/** A live element, or nothing. Mirrors how the engine models `"none"`. */
export type MaybeElement = string | null | undefined;

function hasElement(element: MaybeElement): element is string {
  return !!element && element !== "none";
}

/**
 * The default ink. `currentColor` resolves against whatever the container's
 * `color` is, which is how a sigil picks up the realm accent for free.
 */
export const INK = "currentColor";

/** Primary stroke for an entity: its element hue, else the inherited ink. */
export function entityInk(element: MaybeElement): string {
  return hasElement(element) ? elementColor(element) : INK;
}

/** Tier ramp colour, for item ornaments and rarity spines. */
export function tierInk(tier: number): string {
  return tierColor(tier);
}

/**
 * Soft glow behind a silhouette. Mixes toward transparent so it reads as
 * atmosphere rather than a second outline, and stays legible on all three
 * genre backgrounds (fantasy #1a120b, scifi #050912, cyberpunk #0a0212).
 */
export function auraInk(element: MaybeElement, strength = 45): string {
  return `color-mix(in oklab, ${entityInk(element)} ${strength}%, transparent)`;
}

/** Vulnerability mark — always reads as damage, regardless of element. */
export const WEAK_INK = "var(--color-danger)";

/** Resistance mark — always reads as protection. */
export const RESIST_INK = "var(--color-ok)";
