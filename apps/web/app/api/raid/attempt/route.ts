import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { issueAttempt } from "@/lib/server/raid-db";
import { withRealmGuards } from "@/lib/server/realm-guards";
import { addressSchema } from "@/lib/validation/schemas";

/**
 * `POST /api/raid/attempt` — spend one earned attempt and open a fight.
 *
 * Returns everything the client needs to run the fight locally through the
 * same pure engine every other encounter uses: the run seed, the turn limit,
 * the edition total (the boss's `baseHp`) and the current pool (`startHp`).
 * Those last two are distinct on purpose — the phase transition keys off the
 * edition crossing half, not off this attempt, so he changes for everyone at
 * once.
 *
 * **The seed is issued here and nowhere else.** The client cannot choose or
 * predict it, which closes the grinding hole the plan flagged: `deriveRunSeed`
 * took a client timestamp as its nonce, so a client could brute-force nonces
 * offline and submit its luckiest run — and replay would have accepted it,
 * correctly, because it *was* a legitimate run.
 *
 * **Trust model, stated plainly.** There is no signature here. The caller
 * asserts its own address, exactly as `/api/realm/boss-cleared` and
 * `/api/realm/mint-loot` already do, so anyone can burn anyone else's earned
 * attempt by asking. That is griefing, which this PoC puts out of scope, and
 * closing it means signed requests across the whole realm surface rather than
 * one route. Worth knowing before this ships anywhere real.
 *
 * Write-kind guards: this mutates the raid db, so it shares the write
 * rate-limit bucket with the signing routes rather than the polling budget.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ player: addressSchema });

async function handleRaidAttempt(req: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      {
        ok: false as const,
        reason: "invalid" as const,
        message: e instanceof Error ? e.message : "Bad request body",
      },
      { status: 400 },
    );
  }

  try {
    const issued = issueAttempt(body.player as `0x${string}`);
    return NextResponse.json({
      ok: true as const,
      attemptId: issued.attemptId,
      rngSeed: issued.rngSeed,
      edition: issued.edition,
      turnLimit: issued.turnLimit,
      startHp: issued.startHp,
      editionHp: issued.editionHp,
    });
  } catch (e) {
    // Each refusal is a different thing a client has to say — the gate is
    // shut, no edition is open, he has already fallen, you have not earned
    // one — so they get distinct reasons rather than one opaque 409. A
    // felled pool especially: "he is down, edition 2 opens later" is not
    // the same message as "something went wrong", and the grant is still
    // unspent either way.
    const message = e instanceof Error ? e.message : String(e);
    const reason = /sealed/.test(message)
      ? ("raid_sealed" as const)
      : /no edition/.test(message)
        ? ("no_edition" as const)
        : /was felled/.test(message)
          ? ("already_felled" as const)
          : /no unspent attempts/.test(message)
            ? ("no_attempts" as const)
            : ("unavailable" as const);
    return NextResponse.json(
      { ok: false as const, reason, message },
      { status: 409 },
    );
  }
}

// Rate limit + JSON-guaranteed error envelope. See lib/server/realm-guards.ts.
export const POST = withRealmGuards("write", handleRaidAttempt);
