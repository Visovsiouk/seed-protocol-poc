import "server-only";

import { NextResponse } from "next/server";

import {
  playerAttemptBalance,
  raidBar,
  raidContributors,
  raidGate,
} from "@/lib/server/raid-db";
import { withRealmGuards } from "@/lib/server/realm-guards";
import { isHexAddress } from "@/lib/validation/schemas";

/**
 * `GET /api/raid/state` — everything a client needs to render the Colophon.
 *
 * One route rather than three because the HP bar polls, and a polling client
 * that needs the gate, the pool and its own attempt balance should not make
 * three requests for them. Served from the memory cache in `raid-db.ts`
 * (invalidated on write), so a poll costs no sqlite read — which is the whole
 * reason that cache exists: `better-sqlite3` is synchronous, so N clients ×
 * poll rate of db reads would land on the thread serving SSR.
 *
 * `?player=0x…` adds that wallet's unspent attempts. Optional, because the
 * bar is public and readable before a wallet is connected. It is an unauthenticated
 * read of a balance, which is fine — the balance is not a secret, and the
 * route grants nothing.
 *
 * **Sealed reads as sealed, not as absent.** Before the gate opens the
 * response still describes the gate and its progress, because "you cannot
 * come in yet, and here is how far off it is" is a surface worth having and
 * a 404 is not.
 *
 * Read-kind guards: this shares the *read* rate-limit bucket, so polling the
 * bar can never exhaust the budget protecting the routes that sign
 * transactions.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleRaidState(req: Request) {
  const url = new URL(req.url);
  const playerParam = url.searchParams.get("player");
  if (playerParam !== null && !isHexAddress(playerParam)) {
    return NextResponse.json(
      {
        ok: false as const,
        reason: "invalid" as const,
        message: `player must be a 0x address, got ${playerParam}`,
      },
      { status: 400 },
    );
  }

  const gate = raidGate();
  const bar = raidBar();
  // Contributors are only meaningful once there is a pool to contribute to,
  // and the list is the felled edition's record — so it ships with the bar
  // rather than behind another round trip.
  const contributors = bar ? raidContributors(bar.edition) : [];

  return NextResponse.json({
    ok: true as const,
    gate,
    boss: bar,
    contributors: contributors.map((c) => ({
      player: c.player,
      damage: c.damage,
      attempts: c.attempts,
      killingBlow: c.killingBlow,
    })),
    attemptsAvailable: playerParam
      ? playerAttemptBalance(playerParam)
      : null,
  });
}

// Rate limit + JSON-guaranteed error envelope. See lib/server/realm-guards.ts.
export const GET = withRealmGuards("read", handleRaidState);
