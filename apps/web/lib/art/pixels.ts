/**
 * Pixel sprites — authored creature art, stored as text.
 *
 * Each sprite is a grid of palette characters, one char per pixel, authored by
 * hand in `lib/art/sprites/*.ts`. This module validates a grid and compiles it
 * to SVG path data.
 *
 * ## Why text grids rather than image files
 *
 * The art has to live in the repo, survive review as a diff, and stay
 * inspectable — a reviewer can read a change to a goblin's ear in a pull
 * request. A grid of characters gives all three; a PNG gives none of them. It
 * also means no binary assets, no loader, no layout shift from an image
 * arriving late, and no new dependency.
 *
 * ## The colour departure, stated plainly
 *
 * `lib/ui/loot-visuals.ts` sets the rule that art never hardcodes a colour, so
 * that everything inherits genre palettes, the CRT phosphor skin, and custom
 * realm accents for free. **Sprites deliberately break that rule**, because
 * local colour is the entire point of a sprite: a goblin is green in every
 * realm, and a goblin recoloured to a realm's accent is exactly the abstract
 * heraldry sprites exist to replace.
 *
 * The rule still holds everywhere it was load-bearing. Item glyphs, the player
 * crest and impact marks remain generative and inherit theming as before; the
 * element aura behind a sprite is still resolved through `palette.ts`. Only the
 * creature's own body carries authored colour.
 *
 * ## One shared character vocabulary
 *
 * `INK` is global and every character means the same thing in all 51 sprites:
 * `#` is always outline, `e` is always an eye glow, `m` is always light steel.
 * Set-wide consistency is the hardest part of hand-authored art — 51 sprites
 * drawn against 51 ad-hoc palettes would read as 51 unrelated styles — and a
 * fixed vocabulary buys most of it before the first pixel is placed. A sprite
 * may still pass `palette` to override a character locally for a one-off.
 */

/** Transparent cells. Both are accepted so grids can be padded with spaces. */
const EMPTY = new Set([".", " "]);

/**
 * The shared palette. Lowercase is the lit tone, uppercase its shadow, so a
 * sprite can shade a form with one keystroke per pixel and stay in key.
 */
export const INK: Readonly<Record<string, string>> = {
  // Structure. Not pure black — a warm near-black reads less harsh against
  // both the phosphor terminal and the raw genre backgrounds.
  "#": "#15110f",
  "'": "#2a2320", // soft outline, for interior lines that shouldn't dominate

  // Flesh
  s: "#d9a384", // pale skin
  S: "#a9724f", // pale skin, shadow
  h: "#8c5a3c", // dark skin
  H: "#5e3826", // dark skin, shadow
  g: "#7aa23f", // goblinoid green
  G: "#4e6b27", // goblinoid green, shadow
  v: "#89c23b", // toxic / sickly green
  V: "#52782a", // toxic green, shadow

  // Hide and hair
  f: "#8a6a47", // fur / leather brown
  F: "#5a4430", // fur brown, shadow
  a: "#6b6f78", // ash grey hide
  A: "#464a52", // ash grey, shadow

  // Bone
  b: "#e3dcc4", // bone
  B: "#a89f84", // bone, shadow

  // Cloth
  c: "#8f4034", // cloth red
  C: "#5e2622", // cloth red, shadow
  r: "#6b4a9c", // robe violet
  R: "#432d66", // robe violet, shadow
  d: "#3a4152", // dark cloth / denim
  D: "#262b38", // dark cloth, shadow

  // Metal
  m: "#b9c2cc", // steel
  M: "#7c858f", // steel, shadow
  n: "#d8b25a", // gold / bronze
  N: "#957632", // gold, shadow

  // Light and energy
  e: "#fff2b0", // eye glow / highlight
  x: "#e5484d", // hostile red
  X: "#a32b2f", // hostile red, shadow
  o: "#f08b2e", // fire orange
  O: "#a85d14", // fire orange, shadow
  y: "#f5d547", // yellow
  Y: "#a8900f", // yellow, shadow
  t: "#4dd4e0", // tech cyan
  T: "#2b8d99", // tech cyan, shadow
  p: "#ff4fd8", // neon magenta
  P: "#b32a98", // neon magenta, shadow
  w: "#cfe4f5", // wisp pale
  W: "#8fa9c4", // wisp pale, shadow
  k: "#2b1f3d", // void / shadowstuff
  K: "#1a1326", // void, deepest
};

export type Sprite = {
  /** Grid width in pixels. Every row must be exactly this long. */
  readonly w: number;
  /** Grid height in pixels. Must equal `rows.length`. */
  readonly h: number;
  /** One string per row, each `w` characters of `INK` keys or `.`/space. */
  readonly rows: readonly string[];
  /** Local character overrides, merged over `INK`. */
  readonly palette?: Readonly<Record<string, string>>;
};

/** A sprite compiled to one path per distinct colour. */
export type PixelLayer = {
  readonly fill: string;
  readonly d: string;
};

/**
 * Reject a malformed grid loudly at module load rather than drawing a creature
 * with a bite out of it. A ragged row is the overwhelmingly common authoring
 * slip — one character short and everything right of it shifts up a line — and
 * it is almost invisible by eye in a 32-row block of text.
 */
export function validateSprite(sprite: Sprite, name: string): void {
  const { w, h, rows } = sprite;
  if (rows.length !== h) {
    throw new Error(`sprite ${name}: declared h=${h} but has ${rows.length} rows`);
  }
  rows.forEach((row, y) => {
    if (row.length !== w) {
      throw new Error(
        `sprite ${name}: row ${y} is ${row.length} chars, expected w=${w}`,
      );
    }
    for (const ch of row) {
      if (EMPTY.has(ch)) continue;
      if (!(sprite.palette?.[ch] ?? INK[ch])) {
        throw new Error(`sprite ${name}: row ${y} uses unknown ink '${ch}'`);
      }
    }
  });
}

const cache = new WeakMap<Sprite, readonly PixelLayer[]>();

/**
 * Compile a grid to one `<path>` per colour.
 *
 * Horizontal runs of the same character collapse into a single rect, and all
 * rects of one colour share a path, so node count tracks the number of colours
 * (~8–14) rather than the number of pixels (1024). Without this a 32×32 sprite
 * would be a thousand DOM nodes, which the animated stage cannot afford.
 *
 * Coordinates are whole numbers by construction, so paired with
 * `shape-rendering: crispEdges` the pixel edges stay hard at any scale and
 * adjacent rows meet with no seam.
 */
export function compileSprite(sprite: Sprite): readonly PixelLayer[] {
  const hit = cache.get(sprite);
  if (hit) return hit;

  const ink = sprite.palette ? { ...INK, ...sprite.palette } : INK;
  // Insertion-ordered, so draw order is stable and deterministic: the first
  // colour encountered scanning top-left to bottom-right paints first.
  const paths = new Map<string, string[]>();

  for (let y = 0; y < sprite.h; y++) {
    const row = sprite.rows[y]!;
    let x = 0;
    while (x < sprite.w) {
      const ch = row[x]!;
      if (EMPTY.has(ch)) {
        x += 1;
        continue;
      }
      let run = 1;
      while (x + run < sprite.w && row[x + run] === ch) run += 1;
      const fill = ink[ch]!;
      const seg = paths.get(fill);
      const d = `M${x} ${y}h${run}v1h-${run}z`;
      if (seg) seg.push(d);
      else paths.set(fill, [d]);
      x += run;
    }
  }

  const layers: PixelLayer[] = [];
  for (const [fill, segs] of paths) layers.push({ fill, d: segs.join("") });
  const frozen = Object.freeze(layers);
  cache.set(sprite, frozen);
  return frozen;
}

/** Count of opaque pixels — used by tests to catch an accidentally blank grid. */
export function inkedPixels(sprite: Sprite): number {
  let n = 0;
  for (const row of sprite.rows) for (const ch of row) if (!EMPTY.has(ch)) n += 1;
  return n;
}
