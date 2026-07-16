import "server-only";

import { NextResponse } from "next/server";

import { getPlayerRealm } from "@/lib/server/realm-db";
import { fetchRealmTierProgress } from "@/lib/reads/realm-tier";
import { getSeededSchemaIds } from "@/lib/contracts/seeded-realms";
import { isHexAddress } from "@/lib/validation/schemas";

/**
 * `GET /api/realm/[address]/meta`
 *
 * Public lookup. Returns the registered player-realm metadata for
 * `address` (preset, bossId, name, maxTier, owner). 404 if the realm
 * is unknown to the sqlite store — that includes legacy realms created
 * before registration, which fall through to trial mode on the play route.
 *
 * NOT a security boundary — this is purely for UI rendering. Callers
 * MUST NOT trust `owner` for any authorization decision; the on-chain
 * `owner()` is the source of truth (used in `/api/realm/mint-loot` and
 * dashboards).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  if (!isHexAddress(address)) {
    return NextResponse.json(
      { ok: false as const, reason: "invalid", message: "not an address" },
      { status: 400 },
    );
  }
  const row = getPlayerRealm(address.toLowerCase() as `0x${string}`);
  if (!row) {
    return NextResponse.json(
      { ok: false as const, reason: "not_found", message: "realm not registered" },
      { status: 404 },
    );
  }
  // Player realms register their OWN clearReceipt+loot schema pair on their
  // clone (commit c90af90), so prefer the row's ids; the seeded pair is only
  // a fallback for realms created before per-realm registration landed.
  const seeded = getSeededSchemaIds(row.preset);
  const lootSchemaId = row.lootSchemaId ? BigInt(row.lootSchemaId) : seeded.loot;
  const clearReceiptSchemaId = row.clearReceiptSchemaId
    ? BigInt(row.clearReceiptSchemaId)
    : seeded.clearReceipt;

  // Tier is earned per-realm from the on-chain distinct-clearer count.
  const { maxTier, distinctClearers, nextTierAt } =
    await fetchRealmTierProgress({ realm: row.address, clearReceiptSchemaId });

  return NextResponse.json({
    ok: true as const,
    realm: {
      address: row.address,
      owner: row.owner,
      preset: row.preset,
      bossId: row.bossId,
      name: row.name,
      accent: row.accent,
      maxTier,
      distinctClearers,
      nextTierAt,
      createdAt: row.createdAt,
      // Strings — JSON cannot represent bigint. Consumers must BigInt() these.
      lootSchemaId: lootSchemaId.toString(),
      clearReceiptSchemaId: clearReceiptSchemaId.toString(),
    },
  });
}
