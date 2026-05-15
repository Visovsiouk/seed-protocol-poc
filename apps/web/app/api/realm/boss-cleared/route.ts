import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { ecosystemTemplateAbi } from "@abis/generated";
import { getOwnerSigner, getPublicClient } from "@/lib/server/realm-signer";
import {
  getSeededRealm,
  getSeededSchemaIds,
} from "@/lib/contracts/seeded-realms";
import {
  buildClearReceiptMetadataURI,
  deriveClearReceiptTokenId,
} from "@/lib/contracts/clear-receipt-derive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `POST /api/realm/boss-cleared`
 *
 * Realm-owner mint surface for the clearReceipt schema.
 * Fires when the engine emits a `BossCleared` event on the client; the
 * server re-derives the deterministic tokenId from the run-binding
 * inputs and signs `mintAsset` from the realm-owner key.
 *
 * Authorization: same shape as `/api/realm/mint-loot` — the route *is*
 * the authorization (realm owner is the only signer who can call
 * `mintAsset`, and we're it). will replace this with
 * a player-callable wrapper that verifies the receipt against an
 * on-chain run-seed commitment.
 *
 * Deterministic tokenId derivation (realm, runSeed, player, bossId)
 * means re-submitting the same body is idempotent.
 *
 * Hardening — current state:
 *
 *   - The owner-only mint surface means a forged POST still has to go
 *     through this route; the player can't call `mintAsset` directly.
 *   - The schema gates the asset under `clearReceipt`, so a fake call
 *     can only mint a clearReceipt asset (not loot, not a phantom
 *     SBT).
 *   - The Seed-claim path (`/api/realm/claim-seed`) rebuilds the proof
 *     entirely from on-chain truth — so even if `turns`/`finalHp` are
 *     fudged here, the count-of-distinct-realms eligibility check
 *     stays anchored to whether receipts actually exist on each realm.
 *
 * Residual gap — replay-from-runSeed verification, symmetric with the
 * mint-loot residual:
 *   1. Body shrinks to `(runSeed, choiceTrace, equipTrace)`.
 *   2. Server replays `startRun → step → step …` from `runSeed` and
 *      asserts a `BossCleared` event landed at the final step.
 *   3. Server uses the *server-derived* `turns`/`finalHp` for metadata.
 *
 * Deferred to the next hardening pass — needs the same client-side
 * choice/equip trace plumbing as mint-loot.
 */

const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "expected 0x-prefixed 32-byte hex");
const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "expected 0x-prefixed 20-byte address");

const presetSchema = z.enum(["fantasy", "scifi", "cyberpunk"]);

const bodySchema = z.object({
  preset: presetSchema,
  player: addressSchema,
  runSeed: hex32,
  bossId: z.string().min(1).max(64),
  // turns must be >= 1 (a real clear consumes at least one round).
  // finalHp can legitimately be 0: per combat.ts thorns reflect even
  // when the player's incoming hit drops them to 0, so the monster can
  // die the same turn the player does. These don't *prove* a real
  // clear — see hardening docblock — but they reject the most obviously
  // synthetic bodies.
  turns: z.number().int().min(1).max(10_000),
  finalHp: z.number().int().min(0).max(10_000),
  realmLabel: z.string().min(1).max(64),
});

type Body = z.infer<typeof bodySchema>;

function reply(
  status: number,
  body:
    | { ok: true; tokenId: string; txHash: `0x${string}` }
    | { ok: false; reason: string; message: string },
) {
  return NextResponse.json(body, { status });
}

export async function POST(req: Request) {
  let body: Body;
  try {
    const raw = await req.json();
    body = bodySchema.parse(raw);
  } catch (e) {
    return reply(400, {
      ok: false,
      reason: "invalid",
      message: e instanceof Error ? e.message : "Bad request body",
    });
  }

  const realm = getSeededRealm(body.preset);
  if (realm === "0x0000000000000000000000000000000000000000") {
    return reply(409, {
      ok: false,
      reason: "realm_not_seeded",
      message: `${body.preset} realm has not been seeded on the active chain — run \`pnpm seed\``,
    });
  }

  // clearReceipt schemaId is per-realm (the seeder registers each
  // realm's pair independently). The schema id we want here is the
  // one resolved against the realm we're minting from.
  const seededIds = getSeededSchemaIds(body.preset);
  if (seededIds.clearReceipt === 0n) {
    return reply(409, {
      ok: false,
      reason: "schema_not_seeded",
      message: `clearReceipt schema not registered on ${body.preset} realm`,
    });
  }

  const player = body.player as `0x${string}`;
  const runSeed = body.runSeed as `0x${string}`;

  const tokenId = deriveClearReceiptTokenId({
    realm,
    player,
    runSeed,
    bossId: body.bossId,
  });

  // Block timestamp would be more accurate, but pulling it here would
  // double the RPC round-trips before the mint. We pin `clearedAt` to
  // server epoch-seconds — the canonical record is still the on-chain
  // mint tx, which carries its own block timestamp.
  const clearedAt = Math.floor(Date.now() / 1000);

  const metadataURI = buildClearReceiptMetadataURI({
    preset: body.preset,
    realmLabel: body.realmLabel,
    player,
    bossId: body.bossId,
    runSeed,
    turns: body.turns,
    finalHp: body.finalHp,
    clearedAt,
  });

  // clearReceipt has no tier semantics; we use tier 0 (T1 in SeedTypes'
  // 0-indexed enum) as a neutral default.
  const onchainTier = 0;

  const owner = getOwnerSigner(body.preset);
  const publicClient = getPublicClient();

  let hash: `0x${string}`;
  try {
    hash = await owner.wallet.writeContract({
      address: realm,
      abi: ecosystemTemplateAbi,
      functionName: "mintAsset",
      args: [
        player,
        tokenId,
        1n,
        {
          tier: onchainTier,
          extensionSchemaId: seededIds.clearReceipt,
          metadataURI,
        },
      ],
      account: owner.account,
      chain: owner.wallet.chain,
    });
  } catch (e) {
    return reply(500, {
      ok: false,
      reason: "tx_failed",
      message: e instanceof Error ? e.message : String(e),
    });
  }

  let receiptStatus: "success" | "reverted";
  try {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    receiptStatus = receipt.status;
  } catch (e) {
    // RPC timeout / network drop while waiting for the receipt. The tx
    // was already broadcast (we have `hash`) — surface it so the client
    // can decide whether to retry. An unhandled throw here yields an
    // empty 500 body that crashes the client's `res.json()` parse.
    return reply(504, {
      ok: false,
      reason: "receipt_timeout",
      message: `waitForTransactionReceipt failed for tx ${hash}: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
  if (receiptStatus !== "success") {
    return reply(502, {
      ok: false,
      reason: "tx_reverted",
      message: `mintAsset reverted (tx ${hash})`,
    });
  }

  return reply(200, { ok: true, tokenId: tokenId.toString(), txHash: hash });
}
