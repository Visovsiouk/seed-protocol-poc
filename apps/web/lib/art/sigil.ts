/**
 * Player crest generator.
 *
 * Unlike creatures and gear, this one does **not** hash its input. An address
 * is already 20 bytes of well-spread entropy, and reading its nibbles
 * directly is the point: the crest is not derived *from* your address, it
 * *is* your address, drawn. Hashing first would throw away the only property
 * that makes it meaningful.
 *
 * Everything is mirrored across the vertical axis so the result reads as a
 * heraldic crest rather than a noise field — the same discipline that makes
 * the creature sigils legible.
 *
 * Because the component strokes in `currentColor`, the same wallet produces
 * an identically-shaped crest in a different colour in every realm. You are
 * the constant; the world is not.
 */

import type { Shape } from "./archetypes";
import { MID, lerp, polar, r2 } from "./seed";

export type SigilSpec = {
  /** Concentric rings framing the crest. */
  readonly rings: readonly Shape[];
  /** Mirrored spokes radiating from the core. */
  readonly spokes: readonly Shape[];
  /** The central polygon. */
  readonly core: Shape;
  /** Mirrored satellite marks. */
  readonly satellites: readonly Shape[];
  /**
   * True when there was no address to read. The component renders a dashed
   * placeholder instead — never a blank hole where identity should be.
   */
  readonly placeholder: boolean;
};

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

const cache = new Map<string, SigilSpec>();

/** Crest for a wallet address. Anything malformed yields the placeholder. */
export function sigilSpec(address?: string | null): SigilSpec {
  const key = address && ADDRESS.test(address) ? address.toLowerCase() : "";
  let hit = cache.get(key);
  if (hit === undefined) {
    hit = key === "" ? PLACEHOLDER : build(key);
    cache.set(key, hit);
  }
  return hit;
}

/** An empty ring — "no wallet yet", rendered dashed by the component. */
const PLACEHOLDER: SigilSpec = {
  rings: [{ kind: "circle", cx: MID, cy: MID, r: 32 }],
  spokes: [],
  core: { kind: "circle", cx: MID, cy: MID, r: 7 },
  satellites: [],
  placeholder: true,
};

function build(address: string): SigilSpec {
  // 40 nibbles, each 0..15. Indexed rather than consumed in sequence so the
  // mapping from address position to feature stays readable and stable.
  const hex = address.slice(2);
  const n = (i: number) => parseInt(hex[i]!, 16);
  const unit = (i: number) => n(i) / 15;

  // ── rings: nibbles 0..2 ────────────────────────────────────────────────────
  //
  // Anchored at the OUTER radius and stepped inward by a guaranteed gap,
  // rather than each ring picking its own radius independently. Independent
  // radii let two rings land within ~1 unit of each other, which at a 40px
  // render is half a pixel apart — they merge into one thick line and the
  // crest loses a feature. Anchoring outward also keeps every crest the same
  // visual weight regardless of how many rings it has.
  const ringCount = 2 + (n(0) % 3);
  const outer = lerp(32, 42, unit(1));
  // Leave the innermost ring clear of the core (max radius 13).
  const span = outer - 16;
  const gap = Math.max(4.5, Math.min(lerp(6, 11, unit(2)), span / (ringCount - 1)));
  const rings: Shape[] = [];
  for (let k = 0; k < ringCount; k++) {
    rings.push({ kind: "circle", cx: MID, cy: MID, r: r2(outer - k * gap) });
  }

  // ── spokes: nibbles 6..17, three mirrored pairs ───────────────────────────
  const spokes: Shape[] = [];
  for (let k = 0; k < 3; k++) {
    const base = 6 + k * 4;
    // Keep spokes off the vertical axis so a mirrored pair never collapses
    // into a single doubled line.
    const angle = lerp(0.35, Math.PI - 0.35, unit(base));
    const inner = lerp(9, 15, unit(base + 1));
    const outer = lerp(22, 38, unit(base + 2));
    const weight = 1.5 + (n(base + 3) % 2);
    const [ix, iy] = polar(MID, MID, inner, angle);
    const [ox, oy] = polar(MID, MID, outer, angle);
    const [mix, miy] = polar(MID, MID, inner, -angle);
    const [mox, moy] = polar(MID, MID, outer, -angle);
    spokes.push(
      { kind: "path", d: `M${ix} ${iy} L${ox} ${oy}`, weight },
      { kind: "path", d: `M${mix} ${miy} L${mox} ${moy}`, weight },
    );
  }

  // ── core: nibbles 18..23 ──────────────────────────────────────────────────
  const vertices = 3 + (n(18) % 5);
  const coreR = lerp(8, 13, unit(19));
  const spin = unit(20) * (Math.PI / vertices);
  const points: string[] = [];
  for (let k = 0; k < vertices; k++) {
    const [x, y] = polar(MID, MID, coreR, spin + (k * 2 * Math.PI) / vertices);
    points.push(`${k === 0 ? "M" : "L"}${x} ${y}`);
  }
  const core: Shape = { kind: "path", d: `${points.join(" ")} Z`, filled: true };

  // ── satellites: nibbles 24..39, two mirrored pairs ────────────────────────
  const satellites: Shape[] = [];
  for (let k = 0; k < 2; k++) {
    const base = 24 + k * 4;
    const angle = lerp(0.5, Math.PI - 0.5, unit(base));
    const dist = lerp(20, 34, unit(base + 1));
    const r = lerp(1.8, 3.4, unit(base + 2));
    const filled = n(base + 3) % 2 === 0;
    const [x, y] = polar(MID, MID, dist, angle);
    const [mx, my] = polar(MID, MID, dist, -angle);
    satellites.push(
      { kind: "circle", cx: x, cy: y, r: r2(r), filled },
      { kind: "circle", cx: mx, cy: my, r: r2(r), filled },
    );
  }

  return { rings, spokes, core, satellites, placeholder: false };
}

/** Test seam — the memo cache is module-global by design. */
export function __clearSigilCache(): void {
  cache.clear();
}
