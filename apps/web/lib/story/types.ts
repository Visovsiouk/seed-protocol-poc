/**
 * Shared story-beat shapes for the cinematic delivery layer.
 *
 * A `CinematicBeat` is a single page/frame of diegetic narration plus optional
 * *timing* and *backdrop* annotations the `CinematicBeatPlayer` reads to turn
 * static text into a felt beat: per-line reveal, a held emphasis line, an
 * auto-advancing dwell, a fade-to-black cut, and a per-beat wash behind the
 * frame. The annotations are purely presentational — the prose still reads
 * correctly with every timing field stripped (and reduced-motion does exactly
 * that: instant lines, no auto-advance, the CTA as the manual forward path).
 *
 * `ColdOpenBeat` (lib/story/coldOpen.ts) is an alias of this shape, so the
 * five cold-open pages can carry `wash`/`timing` without a second type.
 */

/** Backdrop wash tint keyed behind a beat's frame (aria-hidden layer). */
export type BeatWash = "accent" | "danger" | "void" | "warm";

/** Optional cinematic timing for a beat. All fields are opt-in. */
export type BeatTiming = {
  /** Reveal body lines one at a time on a slow stagger instead of together. */
  lineStagger?: boolean;
  /**
   * Auto-advance to the next beat after this dwell (ms), measured from when
   * the lines finish revealing. Disabled under reduced motion; the CTA stays
   * as the manual forward path. The player never starts the dwell while an
   * activation key is physically held (prevents a held Enter from cascading).
   */
  dwellMs?: number;
  /**
   * Hold a slow breathing emphasis on one body line (by index) — the line the
   * beat wants to land on. Suppressed under reduced motion.
   */
  hold?: { line: number };
  /** Fade the frame to black on exit from this beat (a scene cut). */
  fadeOutToBlack?: boolean;
};

/** One frame of cinematic narration. */
export type CinematicBeat = {
  /** Small-caps eyebrow stamp at the top of the page. */
  stamp: string;
  /** Body paragraphs — each its own line in the staggered reveal. */
  body: string[];
  /** Optional right-aligned attribution at the foot of the page. */
  footnote?: string;
  /** Label on the advance control. */
  cta: string;
  /** Optional backdrop wash tint behind this beat's frame. */
  wash?: BeatWash;
  /** Optional cinematic timing. */
  timing?: BeatTiming;
};
