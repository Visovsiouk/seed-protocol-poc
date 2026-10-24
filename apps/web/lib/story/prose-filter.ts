/**
 * One definition of "generated prose we are willing to show a player".
 *
 * Extracted out of `epitaph-wire.ts` when a second generated surface arrived
 * (realm page lore). The two have different lengths, different voices and
 * different fallbacks, but they fail in exactly the same ways, because the
 * failures belong to the medium rather than to the prompt: a chat model
 * formats, labels, hedges, links, and talks about "the player". Keeping one
 * filter means a tell that gets caught on one surface is caught on both.
 *
 * ── Why the bar is this high ────────────────────────────────────────────────
 * Every other line of narration in this game was written by hand and reviewed
 * in a diff. A generated one is the only prose that reaches a player without
 * anybody reading it first, so the only safe posture is to assume it is wrong
 * and make rejection cheap: both surfaces have a hand-authored bank behind
 * them, both banks are good, and with the flag off the bank is what ships.
 * Nothing is lost by refusing a borderline sentence; the voice is lost by
 * letting one through.
 *
 * Pure. No `window`, no env, no imports beyond types.
 */

/**
 * Phrases that mean the assistant is talking, not the fiction. Anchored at the
 * start only — "sure" and "here" are perfectly good words mid-sentence, and
 * banning them outright would reject valid prose.
 */
export const PREAMBLE: readonly RegExp[] = [
  /^\s*(sure|certainly|of course|okay|ok)\b/i,
  /^\s*here(?:'s| is| are)\b/i,
  /^\s*(i'?d be happy|happy to)\b/i,
  /^\s*(note|epitaph|margin note|page|bookmark|name)\s*:/i,
  /^\s*as (an|a) (ai|assistant|language model)\b/i,
];

/**
 * Formatting and out-of-world artefacts. Matched anywhere.
 *
 *   - **Markdown** — it formats. The book is ink on paper; asterisks and
 *     backticks shatter the illusion harder than a dull sentence does.
 *   - **URLs / emails** — nothing in 1911 has a link in it.
 *   - **Meta narration** — the prose is the book's voice or a dead
 *     borrower's, never a narrator describing a product to a user.
 */
export const ARTEFACTS: readonly RegExp[] = [
  /[*_`#|]/, // markdown emphasis, headings, code, tables
  /\[[^\]]*\]\([^)]*\)/, // markdown links
  /https?:\/\//i,
  /\bwww\./i,
  /\S+@\S+\.\S+/, // email
  /<[a-z/][^>]*>/i, // html
  /\b(the player|the user|the game|gameplay|this prompt)\b/i,
];

/**
 * Trim to the last complete sentence at or under `max` characters.
 *
 * Prose that stops mid-word reads as a bug; prose that stops a sentence early
 * reads as a hand that ran out of room, which is free characterisation.
 * Returns `null` when not even one sentence fits, because a hard-cut fragment
 * is worse than the bank line it would replace.
 */
export function truncateAtSentence(text: string, max: number): string | null {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;

  const window = trimmed.slice(0, max);

  // Walk every sentence ending in the window and keep the last. Scanning for
  // the *end offset* of the match rather than its index is what carries a
  // closing quote along with the terminator it belongs to — `He said "run."`
  // must not be cut to `He said "run.` with the quote left hanging open.
  // `[.!?]+` so `...` and `?!` are one ending, not several.
  const re = /[.!?]+["']?/g;
  let end = -1;
  for (let m = re.exec(window); m !== null; m = re.exec(window)) {
    end = m.index + m[0].length;
  }
  if (end === -1) return null;

  const cut = window.slice(0, end).trim();
  return cut.length > 0 ? cut : null;
}

/** Sentence count, counting a run of terminators (`...`, `?!`) as one. */
export function countSentences(text: string): number {
  const matches = text.trim().match(/[.!?]+(?:\s|$)/g);
  return matches ? matches.length : text.trim() ? 1 : 0;
}

/**
 * Run a model's answer through the discipline above.
 *
 * Returns the cleaned prose, or `null` meaning "use the bank". Callers must
 * treat `null` as completely ordinary — with the flag off it is the only
 * outcome, so the fallback path is the one that gets exercised everywhere.
 */
export function sanitizeProse(
  raw: unknown,
  limits: { maxChars: number; maxSentences: number },
): string | null {
  if (typeof raw !== "string") return null;

  // Collapse all whitespace first: a model that answers with a blank line
  // between sentences has not done anything wrong, and the prose renders as
  // one paragraph regardless — but the raw newlines would otherwise have to be
  // tolerated by every check below.
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length === 0) return null;

  if (PREAMBLE.some((re) => re.test(text))) return null;
  if (ARTEFACTS.some((re) => re.test(text))) return null;

  const capped = truncateAtSentence(text, limits.maxChars);
  if (!capped) return null;

  // Checked AFTER truncation: a long answer whose first two sentences are
  // good is still good prose, and refusing it would waste a call we paid for.
  if (countSentences(capped) > limits.maxSentences) return null;

  // Must end as a sentence. Anything else is a fragment the cap produced.
  if (!/[.!?]["']?$/.test(capped)) return null;

  return capped;
}
