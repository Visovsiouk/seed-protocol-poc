import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { ecosystemTemplateAbi } from "@abis/generated";
import {
  derivePlayerRealmSignerAddress,
  getPublicClient,
} from "@/lib/server/realm-signer";
import {
  getNextSignerIndex,
  getPlayerRealm,
  insertPlayerRealm,
} from "@/lib/server/realm-db";
import { getFlavorBank } from "@/lib/flavor";
import type { Preset, Tier } from "@/lib/engine/types";

/**
 * `POST /api/realm/register`
 *
 * Final step of the `/create` flow. After the player:
 *   1. Signs `EcosystemFactory.createEcosystem()` — becomes `owner()` of
 *      the new clone (royalty + dashboard rights are pinned here, via
 *      `UniversalAsset.mintedBy`).
 *   2. Signs `EcosystemTemplate.setMinter(derivedAddr, true)` — authorizes
 *      a server-held delegate to call `mintAsset(onlyOwnerOrMinter)` on
 *      this realm. The delegate has no other powers (royalty stays with
 *      `owner()`).
 *   3. POSTs here with the realm's chosen preset/boss/name metadata.
 *
 * This route verifies BOTH on-chain conditions before persisting:
 *   - The realm's `owner()` matches the claimed `owner` (no spoofing).
 *   - The realm's `minters(derivedAddr)` is `true` (no half-authorized
 *     rows that would have the server signing mints without permission).
 *
 * Then it inserts the row. `signer_index` is `UNIQUE`, so two concurrent
 * creates racing on the same index get a 409.
 *
 * IMPORTANT: the signer index in the body is advisory — we re-derive
 * from the just-claimed slot. If a race occurred between `next-signer`
 * and this insert, the client's `setMinter` call authorized a stale
 * address. We catch that here (the on-chain minters check will fail for
 * the *new* derived address) and reply 409 with the corrected index so
 * the client can re-sign.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "expected 0x-prefixed 20-byte address");
const presetSchema = z.enum(["fantasy", "scifi", "cyberpunk"]);

const bodySchema = z.object({
  realmAddress: addressSchema,
  owner: addressSchema,
  preset: presetSchema,
  bossId: z.string().min(1).max(64),
  name: z.string().min(1).max(64),
});

type Body = z.infer<typeof bodySchema>;

type ReplyOk = {
  ok: true;
  realm: {
    address: `0x${string}`;
    owner: `0x${string}`;
    preset: Preset;
    bossId: string;
    name: string;
    signerIndex: number;
    signerAddress: `0x${string}`;
    maxTier: Tier;
  };
};

type ReplyErr = {
  ok: false;
  reason:
    | "invalid"
    | "already_registered"
    | "boss_unknown"
    | "owner_mismatch"
    | "not_authorized"
    | "race"
    | "internal";
  message: string;
  /** Populated for `reason: "race"` so the client can re-sign. */
  retryWith?: { signerIndex: number; signerAddress: `0x${string}` };
};

function reply(status: number, body: ReplyOk | ReplyErr) {
  return NextResponse.json(body, { status });
}

const STARTER_PLAYER_REALM_MAX_TIER: Tier = 2;

export async function POST(req: Request) {
  let body: Body;
  try {
    body = bodySchema.parse(await req.json());
  } catch (e) {
    return reply(400, {
      ok: false,
      reason: "invalid",
      message: e instanceof Error ? e.message : "Bad request body",
    });
  }

  const realmAddress = body.realmAddress.toLowerCase() as `0x${string}`;
  const claimedOwner = body.owner.toLowerCase() as `0x${string}`;

  // Idempotency: re-registration of the same realm is a 409, not a
  // silent no-op. Clients that hit this should treat it as success
  // (their realm is already registered) but we surface it so a
  // misbehaving UI can be caught.
  const existing = getPlayerRealm(realmAddress);
  if (existing) {
    return reply(409, {
      ok: false,
      reason: "already_registered",
      message: `realm ${realmAddress} is already registered`,
    });
  }

  // The boss must exist in the chosen preset's flavor bank. Otherwise
  // the play route would 500 trying to find a non-existent boss def.
  const bank = getFlavorBank(body.preset);
  if (!bank.bosses[body.bossId as keyof typeof bank.bosses]) {
    return reply(422, {
      ok: false,
      reason: "boss_unknown",
      message: `bossId "${body.bossId}" not present in ${body.preset} flavor bank`,
    });
  }

  const publicClient = getPublicClient();

  // Reserve the next free signer index. The UNIQUE constraint is the
  // serialization point — derive the address from this index and verify
  // it on-chain before we insert.
  const signerIndex = getNextSignerIndex();
  const signerAddress = derivePlayerRealmSignerAddress(signerIndex);

  let onchainOwner: `0x${string}`;
  let isMinter: boolean;
  try {
    [onchainOwner, isMinter] = await Promise.all([
      publicClient.readContract({
        address: realmAddress,
        abi: ecosystemTemplateAbi,
        functionName: "owner",
      }) as Promise<`0x${string}`>,
      publicClient.readContract({
        address: realmAddress,
        abi: ecosystemTemplateAbi,
        functionName: "minters",
        args: [signerAddress],
      }) as Promise<boolean>,
    ]);
  } catch (e) {
    return reply(502, {
      ok: false,
      reason: "internal",
      message: `failed to read realm state: ${e instanceof Error ? e.message : String(e)}`,
    });
  }

  if (onchainOwner.toLowerCase() !== claimedOwner) {
    return reply(403, {
      ok: false,
      reason: "owner_mismatch",
      message: `realm owner() is ${onchainOwner}, body claims ${claimedOwner}`,
    });
  }

  if (!isMinter) {
    // Two paths into this branch:
    //   (a) The player never signed setMinter — UI bug or malicious POST.
    //   (b) A concurrent /create raced ahead and grabbed the same index,
    //       so the player authorized the OLD derived address. Surface
    //       the new index in `retryWith` so the client can re-sign for
    //       the new slot. The next call to `getNextSignerIndex()`
    //       after the winner inserts will return the next slot.
    const nextIndex = getNextSignerIndex();
    return reply(409, {
      ok: false,
      reason: nextIndex === signerIndex ? "not_authorized" : "race",
      message:
        nextIndex === signerIndex
          ? `minters[${signerAddress}] is false — sign setMinter first`
          : `signer index ${signerIndex} was claimed by another realm; re-sign for ${nextIndex}`,
      retryWith:
        nextIndex !== signerIndex
          ? {
              signerIndex: nextIndex,
              signerAddress: derivePlayerRealmSignerAddress(nextIndex),
            }
          : undefined,
    });
  }

  let row;
  try {
    row = insertPlayerRealm({
      address: realmAddress,
      owner: claimedOwner,
      preset: body.preset,
      bossId: body.bossId,
      name: body.name,
      signerIndex,
      maxTier: STARTER_PLAYER_REALM_MAX_TIER,
    });
  } catch (e) {
    // SQLite UNIQUE violation surfaces here as a generic Error with
    // "UNIQUE constraint failed" in the message. Treat as race.
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE constraint failed")) {
      const nextIndex = getNextSignerIndex();
      return reply(409, {
        ok: false,
        reason: "race",
        message: `signer index ${signerIndex} taken; retry with ${nextIndex}`,
        retryWith: {
          signerIndex: nextIndex,
          signerAddress: derivePlayerRealmSignerAddress(nextIndex),
        },
      });
    }
    return reply(500, { ok: false, reason: "internal", message: msg });
  }

  return reply(200, {
    ok: true,
    realm: {
      address: row.address,
      owner: row.owner,
      preset: row.preset,
      bossId: row.bossId,
      name: row.name,
      signerIndex: row.signerIndex,
      signerAddress,
      maxTier: row.maxTier,
    },
  });
}
