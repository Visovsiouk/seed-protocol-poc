import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { ecosystemTemplateAbi } from "@abis/generated";
import {
  getOwnerSigner,
  getPlayerRealmSigner,
  getPublicClient,
} from "@/lib/server/realm-signer";
import {
  getSeededRealm,
  getSeededSchemaIds,
} from "@/lib/contracts/seeded-realms";
import { getPlayerRealm } from "@/lib/server/realm-db";
import {
  buildLootMetadataURI,
  deriveLootTokenId,
} from "@/lib/contracts/loot-derive";
import { validateLootRoll } from "@/lib/engine/loot-validate";
import { BOSS_DEPTH } from "@/lib/engine";
import type { LootRoll, Preset, Tier } from "@/lib/engine/types";

/**
 * Per-preset starter-realm tier ceiling. Player-authored realms carry
 * their own `maxTier` in the sqlite row (`player_realms.max_tier`);
 * starter realms are pinned to T2 to preserve the seed-liquidity floor
 * (tutorial gear stays bounded so the bank doesn't flood with T3+).
 * Honest clients respect the cap; tampered clients are rejected here
 * before `mintAsset` is signed.
 */
const STARTER_REALM_MAX_TIER: Record<Preset, Tier> = {
  fantasy: 2,
  scifi: 2,
  cyberpunk: 2,
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `POST /api/realm/mint-loot`
 *
 * Realm-owner mint surface. The player commits a roll
 * client-side; the server re-derives the deterministic tokenId from the
 * same inputs, builds the metadata URI, and signs `mintAsset` from the
 * realm-owner key.
 *
 * Authorization model: this endpoint *is* the authorization — the realm
 * owner is the only signer who can call `mintAsset(onlyOwner)`, and
 * we're it. A full build would replace this with a
 * player-callable wrapper that verifies the roll against an on-chain
 * run-seed commitment; until that ships, the server trusts the body and
 * mints on the player's behalf.
 *
 * Deterministic tokenId derivation means re-submitting the same body is
 * idempotent against `UniversalAsset.create` — the chain will either
 * mint or no-op, but the player can't conjure duplicates by retrying.
 *
 * Hardening — current state:
 *
 *   - `validateLootRoll` (catalog-bounds check) rejects internally-
 *     inconsistent rolls: tier/stat mismatches, out-of-range catalog
 *     values, slot/effect violations, and tier-vs-difficulty drops
 *     (T5 at depth 1, etc).
 *
 *   - The runSeed is pinned to a blockhash (lib/contracts/run-seed.ts)
 *     so the player can't grind the seed.
 *
 * Residual gap — full replay-from-runSeed verification is still TODO:
 *   1. Body shrinks to `(runSeed, depth, choiceTrace, equipTrace)`.
 *   2. Server replays `startRun → step → step …` from `runSeed`,
 *      consuming the trace, until the LootDropped event lands at the
 *      requested depth.
 *   3. Server uses the *server-derived* LootRoll for tokenId + metadata.
 *
 * The replay path needs the client to maintain and ship an ordered
 * action+equip trace, which is a non-trivial UI/state change deferred
 * to the next hardening pass. The bounds check above closes the worst
 * "POST a T5 lifesteal=99 weapon" exploit; a determined attacker who
 * picks bound-consistent values still slips through.
 */

const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "expected 0x-prefixed 32-byte hex");
const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "expected 0x-prefixed 20-byte address");
const bigintString = z.string().regex(/^[0-9]+$/, "expected decimal bigint string");

const presetSchema = z.enum(["fantasy", "scifi", "cyberpunk"]);
const slotSchema = z.enum(["weapon", "armor", "accessory"]);
const damageDieSchema = z.union([
  z.literal(4),
  z.literal(6),
  z.literal(8),
  z.literal(10),
  z.literal(12),
]);
const elementSchema = z.enum(["none", "fire", "ice", "shock", "holy", "unholy"]);

const catalogEffectSchema = z.object({
  name: z.enum([
    "lifesteal",
    "armor_pierce",
    "crit_chance",
    "multi_hit",
    "bleed",
    "regen",
    "thorns",
    "dodge_chance",
    "damage_reduction",
  ]),
  value: z.number(),
});

const lootRollSchema = z.object({
  tier: z.number().int().min(1).max(5),
  slot: slotSchema,
  schemaId: z.number().int().nonnegative(),
  damageDie: damageDieSchema.optional(),
  attackBonus: z.number().optional(),
  damageBonus: z.number().optional(),
  acBonus: z.number().optional(),
  hpBonus: z.number().optional(),
  element: elementSchema.optional(),
  resistElement: elementSchema.optional(),
  catalogEffects: z.array(catalogEffectSchema),
  /** Wire form: decimal string (uint256). */
  nameSeed: bigintString,
  extraFields: z.record(z.union([z.string(), z.number(), z.boolean()])),
});

const bodySchema = z.object({
  preset: presetSchema,
  recipient: addressSchema,
  runSeed: hex32,
  depth: z.number().int().min(1).max(1024),
  loot: lootRollSchema,
  realmLabel: z.string().min(1).max(64),
  assembledName: z.string().min(1).max(128),
  /**
   * Optional. When present and the address matches a row in
   * `player_realms`, the route signs `mintAsset` from the realm's
   * delegate (HD index from the sqlite row) and validates against
   * the row's `maxTier`. When absent, falls back to the starter
   * realm for `preset`, signed by the static `getOwnerSigner`.
   */
  realmAddress: addressSchema.optional(),
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

  // Route to player-realm path if the caller supplied a realmAddress
  // that matches a row in sqlite. Otherwise fall through to the static
  // starter path keyed on `preset`. We resolve the per-realm signer +
  // schema ids + maxTier cap up here so the validate/sign branches
  // below stay flavor-agnostic.
  const playerRow = body.realmAddress
    ? getPlayerRealm(body.realmAddress.toLowerCase() as `0x${string}`)
    : undefined;

  // Sanity: if the player supplied a realmAddress that *isn't* in
  // sqlite, refuse rather than silently fall through to the starter
  // realm. A play session that thought it was minting to realm X
  // would otherwise quietly mint to the starter realm of preset Y.
  if (body.realmAddress && !playerRow) {
    // Allowance: the starter address for `body.preset` is its own
    // realmAddress — accept that as the starter path.
    const seededStarter = getSeededRealm(body.preset);
    if (
      seededStarter.toLowerCase() !== body.realmAddress.toLowerCase()
    ) {
      return reply(404, {
        ok: false,
        reason: "realm_unknown",
        message: `realmAddress ${body.realmAddress} is not a registered player realm and is not the starter for ${body.preset}`,
      });
    }
  }

  // The on-chain `extensionSchemaId` is per-realm and per-flavor;
  // starter realms have their pair recorded in `.seeded-realms.json`,
  // while player realms inherit the starter schema for their preset
  // (the seeder is the only `registerSchema` caller; player realms
  // call into the same factory + share the global SchemaRegistry).
  const effectivePreset: Preset = playerRow ? playerRow.preset : body.preset;
  const realm: `0x${string}` = playerRow
    ? playerRow.address
    : getSeededRealm(body.preset);
  if (realm === "0x0000000000000000000000000000000000000000") {
    return reply(409, {
      ok: false,
      reason: "realm_not_seeded",
      message: `${body.preset} realm has not been seeded on the active chain — run \`pnpm seed\``,
    });
  }

  // Schema ids are keyed off the *flavor* preset (player realms
  // mirror the starter's flavor for schema purposes — they don't
  // register new schemas).
  const seededIds = getSeededSchemaIds(effectivePreset);
  if (seededIds.loot === 0n) {
    return reply(409, {
      ok: false,
      reason: "schema_not_seeded",
      message: `loot schema not registered on ${effectivePreset} realm`,
    });
  }

  const maxTier: Tier = playerRow
    ? playerRow.maxTier
    : STARTER_REALM_MAX_TIER[body.preset];

  // Reconstruct the LootRoll shape the helpers expect (LootRoll's
  // `nameSeed` is bigint internally; we serialize it as decimal string
  // over the wire). Tier is widened to `number` by Zod's `.min(1).max(5)`
  // — narrow it back to the `Tier` union with a cast: the schema
  // already enforces the range at runtime.
  const loot: LootRoll = {
    ...body.loot,
    tier: body.loot.tier as Tier,
    nameSeed: BigInt(body.loot.nameSeed),
  };

  // Catalog-bounds check (see hardening docblock above). Rejects forged
  // rolls before any chain interaction. `isBoss` is true at BOSS_DEPTH+,
  // matching the engine's `difficultyFor` logic.
  const validationErr = validateLootRoll(
    loot,
    body.depth,
    body.depth >= BOSS_DEPTH,
    maxTier,
    effectivePreset,
  );
  if (validationErr) {
    return reply(422, {
      ok: false,
      reason: "loot_bounds_violation",
      message: validationErr,
    });
  }

  const tokenId = deriveLootTokenId({
    realm,
    runSeed: body.runSeed as `0x${string}`,
    depth: body.depth,
    nameSeed: loot.nameSeed,
  });

  const metadataURI = buildLootMetadataURI({
    loot,
    preset: effectivePreset,
    realmLabel: body.realmLabel,
    assembledName: body.assembledName,
  });

  // SeedTypes.Tier is a 0-indexed uint8 enum on-chain; engine surface is 1..5.
  const onchainTier = Math.max(0, loot.tier - 1);

  // Player realms sign via the delegate the player authorized in
  // `setMinter(...)` — the realm's `owner()` is the player's wallet
  // (offline at play time). Starter realms still sign via the
  // statically-known `getOwnerSigner`.
  const signer = playerRow
    ? getPlayerRealmSigner(playerRow.signerIndex)
    : getOwnerSigner(body.preset);
  const publicClient = getPublicClient();

  let hash: `0x${string}`;
  try {
    hash = await signer.wallet.writeContract({
      address: realm,
      abi: ecosystemTemplateAbi,
      functionName: "mintAsset",
      args: [
        body.recipient as `0x${string}`,
        tokenId,
        1n,
        {
          tier: onchainTier,
          extensionSchemaId: seededIds.loot,
          metadataURI,
        },
      ],
      account: signer.account,
      chain: signer.wallet.chain,
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
