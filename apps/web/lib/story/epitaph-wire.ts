/**
 * The wire contract for `/api/story/epitaph`, and the output discipline that
 * decides whether a generated sentence is allowed on screen.
 *
 * Pure and dependency-light on purpose: the request schema is used by the
 * route to validate and by the client to build, and `sanitizeEpitaph` runs on
 * the server (right after the model answers) with the client free to re-run it
 * on anything it receives. One implementation, so "what counts as acceptable"
 * can't drift between the two ends.
 *
 * ── Why the filter is this strict ──────────────────────────────────────────
 * Every other line of narration in this game was written by hand and reviewed
 * in a diff. A generated one is the only prose that reaches a player without
 * anybody reading it first, so the only safe posture is to assume it is wrong
 * and to make rejection cheap: `epitaphFallback` is right there, it is good,
 * and it is what ships with the flag off anyway. Nothing is lost by refusing a
 * borderline sentence, and the voice is lost by letting one through.
 *
 * The specific rejections aren't arbitrary — each is a failure mode of asking
 * a chat model for in-world prose:
 *
 *   - **Markdown** — it formats. A margin note is ink on paper; asterisks and
 *     backticks shatter the illusion harder than a dull sentence does.
 *   - **URLs / emails** — nothing in 1911 has a link in it.
 *   - **Preamble** ("Here is...", "Sure,") — the assistant register leaking
 *     through, and the single most recognisable tell.
 *   - **Second-person-plural / meta narration about "the player"** — the note
 *     is written by a dead borrower to the next one, not about a user.
 *   - **Length** — a margin note that runs past a few lines stops reading as
 *     something scrawled in a hurry, which was the whole point of the form.
 */

import { z } from "zod";
import { hex32, presetSchema } from "@/lib/validation/schemas";

/**
 * What the client sends. These are exactly the facts `epitaphFallback` already
 * takes — the request carries no free text, so there is no prompt-injection
 * surface here beyond `killedBy`, which is capped and comes from the monster
 * catalog rather than from user input.
 */
export const epitaphRequestSchema = z.object({
  // `hex32` infers plain `string`; the cast re-attaches the template-literal
  // type the rest of the story modules take, and it is sound because the
  // regex has already proved the shape. Done here rather than in
  // `lib/validation/schemas.ts` so the shared primitive's inference — which
  // four other routes depend on — doesn't move.
  runSeed: hex32.transform((s) => s as `0x${string}`),
  preset: presetSchema,
  depth: z.number().int().min(0).max(64),
  killedBy: z.string().min(1).max(60),
  wasBookmark: z.boolean(),
  turns: z.number().int().min(0).max(999),
  carried: z.number().int().min(0).max(99),
});

export type EpitaphRequest = z.infer<typeof epitaphRequestSchema>;

/** What the route answers. `source` is for tests and the network tab; the
 *  game must behave identically either way. */
export type EpitaphResponse = {
  ok: true;
  text: string;
  source: "model" | "bank";
};

/** Hard ceiling on a generated note, in characters. */
export const EPITAPH_MAX_CHARS = 240;

/** A note may not run longer than this many sentences. */
export const EPITAPH_MAX_SENTENCES = 3;

/**
 * Phrases that mean the assistant is talking, not the borrower. Matched at the
 * start only — "sure" and "here" are perfectly good words mid-sentence, and
 * banning them outright would reject valid prose.
 */
const PREAMBLE = [
  /^\s*(sure|certainly|of course|okay|ok)\b/i,
  /^\s*here(?:'s| is| are)\b/i,
  /^\s*(i'?d be happy|happy to)\b/i,
  /^\s*(note|epitaph|margin note)\s*:/i,
  /^\s*as (an|a) (ai|assistant|language model)\b/i,
];

/** Formatting and out-of-world artefacts. Matched anywhere. */
const ARTEFACTS = [
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
 * A margin note that stops mid-word reads as a bug; one that stops a sentence
 * early reads as a borrower who ran out of room, which is free characterisation.
 * Returns `null` when not even one sentence fits, because a hard-cut fragment
 * is worse than the bank note it would replace.
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
 * Returns the cleaned note, or `null` meaning "use the bank". Callers must
 * treat `null` as completely ordinary — with the flag off it is the only
 * outcome, so the fallback path is the one that gets exercised everywhere.
 */
export function sanitizeEpitaph(raw: unknown): string | null {
  if (typeof raw !== "string") return null;

  // Collapse all whitespace first: a model that answers with a blank line
  // between sentences would otherwise fail the artefact check for no reason,
  // and the note renders as one paragraph regardless.
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length === 0) return null;

  if (PREAMBLE.some((re) => re.test(text))) return null;
  if (ARTEFACTS.some((re) => re.test(text))) return null;

  const capped = truncateAtSentence(text, EPITAPH_MAX_CHARS);
  if (!capped) return null;

  // Checked AFTER truncation: a long answer whose first two sentences are
  // good is still a good note, and refusing it would waste a call we paid for.
  if (countSentences(capped) > EPITAPH_MAX_SENTENCES) return null;

  // Must end as a sentence. Anything else is a fragment the cap produced.
  if (!/[.!?]["']?$/.test(capped)) return null;

  return capped;
}
