import "server-only";

import { NextResponse } from "next/server";

import { listPlayerRealms } from "@/lib/server/realm-db";
import { fetchRealmTierProgress } from "@/lib/reads/realm-tier";
import { getSeededSchemaIds } from "@/lib/contracts/seeded-realms";

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
  // Tier is earned per-realm from each realm's on-chain distinct-clearer
  // count, so this fans out one scan per realm. The scan is memoized
  // per-realm (see lib/reads/realm-tier.ts), keeping bursts cheap.
  const realms = await Promise.all(
    rows.map(async (r) => {
      const seeded = getSeededSchemaIds(r.preset);
      const clearReceiptSchemaId = r.clearReceiptSchemaId
        ? BigInt(r.clearReceiptSchemaId)
        : seeded.clearReceipt;
      const { maxTier, distinctClearers, nextTierAt, totalMints } =
        await fetchRealmTierProgress({
          realm: r.address,
          clearReceiptSchemaId,
        });
      return {
        address: r.address,
        owner: r.owner,
        preset: r.preset,
        bossId: r.bossId,
        name: r.name,
        accent: r.accent,
        maxTier,
        distinctClearers,
        nextTierAt,
        totalMints,
        createdAt: r.createdAt,
      };
    }),
  );
  return NextResponse.json({ ok: true as const, realms });
}
