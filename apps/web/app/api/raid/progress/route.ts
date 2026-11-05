import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { advanceAttemptProgress, raidContribution } from "@/lib/server/raid-db";
import { withRealmGuards } from "@/lib/server/realm-guards";
import { addressSchema, hex32 } from "@/lib/validation/schemas";

/**
 * `POST /api/raid/progress` — report an attempt's cumulative damage.
 *
 * Safe to call every round. `cumulativeDamage` is the total since the fight
 * began, not an increment, and the server applies the delta — so replaying a
 * total already recorded applies nothing and a stale packet arriving late
 * credits nothing rather than walking damage backwards. That is what makes
 * "dying contributes" true for an abandoned attempt as well as a lost one:
 * the damage already landed, so closing the tab forfeits at most the rounds
 * since the last report.
 *
 * `trace` is the player's actions so far, one character per round. Stored
 * rather than used: seed plus trace is exactly what S3's replay needs, and
 * neither can be recovered after the fact. A prefix of a trace is itself a
 * valid trace, so reporting mid-fight does not make verification a special
 * case later.
 *
 * **The damage is not verified.** S3 (server-side replay) is deferred, so a
 * tampered client can claim whatever it likes up to the pool. Two things
 * bound it today and neither is the attempt id: the turn limit, and the cost
 * of earning an attempt at all. The id used to be the bound, back when it was
 * an entry transaction's hash and an attempt was write-once — the incremental
 * path traded that away deliberately, and S3 is what buys it back.
 *
 * The attempt's `edition` is read from its own row rather than taken from the
 * request. A client supplying it could otherwise aim a fight at a different
 * edition than the one it was issued against.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  attemptId: hex32,
  player: addressSchema,
  cumulativeDamage: z.number().int().nonnegative(),
  turns: z.number().int().nonnegative(),
  survived: z.boolean(),
  trace: z
    .string()
    .regex(/^[as]*$/, "trace must be 'a'/'s' per round")
    .max(1000)
    .optional(),
});

async function handleRaidProgress(req: Request) {
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

  const attemptId = body.attemptId as `0x${string}`;
  const existing = raidContribution(attemptId);
  if (!existing) {
    return NextResponse.json(
      {
        ok: false as const,
        reason: "unknown_attempt" as const,
        message: `no attempt ${attemptId} — open one with POST /api/raid/attempt`,
      },
      { status: 404 },
    );
  }
  if (existing.player.toLowerCase() !== body.player.toLowerCase()) {
    return NextResponse.json(
      {
        ok: false as const,
        reason: "wrong_player" as const,
        message: `attempt ${attemptId} does not belong to ${body.player}`,
      },
      { status: 403 },
    );
  }
  // The turn limit is the attempt's own, fixed when it was issued, so
  // retuning config mid-edition cannot change the rules of a live fight.
  if (body.turns > existing.turnLimit) {
    return NextResponse.json(
      {
        ok: false as const,
        reason: "over_turn_limit" as const,
        message: `attempt ${attemptId} allows ${existing.turnLimit} rounds, got ${body.turns}`,
      },
      { status: 400 },
    );
  }
  if (body.trace !== undefined && body.trace.length !== body.turns) {
    return NextResponse.json(
      {
        ok: false as const,
        reason: "trace_mismatch" as const,
        message: `trace is ${body.trace.length} rounds but turns is ${body.turns}`,
      },
      { status: 400 },
    );
  }

  try {
    const res = advanceAttemptProgress({
      edition: existing.edition,
      attemptId,
      player: existing.player,
      cumulativeDamage: body.cumulativeDamage,
      turns: body.turns,
      survived: body.survived,
      trace: body.trace,
    });
    return NextResponse.json({
      ok: true as const,
      applied: res.applied,
      felled: res.felled,
      boss: {
        edition: res.edition.edition,
        totalHp: res.edition.totalHp,
        currentHp: res.edition.currentHp,
        phase: res.edition.phase,
        felled: res.edition.felledAt !== null,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // A fight still running when the pool hit 0 is a real condition, not a
    // client error — somebody else landed the last blow mid-fight.
    const felled = /was felled/.test(message);
    return NextResponse.json(
      {
        ok: false as const,
        reason: felled ? ("already_felled" as const) : ("unavailable" as const),
        message,
      },
      { status: 409 },
    );
  }
}

// Rate limit + JSON-guaranteed error envelope. See lib/server/realm-guards.ts.
export const POST = withRealmGuards("write", handleRaidProgress);
