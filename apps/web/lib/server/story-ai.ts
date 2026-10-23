import "server-only";

import { getStoryAiEnv, storyAiEnabled } from "@/lib/env";
import { PAGES } from "@/lib/story/canon";
import {
  EPITAPH_MAX_CHARS,
  EPITAPH_MAX_SENTENCES,
  sanitizeEpitaph,
  type EpitaphRequest,
} from "@/lib/story/epitaph-wire";

/**
 * The single seam between this game and a language model.
 *
 * Deliberately one file with one exported function. No provider existed in
 * this repo before Phase 3, and the thing most likely to age badly about that
 * decision is the provider itself — so swapping it is a one-file change, and
 * nothing upstream knows an HTTP call happens at all.
 *
 * ── Why raw `fetch` and not an SDK ─────────────────────────────────────────
 * The whole integration is one non-streaming POST with a four-field body.
 * An SDK would add a dependency, a lockfile entry and a release cadence to
 * maintain, in exchange for retry logic this route explicitly does not want
 * (see the timeout note below). If this ever grows tool use or streaming,
 * take the dependency then.
 *
 * ── The contract with every caller ─────────────────────────────────────────
 * **This function never throws and never rejects.** Disabled flag, missing
 * key, network failure, timeout, HTTP error, malformed payload, and a
 * sanitiser rejection all return `null`, meaning "use the bank". A narration
 * flourish must not be able to turn a player's death screen into an error —
 * and because `epitaphFallback` is good and is what ships with the flag off,
 * `null` is the ordinary case rather than the sad one.
 */

/**
 * The system prompt. Kept here rather than in a content module because it is
 * machine instruction, not story — nobody should be tempted to read it as
 * canon, and `canon.test.ts` deliberately does not police it.
 *
 * It states the constraints twice over: once here in prose, and again in
 * `sanitizeEpitaph`, which does not trust this to have worked.
 */
const SYSTEM = [
  "You write a single margin note in a cursed library book.",
  "The note is scrawled by a borrower who has just died inside one of its pages, addressed to whoever borrows the book next.",
  "Voice: first person, past tense, terse, physical, a little bitter. A real person out of breath, not a narrator.",
  `Hard limits: at most ${EPITAPH_MAX_SENTENCES} sentences and ${EPITAPH_MAX_CHARS} characters.`,
  "Output the note only. No preamble, no quotation marks, no markdown, no formatting of any kind.",
  "Never mention games, players, users, levels, stats, or anything outside the fiction.",
  "Use only the facts given. Do not invent names of people or places.",
].join(" ");

/** The facts, as a flat list the model has to work from and cannot embellish. */
function factSheet(facts: EpitaphRequest): string {
  const page = PAGES[facts.preset].name;
  const lines = [
    `Page: ${page}`,
    `Rooms survived: ${facts.depth}`,
    `Killed by: ${facts.killedBy}`,
    facts.wasBookmark
      ? "That was the thing holding this page open, not a lesser creature."
      : "That was an ordinary thing down there, not the page's keeper.",
    facts.turns > 0 ? `The fight lasted ${facts.turns} turns.` : null,
    facts.carried > 0
      ? `Lost ${facts.carried} unrecorded findings on the way down.`
      : "Was carrying nothing.",
  ];
  return lines.filter(Boolean).join("\n");
}

/**
 * Ask the model for an epitaph. Resolves to a clean note, or `null`.
 *
 * The timeout is enforced with `AbortSignal.timeout` and there is **no
 * retry**: the player is already looking at a defeat overlay carrying the
 * bank note, so a second attempt spends more money to replace something
 * acceptable, later. Failing fast to the bank is the better product.
 */
export async function generateEpitaph(
  facts: EpitaphRequest,
): Promise<string | null> {
  if (!storyAiEnabled()) return null;

  const env = getStoryAiEnv();
  const apiKey = env.ANTHROPIC_API_KEY;
  // `storyAiEnabled()` already proved this, but the compiler hasn't seen it.
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: env.STORY_AI_MODEL,
        // Generous enough that a good note is never cut off mid-thought by
        // the budget; the length discipline is `sanitizeEpitaph`'s job, and
        // a note truncated by max_tokens would fail its sentence-end check.
        max_tokens: 300,
        temperature: 1,
        system: SYSTEM,
        messages: [{ role: "user", content: factSheet(facts) }],
      }),
      signal: AbortSignal.timeout(env.STORY_AI_TIMEOUT_MS),
    });

    if (!res.ok) {
      // Body, not just status: a 400 here is usually a stale model id, and
      // the response says which. Logged once per failure, server-side only.
      console.warn(
        `[story-ai] epitaph HTTP ${res.status}:`,
        await res.text().catch(() => "<unreadable>"),
      );
      return null;
    }

    const json: unknown = await res.json();
    return sanitizeEpitaph(extractText(json));
  } catch (e) {
    // Includes the abort on timeout. Warn, never throw — see the contract
    // above. `TimeoutError` is expected traffic, not an incident.
    console.warn("[story-ai] epitaph call failed:", e);
    return null;
  }
}

/**
 * Pull the text out of a Messages API reply without trusting its shape.
 *
 * Hand-rolled rather than Zod because the only question is "is there a string
 * at `content[].text`" — and `sanitizeEpitaph` rejects anything odd that gets
 * through, so a loose read here cannot put bad prose on screen.
 */
function extractText(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const content = (json as { content?: unknown }).content;
  if (!Array.isArray(content)) return null;

  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const { type, text } = block as { type?: unknown; text?: unknown };
    if (type === "text" && typeof text === "string") parts.push(text);
  }
  return parts.length > 0 ? parts.join(" ") : null;
}
