import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { ecosystemTemplateAbi } from "@abis/generated";
import { getOwnerSigner, getPublicClient } from "@/lib/server/realm-signer";
import { fetchBossClears } from "@/lib/reads/boss-clears";
import {
  buildContributionProof,
  pickClaimRealm,
} from "@/lib/tutorial/proof";
import { listStarterRealms } from "@/lib/contracts/starter-realms";
import type { Preset } from "@/lib/engine/types";
import { addressSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `POST /api/realm/claim-seed`  — hardened.
 *
 * The route now ignores any client-supplied proof. The body shrinks to
 * `{ player }`; the server independently:
 *
 *   1. Scans `AssetMinted` events for the player across every seeded
 *      starter realm (`fetchBossClears`), filtering to the per-realm
 *      `clearReceipt` schemaId so loot / unrelated mints don't poison
 *      the proof.
 *   2. Builds the `ContributionProof` from the on-chain events using
 *      the same pure helper the client previously called.
 *   3. Picks the claim realm (latest clear), resolves the matching
 *      owner signer, and broadcasts `triggerSeedMint(player, proof)`.
 *
 * Net effect: a forged or grinding-attack body can no longer mint a
 * Seed. The only way to satisfy the contract's proof validation is to
 * have actually cleared three distinct realms whose receipts are
 * recorded on-chain by this same route's sibling (`/boss-cleared`).
 *
 * Caveat: `boss-cleared` is still client-trusted on the
 * `turns`/`finalHp` metadata fields. That gap is tracked in the
 * mint-loot/boss-cleared TODOs — but the *count* of clears (and thus
 * Seed eligibility) is on-chain truth regardless of what was in the
 * metadata, so the claim path is sound on its own terms.
 */

const bodySchema = z.object({
  player: addressSchema,
});

type Body = z.infer<typeof bodySchema>;

function reply(
  status: number,
  body:
    | { ok: true; txHash: `0x${string}`; realm: `0x${string}` }
    | { ok: false; reason: string; message: string },
) {
  return NextResponse.json(body, { status });
}

function presetForRealm(realm: `0x${string}`): Preset | undefined {
  const target = realm.toLowerCase();
  return listStarterRealms().find(
    (r) => r.realm.toLowerCase() === target,
  )?.preset;
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

  const player = body.player as `0x${string}`;

  // Server-derived events — authoritative. We deliberately *don't*
  // accept a client-supplied proof here.
  const events = await fetchBossClears(player);
  if (events.length === 0) {
    return reply(409, {
      ok: false,
      reason: "no_clears_on_chain",
      message: "no clearReceipt mints found for this player on any seeded realm",
    });
  }

  const realm = pickClaimRealm(events);
  if (!realm) {
    return reply(500, {
      ok: false,
      reason: "no_claim_realm",
      message: "fetched events but could not pick a claim realm",
    });
  }
  const preset = presetForRealm(realm);
  if (!preset) {
    return reply(500, {
      ok: false,
      reason: "unknown_realm_preset",
      message: `realm ${realm} is not in the starter-realms config — schema/config drift?`,
    });
  }

  const proof = buildContributionProof(events);

  const owner = getOwnerSigner(preset);
  const publicClient = getPublicClient();

  let hash: `0x${string}`;
  try {
    hash = await owner.wallet.writeContract({
      address: realm,
      abi: ecosystemTemplateAbi,
      functionName: "triggerSeedMint",
      args: [
        player,
        {
          metricHashes: [...proof.metricHashes],
          timestamps: [...proof.timestamps],
          eventReferences: [...proof.eventReferences],
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

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    return reply(502, {
      ok: false,
      reason: "tx_reverted",
      message: `triggerSeedMint reverted (tx ${hash})`,
    });
  }

  return reply(200, { ok: true, txHash: hash, realm });
}
