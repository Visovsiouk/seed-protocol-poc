import "server-only";

import { NextResponse } from "next/server";

import { listPlayerRealms } from "@/lib/server/realm-db";

/**
 * `GET /api/realm/list`
 *
 * Public, read-only. Returns every row in the player-realm sqlite
 * store so the landing-page selector can surface real preset / boss /
 * name for creator-deployed realms. NOT a security boundary — the
 * server still re-verifies on-chain `owner()` + `minters[...]` before
 * signing any mint.
 *
 * Returned shape mirrors `/api/realm/[address]/meta` so callers can
 * index by `address` and reuse the same per-realm type.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = listPlayerRealms();
  return NextResponse.json({
    ok: true as const,
    realms: rows.map((r) => ({
      address: r.address,
      owner: r.owner,
      preset: r.preset,
      bossId: r.bossId,
      name: r.name,
      accent: r.accent,
      maxTier: r.maxTier,
      createdAt: r.createdAt,
    })),
  });
}
