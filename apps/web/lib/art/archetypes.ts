/**
 * Authored silhouettes for gear, keyed by `(preset, lane)`.
 *
 * The engine models archetypes as *lanes* rather than names
 * (`lib/engine/types.ts:144`): weapon lane 1 is "heavy" and resolves to an axe
 * in fantasy, a cannon in sci-fi, a shotgun in cyberpunk; armour lane 3 is
 * "light" and resolves to robe / cloak / weave. The uint8 cast between schema
 * enums relies on that parity, and the cross-realm adapters translate along it.
 *
 * So the art is keyed the same way — and deliberately draws each lane
 * *differently per preset*. A lane-1 fantasy axe and a lane-1 cyberpunk shotgun
 * share a heavy mass profile but are plainly not the same object. That is what
 * makes carrying an item across realms legible as a re-skin of the same thing
 * rather than either a no-op or an unrelated item.
 *
 * Everything is authored in the 0..100 field from `seed.ts`. Weapons run on a
 * shared bottom-left-to-top-right diagonal so a grid of them scans evenly;
 * armour is centred and vertical.
 */

import {
  armorTypesFor,
  weaponTypesFor,
  type Preset,
} from "@/lib/engine/types";

/** A primitive the renderer can draw. Geometry only — never a colour. */
export type Shape =
  | { kind: "path"; d: string; filled?: boolean; weight?: number }
  | { kind: "circle"; cx: number; cy: number; r: number; filled?: boolean };

export type Silhouette = {
  /** The drawn primitives, back to front. */
  shapes: readonly Shape[];
  /** Where tier ornaments attach (along the haft / down the torso). */
  ornamentAxis: readonly [x1: number, y1: number, x2: number, y2: number];
  /** Where an element mote sits — the business end. */
  focus: readonly [x: number, y: number];
};

/**
 * Lane for a type string under a preset, or `0` for `"none"` / unknown.
 *
 * Resolved through the engine's own ordered vocabularies so lane parity can
 * never drift from the on-chain enums — index 0 is always `"none"`.
 */
export function weaponLane(preset: Preset, type: string | undefined): number {
  if (!type) return 0;
  return Math.max(0, weaponTypesFor(preset).indexOf(type.toLowerCase()));
}

export function armorLane(preset: Preset, type: string | undefined): number {
  if (!type) return 0;
  return Math.max(0, armorTypesFor(preset).indexOf(type.toLowerCase()));
}

// ─── weapons ──────────────────────────────────────────────────────────────────
// Shared diagonal: grip near (24,84), business end near (76,24).

const HAFT_LONG = "M26 84 L72 30";

/** lane 1 — heavy. Broad head, short reach, visible mass. */
const HEAVY: Record<Preset, Silhouette> = {
  // Axe: crescent blade biting off a stout haft.
  fantasy: {
    shapes: [
      { kind: "path", d: HAFT_LONG, weight: 5 },
      {
        kind: "path",
        d: "M60 20 Q84 28 78 52 Q68 38 56 34 Z",
        filled: true,
      },
      { kind: "circle", cx: 26, cy: 84, r: 4 },
    ],
    ornamentAxis: [30, 80, 62, 42],
    focus: [74, 34],
  },
  // Cannon: wide muzzle cone off a thick receiver.
  scifi: {
    shapes: [
      { kind: "path", d: "M28 82 L64 40", weight: 7 },
      { kind: "path", d: "M58 46 L80 20 L88 32 L68 54 Z", filled: true },
      { kind: "path", d: "M78 18 L92 34", weight: 3 },
      { kind: "circle", cx: 28, cy: 82, r: 5 },
    ],
    ornamentAxis: [32, 78, 60, 46],
    focus: [84, 26],
  },
  // Shotgun: double barrel over a dropped stock.
  cyberpunk: {
    shapes: [
      { kind: "path", d: "M30 78 L46 62 L52 68 L36 84 Z", filled: true },
      { kind: "path", d: "M46 62 L84 24", weight: 5 },
      { kind: "path", d: "M50 66 L88 28", weight: 5 },
      { kind: "path", d: "M44 70 L58 56", weight: 3 },
    ],
    ornamentAxis: [48, 64, 76, 36],
    focus: [86, 26],
  },
};

/** lane 2 — light. Short, quick, compact. */
const LIGHT: Record<Preset, Silhouette> = {
  // Dagger: narrow blade, pronounced crossguard.
  fantasy: {
    shapes: [
      { kind: "path", d: "M34 82 L44 72", weight: 5 },
      { kind: "path", d: "M38 66 L52 80", weight: 3 },
      { kind: "path", d: "M44 70 L72 38 L76 44 L48 76 Z", filled: true },
      { kind: "circle", cx: 33, cy: 83, r: 3 },
    ],
    ornamentAxis: [46, 72, 68, 46],
    focus: [74, 41],
  },
  // Pistol: short slide over a raked grip.
  scifi: {
    shapes: [
      { kind: "path", d: "M36 84 L44 68 L54 72 L46 86 Z", filled: true },
      { kind: "path", d: "M42 66 L76 42 L80 50 L46 74 Z", filled: true },
      { kind: "path", d: "M50 68 L60 60", weight: 2 },
    ],
    ornamentAxis: [46, 70, 70, 52],
    focus: [78, 46],
  },
  // Knife: single-edged, angled clip point.
  cyberpunk: {
    shapes: [
      { kind: "path", d: "M34 84 L46 70", weight: 5 },
      { kind: "path", d: "M44 68 L74 44 L78 50 L48 74 Z", filled: true },
      { kind: "path", d: "M74 44 L78 50", weight: 2 },
    ],
    ornamentAxis: [46, 70, 70, 50],
    focus: [76, 47],
  },
};

/** lane 3 — mid. Long, balanced, the default silhouette. */
const MID: Record<Preset, Silhouette> = {
  // Sword: straight blade, crossguard, pommel.
  fantasy: {
    shapes: [
      { kind: "path", d: "M24 86 L36 74", weight: 5 },
      { kind: "path", d: "M28 66 L48 86", weight: 4 },
      { kind: "path", d: "M36 72 L78 30 L84 36 L42 78 Z", filled: true },
      { kind: "circle", cx: 23, cy: 87, r: 3 },
    ],
    ornamentAxis: [40, 74, 74, 40],
    focus: [81, 33],
  },
  // Rifle: long receiver with a sight rail and a shouldered stock.
  scifi: {
    shapes: [
      { kind: "path", d: "M26 84 L40 70 L48 76 L34 90 Z", filled: true },
      { kind: "path", d: "M38 70 L82 30", weight: 6 },
      { kind: "path", d: "M50 60 L62 48", weight: 3 },
      { kind: "path", d: "M44 76 L54 66", weight: 3 },
    ],
    ornamentAxis: [42, 68, 74, 38],
    focus: [84, 28],
  },
  // Katana: long, gently curved, single edge.
  cyberpunk: {
    shapes: [
      { kind: "path", d: "M24 86 L38 72", weight: 5 },
      { kind: "path", d: "M32 70 L44 82", weight: 3 },
      {
        kind: "path",
        d: "M38 72 Q62 52 82 28 L86 34 Q64 58 42 78 Z",
        filled: true,
      },
    ],
    ornamentAxis: [42, 74, 76, 40],
    focus: [84, 31],
  },
};

/** lane 4 — ranged. Arcs, emitters, projection. */
const RANGED: Record<Preset, Silhouette> = {
  // Bow: a deep limb arc with the string drawn across it.
  fantasy: {
    shapes: [
      { kind: "path", d: "M34 18 Q78 50 34 86", weight: 5 },
      { kind: "path", d: "M34 18 L34 86", weight: 2 },
      { kind: "circle", cx: 34, cy: 52, r: 3, filled: true },
    ],
    ornamentAxis: [40, 28, 40, 78],
    focus: [62, 52],
  },
  // Beam: an emitter throat behind stacked focusing rings.
  scifi: {
    shapes: [
      { kind: "path", d: "M24 76 L44 56 L52 64 L32 84 Z", filled: true },
      { kind: "path", d: "M44 56 L72 28", weight: 5 },
      { kind: "path", d: "M54 36 L68 50", weight: 3 },
      { kind: "path", d: "M62 28 L76 42", weight: 3 },
      { kind: "circle", cx: 78, cy: 24, r: 5 },
    ],
    ornamentAxis: [46, 58, 66, 38],
    focus: [78, 24],
  },
  // Smart SMG: stubby body, top rail, canted magazine.
  cyberpunk: {
    shapes: [
      { kind: "path", d: "M30 80 L40 64 L50 70 L40 86 Z", filled: true },
      { kind: "path", d: "M40 64 L74 34 L80 42 L46 72 Z", filled: true },
      { kind: "path", d: "M48 50 L66 32", weight: 3 },
      { kind: "path", d: "M36 74 L26 66", weight: 4 },
    ],
    ornamentAxis: [46, 66, 72, 44],
    focus: [78, 38],
  },
};

/** lane 5 — exotic. Long reach and an odd business end. */
const EXOTIC: Record<Preset, Silhouette> = {
  // Staff: plain shaft, orb socketed at the crown.
  fantasy: {
    shapes: [
      { kind: "path", d: "M22 88 L70 34", weight: 5 },
      { kind: "circle", cx: 74, cy: 28, r: 9 },
      { kind: "circle", cx: 74, cy: 28, r: 3, filled: true },
      { kind: "path", d: "M30 80 L40 84", weight: 2 },
    ],
    ornamentAxis: [28, 82, 62, 44],
    focus: [74, 28],
  },
  // Railgun: twin parallel rails bridged by an accelerator coil.
  scifi: {
    shapes: [
      { kind: "path", d: "M24 82 L78 26", weight: 3 },
      { kind: "path", d: "M32 88 L86 32", weight: 3 },
      { kind: "path", d: "M44 70 L52 78", weight: 5 },
      { kind: "path", d: "M58 56 L66 64", weight: 5 },
      { kind: "circle", cx: 28, cy: 85, r: 4, filled: true },
    ],
    ornamentAxis: [38, 76, 70, 44],
    focus: [82, 29],
  },
  // Monowire: a spool paying out a slack, whipping filament.
  cyberpunk: {
    shapes: [
      { kind: "circle", cx: 30, cy: 78, r: 8 },
      { kind: "circle", cx: 30, cy: 78, r: 3, filled: true },
      {
        kind: "path",
        d: "M36 72 Q62 72 64 46 Q66 22 86 20",
        weight: 3,
      },
      { kind: "circle", cx: 87, cy: 19, r: 3, filled: true },
    ],
    ornamentAxis: [40, 70, 64, 40],
    focus: [87, 19],
  },
};

// ─── armour ───────────────────────────────────────────────────────────────────
// Centred torso, roughly x 28..72, y 20..86.

/** lane 1 — heavy. Rigid, shouldered, enclosing. */
const ARMOR_HEAVY: Record<Preset, Silhouette> = {
  // Plate cuirass with flared pauldrons.
  fantasy: {
    shapes: [
      { kind: "path", d: "M38 30 L62 30 L68 56 L50 82 L32 56 Z", filled: true },
      { kind: "path", d: "M30 34 Q24 44 32 50", weight: 4 },
      { kind: "path", d: "M70 34 Q76 44 68 50", weight: 4 },
      { kind: "path", d: "M50 32 L50 78", weight: 2 },
    ],
    ornamentAxis: [50, 36, 50, 74],
    focus: [50, 44],
  },
  // Exosuit: a load frame over a chest plate.
  scifi: {
    shapes: [
      { kind: "path", d: "M36 30 L64 30 L66 60 L50 80 L34 60 Z", filled: true },
      { kind: "path", d: "M30 32 L30 56", weight: 4 },
      { kind: "path", d: "M70 32 L70 56", weight: 4 },
      { kind: "path", d: "M40 44 L60 44", weight: 2 },
      { kind: "circle", cx: 50, cy: 56, r: 4 },
    ],
    ornamentAxis: [50, 34, 50, 72],
    focus: [50, 56],
  },
  // Riotfit: segmented shell with a visor slit.
  cyberpunk: {
    shapes: [
      { kind: "path", d: "M36 28 L64 28 L68 58 L50 82 L32 58 Z", filled: true },
      { kind: "path", d: "M38 38 L62 38", weight: 2 },
      { kind: "path", d: "M36 48 L64 48", weight: 2 },
      { kind: "path", d: "M40 58 L60 58", weight: 2 },
      { kind: "path", d: "M28 36 L34 32", weight: 4 },
      { kind: "path", d: "M72 36 L66 32", weight: 4 },
    ],
    ornamentAxis: [50, 32, 50, 76],
    focus: [50, 38],
  },
};

/** lane 2 — medium. Segmented, flexible, layered. */
const ARMOR_MEDIUM: Record<Preset, Silhouette> = {
  // Mail: torso hung with ring courses.
  fantasy: {
    shapes: [
      { kind: "path", d: "M36 30 Q50 24 64 30 L66 62 Q50 82 34 62 Z" },
      { kind: "circle", cx: 42, cy: 42, r: 3 },
      { kind: "circle", cx: 50, cy: 46, r: 3 },
      { kind: "circle", cx: 58, cy: 42, r: 3 },
      { kind: "circle", cx: 46, cy: 56, r: 3 },
      { kind: "circle", cx: 54, cy: 56, r: 3 },
    ],
    ornamentAxis: [50, 34, 50, 74],
    focus: [50, 46],
  },
  // Carapace: overlapping chitin chevrons.
  scifi: {
    shapes: [
      { kind: "path", d: "M36 30 Q50 24 64 30 L66 62 Q50 82 34 62 Z" },
      { kind: "path", d: "M38 40 Q50 34 62 40", weight: 3 },
      { kind: "path", d: "M38 50 Q50 44 62 50", weight: 3 },
      { kind: "path", d: "M40 60 Q50 54 60 60", weight: 3 },
    ],
    ornamentAxis: [50, 34, 50, 74],
    focus: [50, 40],
  },
  // Vest: panelled front with a seam and pockets.
  cyberpunk: {
    shapes: [
      { kind: "path", d: "M36 28 L64 28 L64 64 Q50 80 36 64 Z" },
      { kind: "path", d: "M50 28 L50 72", weight: 2 },
      { kind: "path", d: "M38 44 L46 44", weight: 3 },
      { kind: "path", d: "M54 44 L62 44", weight: 3 },
      { kind: "path", d: "M38 56 L46 56", weight: 3 },
      { kind: "path", d: "M54 56 L62 56", weight: 3 },
    ],
    ornamentAxis: [50, 32, 50, 72],
    focus: [50, 44],
  },
};

/** lane 3 — light. Soft, flowing, barely there. */
const ARMOR_LIGHT: Record<Preset, Silhouette> = {
  // Robe: shoulders falling into a wide, broken hem.
  fantasy: {
    shapes: [
      { kind: "path", d: "M40 26 Q50 22 60 26 L70 78 Q50 86 30 78 Z" },
      { kind: "path", d: "M50 28 Q46 52 42 80", weight: 2 },
      { kind: "path", d: "M50 28 Q54 52 58 80", weight: 2 },
      { kind: "path", d: "M30 78 Q40 72 50 78 Q60 84 70 78", weight: 2 },
    ],
    ornamentAxis: [50, 30, 50, 76],
    focus: [50, 34],
  },
  // Cloak: asymmetric drape caught on one shoulder.
  scifi: {
    shapes: [
      { kind: "path", d: "M42 24 Q56 22 62 30 Q74 56 68 80 Q46 86 32 74 Z" },
      { kind: "path", d: "M44 28 Q44 56 38 78", weight: 2 },
      { kind: "path", d: "M58 30 Q62 56 60 80", weight: 2 },
      { kind: "circle", cx: 42, cy: 26, r: 3, filled: true },
    ],
    ornamentAxis: [48, 30, 48, 76],
    focus: [42, 26],
  },
  // Weave: an open lattice with almost no body.
  cyberpunk: {
    shapes: [
      { kind: "path", d: "M38 28 L62 28 L66 66 Q50 80 34 66 Z" },
      { kind: "path", d: "M38 36 L62 56", weight: 2 },
      { kind: "path", d: "M62 36 L38 56", weight: 2 },
      { kind: "path", d: "M36 50 L64 50", weight: 2 },
      { kind: "path", d: "M44 30 L44 72", weight: 2 },
      { kind: "path", d: "M56 30 L56 72", weight: 2 },
    ],
    ornamentAxis: [50, 32, 50, 72],
    focus: [50, 50],
  },
};

const WEAPON_LANES = [HEAVY, LIGHT, MID, RANGED, EXOTIC] as const;
const ARMOR_LANES = [ARMOR_HEAVY, ARMOR_MEDIUM, ARMOR_LIGHT] as const;

/**
 * Un-archetyped fallback — story objects and legacy loot that carry no
 * weapon/armor type. A plain sealed lozenge: clearly an item, clearly not
 * pretending to be a sword.
 */
const UNKNOWN: Silhouette = {
  shapes: [
    { kind: "path", d: "M50 22 L72 50 L50 78 L28 50 Z" },
    { kind: "circle", cx: 50, cy: 50, r: 5, filled: true },
  ],
  ornamentAxis: [50, 30, 50, 70],
  focus: [50, 50],
};

/** Silhouette for a gear card's slot + archetype under a preset. */
export function silhouetteFor(
  preset: Preset,
  slot: string,
  type: string | undefined,
): Silhouette {
  if (slot === "weapon") {
    const lane = weaponLane(preset, type);
    return lane === 0 ? UNKNOWN : WEAPON_LANES[lane - 1]![preset];
  }
  if (slot === "armor") {
    const lane = armorLane(preset, type);
    return lane === 0 ? UNKNOWN : ARMOR_LANES[lane - 1]![preset];
  }
  return UNKNOWN;
}

export { UNKNOWN };
