import "server-only";

import { NextResponse } from "next/server";

import {
  playerAttemptBalance,
  raidBar,
  raidContributors,
  raidGate,
  raidEditions,
  raidReceipts,
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

  /**
   * Which edition's record to return. Defaults to the current one, but is
   * addressable — because the record of a *felled* edition is the thing
   * editions exist for, and tying it to "current" meant edition 1's kill
   * disappeared from the surface the moment edition 2 opened. The bar
   * always describes the current edition regardless; only the record below
   * it moves.
   */
  const editionParam = url.searchParams.get("edition");
  let recordEdition = bar?.edition ?? null;
  if (editionParam !== null) {
    const parsed = Number(editionParam);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return NextResponse.json(
        {
          ok: false as const,
          reason: "invalid" as const,
          message: `edition must be a positive integer, got ${editionParam}`,
        },
        { status: 400 },
      );
    }
    recordEdition = parsed;
  }

  const contributors = recordEdition ? raidContributors(recordEdition) : [];

  // Reported with their mint state rather than filtered to the minted ones:
  // "owed, not yet paid" is a real state the surface should show honestly
  // instead of implying nobody was credited. Empty for a standing edition,
  // because receipts are owed only once he has fallen.
  const receipts = recordEdition
    ? raidReceipts(recordEdition).map((r) => ({
        player: r.player,
        damage: r.damage,
        shareBps: r.shareBps,
        attempts: r.attempts,
        killingBlow: r.killingBlow,
        minted: r.txHash !== null,
      }))
    : [];

  // The record of felled editions is itself a surface — the point of
  // editions is that each kill stays permanent and dated rather than being
  // replaced by the next one. Cheap enough to ship with every poll: it is
  // one short table and grows by one row per kill.
  const editions = raidEditions().map((e) => ({
    edition: e.edition,
    totalHp: e.totalHp,
    currentHp: e.currentHp,
    felledAt: e.felledAt,
    openedAt: e.openedAt,
  }));

  return NextResponse.json({
    ok: true as const,
    gate,
    boss: bar,
    editions,
    recordEdition,
    contributors: contributors.map((c) => ({
      player: c.player,
      damage: c.damage,
      attempts: c.attempts,
      killingBlow: c.killingBlow,
    })),
    receipts,
    attemptsAvailable: playerParam
      ? playerAttemptBalance(playerParam)
      : null,
  });
}

// Rate limit + JSON-guaranteed error envelope. See lib/server/realm-guards.ts.
export const GET = withRealmGuards("read", handleRaidState);
