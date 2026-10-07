/**
 * ItemGlyph — the visual mark for a piece of gear.
 *
 * Renders the generated `ItemSpec` as inline SVG. All geometry comes from
 * `lib/art/item.ts`; all colour is resolved here through `lib/art/palette.ts`,
 * which defers to `lib/ui/loot-visuals.ts` so the glyph stays in visual
 * lockstep with the tier spine, element chips, and HUD.
 *
 * Theming is free: the silhouette strokes in `currentColor`, so the glyph
 * picks up the realm's phosphor under `[data-theme="crt"]`, the genre palette
 * under `[data-preset]`, and a player realm's custom accent — with no props
 * and no regeneration.
 *
 * Deliberately **not** animated and deliberately fixed-size: these appear in
 * dense card grids where a growing box or a per-card motion wrapper would cost
 * layout stability and render time. Fixed `size` → fixed box → card grids keep
 * the uniform height that `AssetCard`'s `ChipRail` works hard to preserve.
 */

import type { Preset } from "@/lib/engine/types";
import type { Shape } from "@/lib/art/archetypes";
import { itemSpec } from "@/lib/art/item";
import { auraInk, entityInk, tierInk } from "@/lib/art/palette";

type Props = {
  /** Realm of origin + token id — the glyph's stable identity. */
  identity: string;
  preset: Preset;
  slot: string;
  type?: string;
  tier: number;
  element?: string | null;
  effectCount?: number;
  /** Rendered box in px. Fixed by design; see the note above. */
  size?: number;
  className?: string;
  /**
   * Decorative by default. The card already names the item in text, so the
   * glyph is redundant to a screen reader. Pass a label only when the glyph
   * stands alone (e.g. a bare grid cell).
   */
  label?: string;
};

function renderShape(shape: Shape, index: number, ink: string) {
  if (shape.kind === "circle") {
    return (
      <circle
        key={index}
        cx={shape.cx}
        cy={shape.cy}
        r={shape.r}
        fill={shape.filled ? ink : "none"}
        stroke={shape.filled ? "none" : ink}
        strokeWidth={2}
      />
    );
  }
  return (
    <path
      key={index}
      d={shape.d}
      fill={shape.filled ? ink : "none"}
      stroke={ink}
      strokeWidth={shape.weight ?? 2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

export function ItemGlyph({
  identity,
  preset,
  slot,
  type,
  tier,
  element,
  effectCount = 0,
  size = 28,
  className,
  label,
}: Props) {
  const spec = itemSpec({
    preset,
    slot,
    type,
    tier,
    element,
    effectCount,
    identity,
  });

  const ink = entityInk(element);
  const tierColour = tierInk(tier);
  const glow = auraInk(element, 55);
  const hasElement = !!element && element !== "none";

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <g transform={`rotate(${spec.tilt} 50 50)`}>
        {/* Element mote first so it reads as light behind the object. */}
        {spec.mote && (
          <circle
            cx={spec.mote.cx}
            cy={spec.mote.cy}
            r={spec.mote.r}
            fill={glow}
          />
        )}

        {/* The authored lane silhouette. */}
        {spec.base.shapes.map((shape, i) => renderShape(shape, i, ink))}

        {/* Tier ornaments ride the tier ramp, not the element hue, so rarity
            stays readable on mundane gear that has no element at all. */}
        {spec.ornaments.map((shape, i) => renderShape(shape, i, tierColour))}

        {/* Catalog-effect ticks — a count you can see without reading chips. */}
        {spec.effectTicks.map((shape, i) =>
          renderShape(shape, i, hasElement ? ink : tierColour),
        )}
      </g>
    </svg>
  );
}

/**
 * Convenience wrapper for the common case: an engine `AssetCard`. Keeps the
 * trait-plumbing in one place so call sites stay one line.
 *
 * `slot`/`tier`/`element` are read off the card; weapon and armour archetypes
 * live on different fields, so the right one is selected by slot.
 */
export function CardGlyph({
  card,
  preset,
  size,
  className,
  label,
}: {
  card: {
    tokenId: bigint;
    realm: string;
    slot: string;
    tier: number;
    element?: string;
    resistElement?: string;
    weaponType?: string;
    armorType?: string;
    catalogEffects: readonly unknown[];
  };
  preset: Preset;
  size?: number;
  className?: string;
  label?: string;
}) {
  const isWeapon = card.slot === "weapon";
  return (
    <ItemGlyph
      identity={`${card.realm}:${card.tokenId}`}
      preset={preset}
      slot={card.slot}
      type={isWeapon ? card.weaponType : card.armorType}
      tier={card.tier}
      element={isWeapon ? card.element : card.resistElement}
      effectCount={card.catalogEffects.length}
      size={size}
      className={className}
      label={label}
    />
  );
}
