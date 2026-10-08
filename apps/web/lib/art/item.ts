/**
 * Item glyph generator.
 *
 * Composes an authored lane silhouette (`archetypes.ts`) with per-item detail
 * derived from the token's own identity, producing geometry only — the
 * renderer resolves every colour through `palette.ts`.
 *
 * The trait split is deliberate and is what makes the cross-realm reveal work:
 *
 *   - **Archetype silhouette** comes from `(preset, lane)`, so it changes when
 *     an item is translated into another genre's realm.
 *   - **Tier ornaments** and **element** come from values that survive
 *     translation, so they stay put.
 *
 * Carry a Rare ember sword into a cyberpunk realm and you get the same three
 * ornaments and the same ember hue on a katana. Recognisably the same object,
 * plainly re-skinned. `item.test.ts` pins that as an invariant.
 */

import type { Preset } from "@/lib/engine/types";
import { silhouetteFor, type Shape, type Silhouette } from "./archetypes";
import { artRng, lerp, memoize, r2 } from "./seed";

export type ItemSpec = {
  /** The authored lane silhouette, unmodified. */
  readonly base: Silhouette;
  /** Tier ornaments marching along the silhouette's ornament axis. */
  readonly ornaments: readonly Shape[];
  /** Element mote at the business end — present only for elemental gear. */
  readonly mote: { cx: number; cy: number; r: number } | null;
  /** Small ticks for catalog effects, clustered at the grip/hem. */
  readonly effectTicks: readonly Shape[];
  /** Rotation jitter in degrees, so a shelf of items isn't rubber-stamped. */
  readonly tilt: number;
};

export type ItemSpecInput = {
  readonly preset: Preset;
  readonly slot: string;
  readonly type: string | undefined;
  readonly tier: number;
  readonly element: string | null | undefined;
  readonly effectCount: number;
  /** Stable per-token identity — `realm:tokenId`. */
  readonly identity: string;
};

const cache = new Map<string, ItemSpec>();

/**
 * Every input that affects geometry, and nothing else. Notably absent:
 * equipped state, selection, hover — those are the renderer's business.
 */
function cacheKey(input: ItemSpecInput): string {
  return [
    input.preset,
    input.slot,
    input.type ?? "none",
    input.tier,
    input.element ?? "none",
    input.effectCount,
    input.identity,
  ].join("|");
}

export function itemSpec(input: ItemSpecInput): ItemSpec {
  return memoize(cache, cacheKey(input), () => build(input));
}

function build(input: ItemSpecInput): ItemSpec {
  const base = silhouetteFor(input.preset, input.slot, input.type);
  const rng = artRng(`item:${input.identity}`);
  const tier = Math.min(5, Math.max(1, input.tier));

  // Tilt is drawn first so it stays stable regardless of what follows.
  const tilt = r2(lerp(-4, 4, rng.next()));

  // One ornament per tier: a Common carries a single mark, a Legendary five.
  // They march along the authored axis so each lane wears them sensibly —
  // down a sword's fuller, down an armour's centre seam.
  const [ax1, ay1, ax2, ay2] = base.ornamentAxis;
  const ornaments: Shape[] = [];
  for (let i = 0; i < tier; i++) {
    // Spread across the axis interior; a single ornament sits at the midpoint.
    const t = tier === 1 ? 0.5 : lerp(0.14, 0.86, i / (tier - 1));
    const cx = r2(lerp(ax1, ax2, t));
    const cy = r2(lerp(ay1, ay2, t));
    const jitter = lerp(-1.2, 1.2, rng.next());
    ornaments.push({
      kind: "circle",
      cx: r2(cx + jitter),
      cy: r2(cy + jitter),
      // Higher tiers wear slightly bolder marks.
      r: r2(lerp(1.5, 2.4, (tier - 1) / 4)),
      filled: true,
    });
  }

  const hasElement = !!input.element && input.element !== "none";
  const [fx, fy] = base.focus;
  const mote = hasElement
    ? { cx: fx, cy: fy, r: r2(lerp(4.5, 7, (tier - 1) / 4)) }
    : null;

  // Catalog effects read as short ticks fanning off the grip — a count you
  // can see without reading the chips.
  const effectTicks: Shape[] = [];
  const ticks = Math.min(3, Math.max(0, input.effectCount));
  for (let i = 0; i < ticks; i++) {
    const spread = lerp(-0.5, 0.5, ticks === 1 ? 0.5 : i / (ticks - 1));
    const angle = Math.PI * 0.75 + spread;
    const len = 7;
    const ox = ax1 + Math.cos(angle) * 4;
    const oy = ay1 - Math.sin(angle) * 4;
    effectTicks.push({
      kind: "path",
      d: `M${r2(ox)} ${r2(oy)} L${r2(ox + Math.cos(angle) * len)} ${r2(
        oy - Math.sin(angle) * len,
      )}`,
      weight: 2,
    });
  }

  return { base, ornaments, mote, effectTicks, tilt };
}

/** Test seam — the memo cache is module-global by design. */
export function __clearItemCache(): void {
  cache.clear();
}
