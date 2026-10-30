import "server-only";

import { getStoryAiEnv, storyAiEnabled } from "@/lib/env";
import { PAGES } from "@/lib/story/canon";
import { bookmarkLore } from "@/lib/story/bookmarks";
import {
  EPITAPH_MAX_CHARS,
  EPITAPH_MAX_SENTENCES,
  sanitizeEpitaph,
  type EpitaphRequest,
} from "@/lib/story/epitaph-wire";
import {
  BOOKMARK_LINE_MAX_SENTENCES,
  PAGE_TEXT_MAX_SENTENCES,
  type RealmLore,
  type RealmLoreFacts,
} from "@/lib/story/page-bank";
import { parseLabelledLore, sanitizeRealmLore } from "@/lib/story/page-wire";

/**
 * The single seam between this game and a language model.
 *
 * Deliberately one file. Two surfaces are generated — a death epitaph and the
 * lore of a player-authored page — and both go out through the one private
 * `complete()` below, so the timeout, the no-retry rule and the never-throws
 * contract are defined once rather than twice in agreement. No provider
 * existed in this repo before Phase 3, and the thing most likely to age badly
 * about that decision is the provider itself, so swapping it is a one-file
 * change and nothing upstream knows an HTTP call happens at all.
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
 * `null` is the ordinary case: the player is already looking at a defeat
 * overlay carrying the bank note. See `complete()` for the timeout and the
 * no-retry rule.
 */
export async function generateEpitaph(
  facts: EpitaphRequest,
): Promise<string | null> {
  const text = await complete({
    label: "epitaph",
    system: SYSTEM,
    user: factSheet(facts),
    // Generous enough that a good note is never cut off mid-thought by the
    // budget; the length discipline is `sanitizeEpitaph`'s job, and a note
    // truncated by max_tokens would fail its sentence-end check.
    maxTokens: 300,
  });
  return sanitizeEpitaph(text);
}

// ── Realm page lore ────────────────────────────────────────────────────────

/**
 * The second generated surface: the lore of a page a player wrote at
 * `/create`. See `lib/story/page-bank.ts` for the canon frame — in short, an
 * editor always comes back for a second edition, so a new page always already
 * has somebody filed into it.
 *
 * Three labelled lines rather than JSON, parsed by `parseLabelledLore`. The
 * labels are shouted because a model that is told to emit `NAME:` emits
 * `NAME:`, where one told to emit valid JSON emits valid JSON wrapped in a
 * fenced code block about a third of the time — and a fence is exactly what
 * the artefact filter throws away.
 */
const PAGE_SYSTEM = [
  "You write entries for a cursed library book whose pages are whole worlds.",
  "Canon you must not contradict: borrowers are people who opened the book and were stamped out of it. A bookmark is a borrower bound into a page's heart to hold that page open. The one who binds them is an editor working toward a finished, signed edition; he is never named, never speaks, and must not be described. A borrower who earns a signet can write a new page of their own — and a new page always gets found and bookmarked, because an editor always returns for a second edition.",
  "The realm described below is one of those new pages. Someone wrote it recently. Something has already been filed at the bottom of it.",
  "Reply with exactly three lines and nothing else:",
  "NAME: a borrower's full name, two or three words, no title, no explanation",
  `PAGE: the book describing this page. Second person, flat, present tense. Describes, never explains. At most ${PAGE_TEXT_MAX_SENTENCES} sentences.`,
  `BOOKMARK: who the named borrower was and how they ended up filed here. At most ${BOOKMARK_LINE_MAX_SENTENCES} sentences.`,
  "No markdown, no quotation marks, no preamble, no blank lines.",
  "Never mention games, players, users, levels, stats, or anything outside the fiction.",
].join("\n");

/**
 * How to describe the ink. The same `unreached` → `underway` → `finished`
 * gradient `canon.ts` assigns the three founding pages, phrased as instruction
 * so a generated page sits inside the genre's texture rather than beside it.
 */
const REVISION_NOTE: Record<RealmLoreFacts["preset"], string> = {
  fantasy: "the ink is still wet; the page is still growing as you read it",
  cyberpunk: "half-set, mid-revision; neon curing on wet concrete",
  scifi: "cold and sealed, as though it were already finished",
};

/** The facts, as a flat list the model works from and cannot embellish. */
function pageSheet(facts: RealmLoreFacts): string {
  // The boss's archetype prose, not its id: `black_ice` means nothing to a
  // model, where the sentence a player actually reads under that name says
  // exactly what sort of thing is down there. The archetype's phase-2 `turn`
  // line is never regenerated, so feeding it the `intro` is what keeps the
  // generated identity and the kept mirror describing one creature.
  return [
    `Page name: ${facts.name}`,
    `Genre: ${facts.preset}`,
    `Revision state: ${REVISION_NOTE[facts.preset]}`,
    `What is filed at the bottom of it: ${bookmarkLore(facts.bossId).intro}`,
  ].join("\n");
}

/**
 * Ask the model for a page's lore. Resolves to all three fields, or `null`.
 *
 * Same contract as `generateEpitaph`: **never throws.** The difference is what
 * `null` costs — nothing, because `realmPageFallback` is a pure function of the
 * realm address and the route simply doesn't write a row.
 */
export async function generateRealmPage(
  facts: RealmLoreFacts,
): Promise<Omit<RealmLore, "source"> | null> {
  const text = await complete({
    label: "page",
    system: PAGE_SYSTEM,
    user: pageSheet(facts),
    // Three fields instead of one sentence, and a model that runs out of
    // budget mid-`BOOKMARK` fails the parse rather than half-filling a row.
    maxTokens: 600,
  });
  const parsed = parseLabelledLore(text);
  if (!parsed) return null;
  return sanitizeRealmLore(parsed);
}

// ── The call itself ────────────────────────────────────────────────────────

/**
 * One non-streaming completion, or `null`.
 *
 * The single place an HTTP request leaves this process for a model. Both
 * surfaces route through it so the timeout, the no-retry rule, the header set
 * and the failure logging are defined once — and so the "never throws"
 * contract above is enforced by one `try` rather than by two that have to stay
 * in agreement.
 *
 * The timeout is enforced with `AbortSignal.timeout` and there is **no
 * retry**: the caller already has a hand-authored fallback it can use
 * immediately, so a second attempt spends more money to replace something
 * acceptable, later. Failing fast to the bank is the better product.
 */
async function complete(args: {
  label: string;
  system: string;
  user: string;
  maxTokens: number;
}): Promise<string | null> {
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
        max_tokens: args.maxTokens,
        temperature: 1,
        system: args.system,
        messages: [{ role: "user", content: args.user }],
      }),
      signal: AbortSignal.timeout(env.STORY_AI_TIMEOUT_MS),
    });

    if (!res.ok) {
      // Body, not just status: a 400 here is usually a stale model id, and
      // the response says which. Logged once per failure, server-side only.
      console.warn(
        `[story-ai] ${args.label} HTTP ${res.status}:`,
        await res.text().catch(() => "<unreadable>"),
      );
      return null;
    }

    const json: unknown = await res.json();
    return extractText(json);
  } catch (e) {
    // Includes the abort on timeout. Warn, never throw — see the contract
    // above. `TimeoutError` is expected traffic, not an incident.
    console.warn(`[story-ai] ${args.label} call failed:`, e);
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
