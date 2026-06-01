/**
 * Curated realm accent palette (poc-accent-picker).
 *
 * A `/create` author may override their realm's genre-default accent with
 * one of these hand-picked hexes. The set is closed and shared by the
 * client picker (swatches) and the register route (server-side
 * allow-list) so a crafted POST can't inject arbitrary CSS into the
 * `--color-preset-accent` cascade.
 *
 * Every swatch is chosen to clear contrast on all three genre backgrounds
 * (fantasy `#1a120b`, scifi `#050912`, cyberpunk `#0a0212`) since the
 * accent doubles as the primary-button fill (whose text is the realm
 * background colour). A `null` accent means "inherit the genre default".
 */

export type AccentSwatch = {
  /** `#rrggbb`, lowercase. */
  hex: string;
  /** Short human label for the picker. */
  label: string;
};

export const REALM_ACCENTS: readonly AccentSwatch[] = [
  { hex: "#c9a14a", label: "Gold" },
  { hex: "#4ad8ff", label: "Cyan" },
  { hex: "#ff2ea6", label: "Magenta" },
  { hex: "#7ed99a", label: "Jade" },
  { hex: "#f0c860", label: "Amber" },
  { hex: "#9d7bff", label: "Violet" },
  { hex: "#ff8a5c", label: "Ember" },
  { hex: "#5fd0c5", label: "Teal" },
] as const;

const ACCENT_SET = new Set(REALM_ACCENTS.map((a) => a.hex));

/** True if `hex` is one of the curated accents (exact, lowercase match). */
export function isAllowedAccent(hex: string): boolean {
  return ACCENT_SET.has(hex);
}
