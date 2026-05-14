"use client";

/**
 * `useMintLoot` — Phase 2C write hook that pushes a `LootRoll` through
 * `EcosystemTemplate.mintAsset(recipient, tokenId, amount, attrs)` on the
 * realm the run is happening in.
 *
 * What the hook does:
 *   1. Derives a deterministic `tokenId` from `(realm, runSeed, depth,
 *      nameSeed)` — same drop on the same seed will always produce the
 *      same token id, which keeps replays idempotent against the
 *      universal asset's create-or-mint semantics.
 *   2. Builds a renderer-compatible `metadataURI` (inline base64 JSON +
 *      base64 SVG) so the on-chain attrs and the off-chain inventory
 *      decoder agree on the same data.
 *   3. Calls `mintAsset` with the on-chain enum tier (0-indexed) and the
 *      schemaId the engine rolled under.
 *   4. Waits for the receipt, then invalidates the player's
 *      `inventory-cards` query so the drawer refetches.
 *
 * **Known open question:** the existing
 * `EcosystemTemplate.mintAsset` is the only nonpayable mint surface
 * exposed by the deployed template. Whether *players* (vs the realm
 * owner) can call it depends on how the deployed proxy was initialized —
 * the spec calls for a player-callable "claim-loot" path that verifies
 * the roll against the on-chain run-seed commitment, but that wrapper
 * isn't in the ABI yet. If `mintAsset` reverts with
 * `Unauthorized`/`AccessControl`, that's the gap and
 * needs to ship the wrapper before this hook can land end-to-end.
 *
 * Defensive design: the hook never throws on `useAccount` not being
 * connected — it surfaces a clear "wallet required" error so the caller
 * can decide whether to fall back to engine-only commit (
 * behaviour).
 */

import { useCallback } from "react";
import {
  useAccount,
  usePublicClient,
  useWriteContract,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { encodePacked, keccak256 } from "viem";
import { ecosystemTemplateAbi } from "@abis/generated";
import { queryKeys } from "@/lib/reads/cache";
import type { LootRoll, Preset } from "@/lib/engine/types";

export type MintLootArgs = {
  realm: `0x${string}`;
  preset: Preset;
  /** The run's RNG seed — feeds the deterministic tokenId derivation. */
  runSeed: `0x${string}`;
  /** Depth the drop happened at — also salts the tokenId. */
  depth: number;
  loot: LootRoll;
  /** Human-readable realm label baked into the metadata JSON. */
  realmLabel: string;
};

export type MintLootResult = {
  tokenId: bigint;
  txHash: `0x${string}`;
};

const TIER_LABEL: Record<number, string> = {
  1: "T1",
  2: "T2",
  3: "T3",
  4: "T4",
  5: "T5",
};

/**
 * Builds the renderer-compatible metadata data URI for a loot drop. The
 * shape matches what `lib/metadata/decode.ts` parses, and what
 * `lib/reads/inventory-cards.ts` hydrates back into an `AssetCard`.
 *
 * Exported for tests; production code reaches for `useMintLoot.mintLoot`.
 */
export function buildLootMetadataURI(args: {
  loot: LootRoll;
  preset: Preset;
  realmLabel: string;
  assembledName: string;
}): string {
  const { loot, preset, realmLabel, assembledName } = args;
  const attributes: { trait_type: string; value: string | number }[] = [
    { trait_type: "Tier", value: TIER_LABEL[loot.tier] ?? `T${loot.tier}` },
    { trait_type: "Schema", value: `${preset}:${loot.schemaId}` },
    { trait_type: "slot", value: loot.slot },
  ];
  if (loot.damageDie !== undefined) {
    attributes.push({ trait_type: "damage_die", value: loot.damageDie });
  }
  if (loot.attackBonus !== undefined) {
    attributes.push({ trait_type: "attack_bonus", value: loot.attackBonus });
  }
  if (loot.acBonus !== undefined) {
    attributes.push({ trait_type: "ac_bonus", value: loot.acBonus });
  }
  if (loot.hpBonus !== undefined) {
    attributes.push({ trait_type: "hp_bonus", value: loot.hpBonus });
  }
  for (const eff of loot.catalogEffects) {
    attributes.push({ trait_type: eff.name, value: eff.value });
  }
  for (const [k, v] of Object.entries(loot.extraFields)) {
    attributes.push({ trait_type: k, value: v as string | number });
  }

  // The renderer's `image` field is mandatory and must be an inline SVG
  // data URI. We embed a placeholder rect — the production renderer
  // overrides via `tokenURI()`, so this only surfaces if a caller decodes
  // the raw URI off-chain (e.g. our own inventory hydration).
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#222"/></svg>`;
  const json = {
    name: assembledName,
    description: `Minted in ${realmLabel}.`,
    image: `data:image/svg+xml;base64,${b64(svg)}`,
    attributes,
    seed_protocol: {
      schemaId: loot.schemaId,
      tier: loot.tier,
      minted_by_realm_label: realmLabel,
    },
  };
  return `data:application/json;base64,${b64(JSON.stringify(json))}`;
}

function b64(s: string): string {
  if (typeof btoa !== "undefined") return btoa(s);
  return Buffer.from(s, "utf8").toString("base64");
}

/**
 * Derive the on-chain tokenId. Deterministic from the run seed + drop
 * coordinates so:
 *   - Replays on the same seed mint the same token (idempotent).
 *   - Different drops in the same run get distinct ids (nameSeed varies
 *     per drop because the engine derives it from the per-step sub-rng).
 *   - The id is uniformly distributed across uint256, dodging the
 *     "incrementing id" pattern that would collide across realms.
 *
 * Exported for tests.
 */
export function deriveLootTokenId(args: {
  realm: `0x${string}`;
  runSeed: `0x${string}`;
  depth: number;
  nameSeed: bigint;
}): bigint {
  const packed = encodePacked(
    ["address", "bytes32", "uint16", "uint256"],
    [args.realm, args.runSeed, args.depth, args.nameSeed],
  );
  return BigInt(keccak256(packed));
}

export function useMintLoot() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const qc = useQueryClient();
  const { writeContractAsync, isPending, error } = useWriteContract();

  const mintLoot = useCallback(
    async (args: MintLootArgs): Promise<MintLootResult> => {
      if (!address) throw new Error("mintLoot: wallet not connected");
      if (!publicClient) throw new Error("mintLoot: no public client");

      const tokenId = deriveLootTokenId({
        realm: args.realm,
        runSeed: args.runSeed,
        depth: args.depth,
        nameSeed: args.loot.nameSeed,
      });

      const metadataURI = buildLootMetadataURI({
        loot: args.loot,
        preset: args.preset,
        realmLabel: args.realmLabel,
        // The display name is rebuilt off-chain via `assembleLootName`;
        // callers pass the realm-resolved label in `realmLabel`. We
        // include a serviceable default here in case the caller passes a
        // pre-assembled name through `realmLabel`.
        assembledName: `Loot #${tokenId.toString(16).slice(0, 8)}`,
      });

      // SeedTypes.Tier is a 0-indexed uint8 enum on-chain; the engine's
      // Tier surface is 1..5, so we shift down by one.
      const onchainTier = Math.max(0, args.loot.tier - 1);

      const hash = await writeContractAsync({
        address: args.realm,
        abi: ecosystemTemplateAbi,
        functionName: "mintAsset",
        args: [
          address,
          tokenId,
          1n,
          {
            tier: onchainTier,
            extensionSchemaId: BigInt(args.loot.schemaId),
            metadataURI,
          },
        ],
      });
      await publicClient.waitForTransactionReceipt({ hash });

      qc.invalidateQueries({ queryKey: queryKeys.inventoryCards(address) });
      qc.invalidateQueries({ queryKey: queryKeys.inventory(address) });

      return { tokenId, txHash: hash };
    },
    [address, publicClient, qc, writeContractAsync],
  );

  return { mintLoot, isPending, error, walletConnected: !!address };
}
