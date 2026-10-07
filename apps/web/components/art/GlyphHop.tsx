"use client";

/**
 * GlyphHop — the cross-realm translation, drawn.
 *
 * One token, shown as the shape it holds at home and the shape it holds here,
 * cross-fading between the two. This is the protocol's thesis reduced to a
 * single 40px square: the silhouette is local, the tier ornaments and element
 * hue are not. Something recognisably the same object, plainly re-skinned.
 *
 * ## Why this needs no chain read
 *
 * The destination archetype is derived here by **lane ordinal**, the same way
 * `adapters.ts` derives it (`weaponTypeIndex` → `weaponTypeFromIndex`). The
 * visual half of a translation is pure: it depends only on the lane and the
 * destination preset, both of which are known locally. So the hop renders
 * instantly and correctly even while the adapter's stat read is in flight, or
 * if that read fails outright — which matters, because the surrounding screen
 * degrades to "Adapter call failed" in exactly that case and the picture
 * should still tell the truth.
 *
 * Only the *stat* rebalance needs the contract. That stays in `AdapterStrip`.
 */

import { motion, useReducedMotion } from "framer-motion";
import type { Preset } from "@/lib/engine/types";
import { hopType } from "@/lib/art/hop";
import { ItemGlyph } from "@/components/art/ItemGlyph";

/** The subset of an engine `AssetCard` a glyph pair is built from. */
type HopCard = {
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

/**
 * Slow alternation rather than a one-shot reveal.
 *
 * A single play would be over before the player's eye reached it — this screen
 * is read, not watched. Holding each side for ~1.6s and crossing in ~0.6s lets
 * the comparison stay legible for as long as they care to look.
 */
const HOP_SECONDS = 4.4;
const hop = {
  cycle: {
    opacity: [0, 0, 1, 1, 0],
    transition: {
      duration: HOP_SECONDS,
      times: [0, 0.3, 0.44, 0.78, 1],
      ease: "easeInOut" as const,
      repeat: Infinity,
    },
  },
};

export function GlyphHop({
  card,
  fromPreset,
  toPreset,
  size = 44,
  className,
}: {
  card: HopCard;
  fromPreset: Preset;
  toPreset: Preset;
  size?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const isWeapon = card.slot === "weapon";
  const identity = `${card.realm}:${card.tokenId}`;
  const element = isWeapon ? card.element : card.resistElement;
  const sourceType = isWeapon ? card.weaponType : card.armorType;
  const targetType = hopType(card, fromPreset, toPreset);

  const glyph = (preset: Preset, type: string | undefined) => (
    <ItemGlyph
      identity={identity}
      preset={preset}
      slot={card.slot}
      type={type}
      tier={card.tier}
      element={element}
      effectCount={card.catalogEffects.length}
      size={size}
    />
  );

  // Reduced motion gets both shapes at once instead of a flattened animation.
  // A cross-fade collapsed to "no motion" would just show one glyph, which
  // silently deletes the comparison — the only thing this component exists to
  // make. Side by side says the same thing without moving.
  if (reduced) {
    return (
      <div
        className={`flex items-center gap-1.5 ${className ?? ""}`}
        role="img"
        aria-label={`Re-skinned from ${fromPreset} to ${toPreset}`}
      >
        {glyph(fromPreset, sourceType)}
        <span aria-hidden className="font-mono text-[10px] opacity-50">
          →
        </span>
        {glyph(toPreset, targetType)}
      </div>
    );
  }

  return (
    <div
      className={`relative shrink-0 ${className ?? ""}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Re-skinned from ${fromPreset} to ${toPreset}`}
    >
      {/* The home shape sits underneath, always drawn; the local one crosses
          over it and back. Only one element animates. */}
      <div className="absolute inset-0">{glyph(fromPreset, sourceType)}</div>
      <motion.div
        className="absolute inset-0"
        variants={hop}
        initial={{ opacity: 0 }}
        animate="cycle"
      >
        {glyph(toPreset, targetType)}
      </motion.div>
    </div>
  );
}
