import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { ecosystemTemplateAbi, universalAssetAbi } from "@abis/generated";
import { getAddress } from "@/lib/contracts/addresses";
import {
  getOwnerSigner,
  getPlayerRealmSigner,
  getPublicClient,
} from "@/lib/server/realm-signer";
import { withSignerLock } from "@/lib/server/signer-nonce-lock";
import { withRealmGuards } from "@/lib/server/realm-guards";
import {
  getSeededRealm,
  getSeededSchemaIds,
} from "@/lib/contracts/seeded-realms";
import { getPlayerRealm } from "@/lib/server/realm-db";
import {
  countDistinctClearers,
  playerRealmMaxTier,
} from "@/lib/reads/realm-tier";
import {
  buildLootMetadataURI,
  deriveLootTokenId,
} from "@/lib/contracts/loot-derive";
import { validateLootRoll } from "@/lib/engine/loot-validate";
import { BOSS_DEPTH } from "@/lib/engine";
import type { LootRoll, Preset, Tier } from "@/lib/engine/types";
import { elementsFor } from "@/lib/engine/types";
import { getCatalogEffectsForSlot } from "@/lib/contracts/catalog-effects";
import {
  addressSchema,
  bigintString,
  hex32,
  presetSchema,
} from "@/lib/validation/schemas";

/**
 * Per-preset starter-realm tier ceiling. Player-authored realms earn their
 * ceiling per-realm from the on-chain distinct-clearer count (see
 * `playerRealmMaxTier` in lib/reads/realm-tier.ts); starter realms are
 * pinned to T2 to preserve the seed-liquidity floor (tutorial gear stays
 * bounded so the bank doesn't flood with T3+). Honest clients respect the
 * cap; tampered clients are rejected here before `mintAsset` is signed.
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
 * Idempotency: the tokenId is derived deterministically from
 * `(realm, runSeed, depth, nameSeed)`, so a replay of the same body targets
 * the same tokenId. That alone does NOT make the mint idempotent —
 * `mintAsset` is an ERC-1155 mint of amount 1, so a replay *adds* a second
 * copy rather than no-op'ing. (An earlier version of this comment claimed
 * the chain would no-op; it does not. Verified against anvil: replaying one
 * body drove `balanceOf` 4 → 7.) Replay is therefore blocked here, by the
 * `balanceOf` probe below — the same guard `/api/realm/boss-cleared` uses.
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

const slotSchema = z.enum(["weapon", "armor", "accessory"]);
const damageDieSchema = z.union([
  z.literal(4),
  z.literal(6),
  z.literal(8),
  z.literal(10),
  z.literal(12),
]);
// Union of every preset's element vocabulary. Per-preset enforcement
// happens in the body-level refinement below (a fantasy mint must
// carry a fantasy element, etc.) — the enum just rejects strings that
// aren't a vocabulary entry in *any* preset.
const elementSchema = z.enum([
  "none",
  // fantasy
  "fire",
  "ice",
  "shock",
  "holy",
  "unholy",
  // sci-fi
  "plasma",
  "cryo",
  "ion",
  "photon",
  "void",
  // cyberpunk
  "incendiary",
  "cryogenic",
  "emp",
  "laser",
  "nano",
]);

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
  // Archetype lane. Weapon-slot rolls carry a `weaponType`, armor-slot an
  // `armorType` (loose preset-vocab strings; see `WeaponType`/`ArmorType`).
  // These must survive the wire round-trip so `buildLootMetadataURI` can
  // stamp the `weapon_type`/`armor_type` attribute — otherwise minted loot
  // reads back without an archetype and the card falls back to "weapon"/
  // "armor" in the inventory (only un-minted in-memory rolls show it).
  weaponType: z.string().optional(),
  armorType: z.string().optional(),
  catalogEffects: z.array(catalogEffectSchema),
  /** Wire form: decimal string (uint256). */
  nameSeed: bigintString,
  extraFields: z.record(z.union([z.string(), z.number(), z.boolean()])),
});

const bodySchema = z
  .object({
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
  })
  // Per-preset element guard. The enum above accepts every vocabulary
  // so a same-call mismatch (preset=fantasy + element=incendiary) was
  // historically masked; refine here so the rejection is explicit and
  // surfaces a useful error rather than the generic enum failure.
  .superRefine((body, ctx) => {
    const pool = new Set(elementsFor(body.preset));
    if (body.loot.element && !pool.has(body.loot.element)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["loot", "element"],
        message: `element "${body.loot.element}" is not native to preset "${body.preset}"`,
      });
    }
    if (body.loot.resistElement && !pool.has(body.loot.resistElement)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["loot", "resistElement"],
        message: `resistElement "${body.loot.resistElement}" is not native to preset "${body.preset}"`,
      });
    }
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

async function handleMintLoot(req: Request) {
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

  // The on-chain `extensionSchemaId` is per-realm. Player realms
  // registered after per-realm schemas landed carry their OWN loot
  // schema id (verified at register time); older rows and starter realms
  // fall back to the seeded pair recorded in `generated/realms.json`,
  // keyed off the flavor preset.
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

  const ownLootId = playerRow?.lootSchemaId
    ? BigInt(playerRow.lootSchemaId)
    : null;
  const seededIds = getSeededSchemaIds(effectivePreset);
  const lootSchemaId = ownLootId ?? seededIds.loot;
  if (lootSchemaId === 0n) {
    return reply(409, {
      ok: false,
      reason: "schema_not_seeded",
      message: `loot schema not registered on ${effectivePreset} realm`,
    });
  }

  // Player realms earn their loot ceiling from how many distinct wallets
  // have cleared them (uncapped on-chain scan — the cap must be accurate).
  // Starter realms stay pinned to T2. Resolve the realm's clearReceipt
  // schema the same way `boss-cleared` does: prefer the row's own id,
  // fall back to the seeded per-preset pair for legacy/starter realms.
  let maxTier: Tier;
  if (playerRow) {
    const clearReceiptSchemaId = playerRow.clearReceiptSchemaId
      ? BigInt(playerRow.clearReceiptSchemaId)
      : seededIds.clearReceipt;
    const distinctClearers = await countDistinctClearers({
      realm: playerRow.address,
      clearReceiptSchemaId,
    });
    maxTier = playerRealmMaxTier(distinctClearers);
  } else {
    maxTier = STARTER_REALM_MAX_TIER[body.preset];
  }

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

  // Registry-declared catalog check: every effect on the incoming roll
  // must be among the catalog-effect names declared on-chain (via
  // `CatalogEffectRegistry`) for this preset's loot schema. Defends
  // against a tampered client adding an effect the schema doesn't
  // actually carry (e.g. attaching `lifesteal` to a fantasy weapon when
  // only `bleed` is declared). Falls back to `CANONICAL_CATALOG_EFFECTS`
  // when the registry isn't seeded (disconnected/trial mode).
  if (loot.slot !== "accessory") {
    const allowed = new Set(
      getCatalogEffectsForSlot(effectivePreset, loot.slot),
    );
    for (const eff of loot.catalogEffects) {
      if (!allowed.has(eff.name)) {
        return reply(422, {
          ok: false,
          reason: "loot_bounds_violation",
          message: `effect "${eff.name}" is not declared on the ${effectivePreset} ${loot.slot} schema`,
        });
      }
    }
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

  // Serialize the replay probe + nonce read + broadcast against every other
  // mint signed by this same key (sibling loot mints in the batch loop, and
  // the boss clear-receipt mint that fires alongside it). The lock keeps
  // `getTransactionCount(pending)` and `writeContract` atomic per signer
  // so two concurrent routes can't both grab the same nonce and revert
  // "nonce too low". Receipt waiting stays outside the lock.
  //
  // The `balanceOf` probe lives INSIDE the lock on purpose. Outside it, N
  // concurrent replays of one body would every one of them read a zero
  // balance before any had broadcast, and every one would mint — the
  // duplication hole, just parallelised. Serializing check-and-mint per
  // signer is what actually closes it.
  let outcome: { kind: "already_minted" } | { kind: "sent"; hash: `0x${string}` };
  try {
    outcome = await withSignerLock(signer.account.address, async () => {
      // Replay guard. `mintAsset` is an ERC-1155 mint of amount 1, so a
      // second call with the same deterministic tokenId adds a copy instead
      // of no-op'ing — a captured request could otherwise be replayed to
      // farm unlimited copies of a valid item (and loot is tradeable on the
      // bazaar with royalties).
      //
      // Read at `pending`, not `latest`: the sibling mint ahead of us in
      // this queue has broadcast but may not be mined yet. anvil automines
      // so `latest` would usually do, but base-sepolia (the stated migration
      // target) would leave a window.
      //
      // Fails OPEN on a read error, matching `/api/realm/boss-cleared`: the
      // probe talks to our own RPC over loopback, so a caller cannot force
      // it to fail, and a broken mint flow is worse than a rare duplicate.
      try {
        const existing = (await publicClient.readContract({
          address: getAddress("universalAsset"),
          abi: universalAssetAbi,
          functionName: "balanceOf",
          args: [body.recipient as `0x${string}`, tokenId],
          blockTag: "pending",
        })) as bigint;
        if (existing > 0n) return { kind: "already_minted" } as const;
      } catch {
        // RPC read failed — fall through and attempt the mint.
      }

      const nonce = await publicClient.getTransactionCount({
        address: signer.account.address,
        blockTag: "pending",
      });
      const sent = await signer.wallet.writeContract({
        address: realm,
        abi: ecosystemTemplateAbi,
        functionName: "mintAsset",
        args: [
          body.recipient as `0x${string}`,
          tokenId,
          1n,
          {
            tier: onchainTier,
            extensionSchemaId: lootSchemaId,
            metadataURI,
          },
        ],
        account: signer.account,
        chain: signer.wallet.chain,
        nonce,
      });
      return { kind: "sent", hash: sent } as const;
    });
  } catch (e) {
    return reply(500, {
      ok: false,
      reason: "tx_failed",
      message: e instanceof Error ? e.message : String(e),
    });
  }

  // Replay of an already-minted tokenId. Reported as success — the caller's
  // intended end state holds — with an empty txHash, since this request
  // broadcast nothing. Mirrors `/api/realm/boss-cleared`.
  if (outcome.kind === "already_minted") {
    return reply(200, {
      ok: true,
      tokenId: tokenId.toString(),
      txHash: "0x" as `0x${string}`,
    });
  }
  const hash = outcome.hash;

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

// Rate limit + JSON-guaranteed error envelope. See lib/server/realm-guards.ts.
export const POST = withRealmGuards("write", handleMintLoot);
