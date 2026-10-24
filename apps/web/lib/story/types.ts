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

/**
 * Which voice speaks a beat. The two are never mixed — the whole point of
 * splitting them is that a reader can tell who is talking without being told,
 * which is what the single-register prose could never do.
 *
 *   - `book`   — second person, flat, present. Describes only, never
 *     explains. Rendered with the ledger `Body` voice (hanging em-dash).
 *   - `margin` — a former borrower, first person, dated and signed.
 *     Opinionated, frightened, funny, sometimes wrong. Handwriting styling,
 *     and explicitly *not* the em-dash tic, which belongs to the Book.
 *
 * There is deliberately no voice for the antagonist. A third register that
 * rendered him as typography — struck-through lines, redaction bars — was
 * built and cut: without an established convention to read it against, an
 * edit happening on screen reads as a glitch, not as a hand. He is carried by
 * what's missing from the artifact instead (an unsigned first entry, a word
 * written under the player's name by nobody), which needs no convention.
 *
 * Omitted means `book`, so every existing beat literal keeps its voice.
 */
export type BeatVoice = "book" | "margin";

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
  /**
   * Body paragraphs — each its own line in the staggered reveal.
   *
   * Stays `string[]` on purpose. Widening it to `(string | BeatLine)[]` to
   * carry per-line annotations would break the dwell's reveal estimate (which
   * counts `body.length`), force narrowing at the one render site, and cost
   * the invariant this file's header states — that the prose reads correctly
   * with every annotation stripped. `voice` rides alongside as a side-car
   * instead.
   */
  body: string[];
  /** Optional right-aligned attribution at the foot of the page. */
  footnote?: string;
  /** Label on the advance control. */
  cta: string;
  /** Optional backdrop wash tint behind this beat's frame. */
  wash?: BeatWash;
  /** Optional cinematic timing. */
  timing?: BeatTiming;
  /** Who speaks this beat. Omitted = `"book"`. */
  voice?: BeatVoice;
  /**
   * Require a deliberate act before the beat will advance.
   *
   * The opening asks the player to *do* three things — pull the card, read
   * their own handwriting on it, sign it — rather than read about doing them.
   * While a beat is gated, Enter is disarmed and the auto-advance dwell never
   * starts; the frame calls `satisfyGate()` when the act is performed. Reduced
   * motion is unaffected: the gate is an interaction requirement, not motion.
   */
  gate?: "interaction";
  /**
   * Lines appended once a `gate: "interaction"` beat has been satisfied — the
   * consequence of the act, revealed after it.
   *
   * Exists so that prose cannot hide from the word budget. The signing beat's
   * aftermath used to be written as JSX inside `ColdOpenBook`'s `renderFrame`,
   * where `coldOpen.test.ts` could not see it: the beat declared 20 words and
   * put 74 on screen, roughly three times the per-beat ceiling, on the single
   * most important page of the opening. The budget exists precisely because
   * the previous 800-word opening "crept there one reasonable-seeming sentence
   * at a time", so a blind spot in it is worse than a long beat.
   *
   * Counted against the same ceiling as `body` (the two are summed), because
   * what matters is words on screen at once, not where they came from.
   */
  afterGate?: string[];
};
