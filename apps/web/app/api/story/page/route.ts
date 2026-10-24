import { NextResponse } from "next/server";

import { withStoryGuards } from "@/lib/server/story-guards";
import { generateRealmPage } from "@/lib/server/story-ai";
import { getPlayerRealm, setRealmLore } from "@/lib/server/realm-db";
import { realmPageFallback, type RealmLore } from "@/lib/story/page-bank";
import { pageRequestSchema, type PageResponse } from "@/lib/story/page-wire";

/**
 * `POST /api/story/page` — the lore of a page a player wrote.
 *
 * Called by `/create` the moment `POST /api/realm/register` succeeds. The
 * founding rite does **not** wait on it: four wallet signatures have already
 * landed and the realm is playable, so narration is not allowed to be the step
 * that makes the ceremony feel like it failed.
 *
 * ── The one rule, same as the epitaph route ────────────────────────────────
 * **A caller must not be able to tell whether a model answered.** Flag off,
 * missing key, HTTP error, timeout, an unparseable reply and a rejected one
 * all return `200` carrying `realmPageFallback` — which is a pure function of
 * the realm's address, so it is stable forever without a row to hold it. The
 * only non-200s are `400` for a malformed body, `404` for an address no realm
 * was registered at, and `429` from the guard.
 *
 * ── Authorization, and why there is none ───────────────────────────────────
 * The body carries an address and nothing else; the preset, name and boss id
 * come off the sqlite row. That row existing is a real authorization fact:
 * `/api/realm/register` only writes it after verifying on-chain that
 * `owner()` is the claimed creator and that `minters[delegate]` is set. So an
 * unregistered address 404s, and the worst a stranger can do with a
 * registered one is cause it to receive, once, the lore it was going to
 * receive anyway. Nothing here is destructive and nothing is re-writable.
 *
 * ── Idempotency ────────────────────────────────────────────────────────────
 * A realm's lore is written exactly once, enforced in SQL rather than here:
 * `setRealmLore` updates `WHERE page_text IS NULL`. Two concurrent POSTs may
 * both call the model, but only one write lands and the loser re-reads the
 * winner's text, so every visitor to a realm sees the same prose.
 *
 * A *failed* generation is deliberately not recorded. Phase 3a's rule applies
 * unchanged: a transient failure must not poison the row, so a realm founded
 * on a day the key was missing can still be given lore later.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad(400, "invalid_body", "body must be JSON");
  }

  const parsed = pageRequestSchema.safeParse(body);
  if (!parsed.success) {
    return bad(400, "invalid_body", parsed.error.issues[0]?.message ?? "invalid body");
  }

  const address = parsed.data.realmAddress.toLowerCase() as `0x${string}`;
  const row = getPlayerRealm(address);
  if (!row) {
    return bad(404, "not_found", `realm ${address} is not registered`);
  }

  const facts = {
    realm: row.address,
    name: row.name,
    preset: row.preset,
    bossId: row.bossId,
  };

  // Already written — by an earlier call, or by the winner of a race with
  // this one. Nothing further to do, and no second model call to pay for.
  if (row.lore) return ok(row.lore);

  // Never throws by contract — see `generateRealmPage`'s docblock.
  const generated = await generateRealmPage(facts);
  if (generated) {
    if (setRealmLore(address, generated)) {
      return ok({ ...generated, source: "model" });
    }
    // Lost the race. Serve what actually landed rather than the text we were
    // holding, so two creators watching one realm never read different pages.
    const fresh = getPlayerRealm(address)?.lore;
    if (fresh) return ok(fresh);
  }

  return ok(realmPageFallback(facts));
}

function ok(lore: RealmLore): Response {
  return NextResponse.json({ ok: true, lore } satisfies PageResponse);
}

function bad(status: number, reason: string, message: string): Response {
  return NextResponse.json({ ok: false as const, reason, message }, { status });
}

export const POST = withStoryGuards(handler);
