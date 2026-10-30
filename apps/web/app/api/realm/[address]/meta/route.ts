import "server-only";

import { NextResponse } from "next/server";

import { getPlayerRealm } from "@/lib/server/realm-db";
import { fetchRealmTierProgress } from "@/lib/reads/realm-tier";
import { getSeededSchemaIds } from "@/lib/contracts/seeded-realms";
import { realmPageFallback } from "@/lib/story/page-bank";
import { isHexAddress } from "@/lib/validation/schemas";
import { withRealmGuards } from "@/lib/server/realm-guards";

/**
 * `GET /api/realm/[address]/meta`
 *
 * Public lookup. Returns the registered player-realm metadata for
 * `address` (preset, bossId, name, maxTier, owner, lore). 404 if the realm
 * is unknown to the sqlite store — that includes legacy realms created
 * before registration, which fall through to trial mode on the play route.
 *
 * `lore` is never null: a realm with no generated row resolves to the
 * deterministic bank, so no client holds an opinion about absent prose.
 *
 * NOT a security boundary — this is purely for UI rendering. Callers
 * MUST NOT trust `owner` for any authorization decision; the on-chain
 * `owner()` is the source of truth (used in `/api/realm/mint-loot` and
 * dashboards).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleMeta(
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

  // Lore is always resolved here rather than passed through as nullable, so no
  // client ever has to decide what an absent page reads like — a realm with no
  // generated row gets the deterministic bank, which is the shipped default.
  // Lives on the existing meta endpoint on purpose: it is read on exactly the
  // paths that already fetch this (the play route, the realm detail page), and
  // a second endpoint would be a second round-trip for four strings.
  const lore =
    row.lore ??
    realmPageFallback({
      realm: row.address,
      name: row.name,
      preset: row.preset,
      bossId: row.bossId,
    });

  return NextResponse.json({
    ok: true as const,
    realm: {
      address: row.address,
      owner: row.owner,
      preset: row.preset,
      bossId: row.bossId,
      name: row.name,
      accent: row.accent,
      lore,
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

// Rate limit + JSON-guaranteed error envelope. See lib/server/realm-guards.ts.
export const GET = withRealmGuards("read", handleMeta);
