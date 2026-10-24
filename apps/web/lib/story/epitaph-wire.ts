/**
 * The wire contract for `/api/story/epitaph`, and the length discipline that
 * decides whether a generated death note is allowed on screen.
 *
 * Pure and dependency-light on purpose: the request schema is used by the
 * route to validate and by the client to build, and `sanitizeEpitaph` runs on
 * the server (right after the model answers) with the client free to re-run it
 * on anything it receives. One implementation, so "what counts as acceptable"
 * can't drift between the two ends.
 *
 * The *rejections* themselves live in `prose-filter.ts`, shared with the realm
 * page surface — they are failures of the medium rather than of this prompt,
 * so a tell caught on one surface is caught on both. What stays here is the
 * part that is specific to an epitaph: its wire shape and its two ceilings.
 */

import { z } from "zod";
import { hex32, presetSchema } from "@/lib/validation/schemas";
import { sanitizeProse } from "./prose-filter";

// Re-exported so `epitaph-wire` remains the single import for anything
// working on this surface, and so the sentence helpers have one home.
export { countSentences, truncateAtSentence } from "./prose-filter";

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

/**
 * A note may not run longer than this many sentences.
 *
 * A margin note that runs past a few lines stops reading as something
 * scrawled in a hurry, which was the whole point of the form.
 */
export const EPITAPH_MAX_SENTENCES = 3;

/**
 * Run a model's epitaph through the shared filter at this surface's ceilings.
 *
 * Returns the cleaned note, or `null` meaning "use the bank".
 */
export function sanitizeEpitaph(raw: unknown): string | null {
  return sanitizeProse(raw, {
    maxChars: EPITAPH_MAX_CHARS,
    maxSentences: EPITAPH_MAX_SENTENCES,
  });
}
