import { NextResponse } from "next/server";

import { withStoryGuards } from "@/lib/server/story-guards";
import { generateEpitaph } from "@/lib/server/story-ai";
import { recallEpitaph, rememberEpitaph } from "@/lib/server/epitaph-memo";
import { epitaphFallback, epitaphId } from "@/lib/story/epitaph-bank";
import {
  epitaphRequestSchema,
  type EpitaphRequest,
  type EpitaphResponse,
} from "@/lib/story/epitaph-wire";

/**
 * `POST /api/story/epitaph` — the note the book writes about a death.
 *
 * ── The one rule ───────────────────────────────────────────────────────────
 * **The game must not be able to tell whether a model answered.** Flag off,
 * missing key, model error, timeout, and a sanitiser rejection all return
 * `200` with the hand-authored bank note. The only non-200s are `400` for a
 * body that isn't the documented shape and `429` from the guard.
 *
 * That is not defensive habit, it is the product decision: with the flag off —
 * the default, and every machine without a key — the bank *is* the shipped
 * experience. If a failed generation looked different from no generation, the
 * default configuration would be the degraded one, which is backwards.
 *
 * ── Why the route composes the fallback too ────────────────────────────────
 * `epitaphFallback` runs here as well as on the client. One bank, two call
 * sites, deliberately: the client needs it to render instantly without waiting
 * on a round-trip, and the server needs it so a failure still answers with
 * prose rather than a null the client has to special-case.
 */

export const runtime = "nodejs";

async function handler(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("body must be JSON");
  }

  const parsed = epitaphRequestSchema.safeParse(body);
  if (!parsed.success) {
    return bad(parsed.error.issues[0]?.message ?? "invalid body");
  }

  const facts: EpitaphRequest = parsed.data;
  const id = epitaphId(facts);

  const cached = recallEpitaph(id);
  if (cached) return ok(cached, "model");

  // Never throws by contract — see `generateEpitaph`'s docblock.
  const generated = await generateEpitaph(facts);
  if (generated) {
    rememberEpitaph(id, generated);
    return ok(generated, "model");
  }

  return ok(epitaphFallback(facts).text, "bank");
}

function ok(text: string, source: EpitaphResponse["source"]): Response {
  return NextResponse.json({ ok: true, text, source } satisfies EpitaphResponse);
}

function bad(message: string): Response {
  return NextResponse.json(
    { ok: false as const, reason: "invalid_body" as const, message },
    { status: 400 },
  );
}

export const POST = withStoryGuards(handler);
