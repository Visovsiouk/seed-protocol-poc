"use client";

/**
 * `useMintLoot` — Phase 2C client hook that posts a `LootRoll` to the
 * realm-owner-signed `/api/realm/mint-loot` route.
 *
 * The realm clone's `mintAsset` is `onlyOwner`, and the owner is the
 * server-side keyring (mnemonic indices 1/2/3 per preset, see
 * `lib/server/realm-signer.ts`). A connected player wallet cannot call
 * `mintAsset` directly — that path reverts with the access-control gate.
 * So this hook serializes the roll, calls the API, and lets the server
 * sign + broadcast on the player's behalf.
 *
 * Determinism guarantees still hold: the server re-derives the same
 * `tokenId` from the same `(realm, runSeed, depth, nameSeed)`, so a
 * retried POST is idempotent against `UniversalAsset.create`'s
 * create-or-mint semantics.
 *
 * Defensive design: the hook surfaces a clear "wallet required" error if
 * called without a connected account so the caller can fall back to the
 *  in-memory accumulator.
 */

import { useCallback, useState } from "react";
import { useAccount } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/reads/cache";
import { evocativeName } from "@/lib/loot/names";
import type { LootRoll, Preset } from "@/lib/engine/types";
import { deriveLootTokenId, buildLootMetadataURI } from "./loot-derive";

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

// Re-exports so existing callers (`buildLootMetadataURI`, `deriveLootTokenId`)
// keep their import paths even though the pure logic now lives in a
// non-client module so the server route can share it.
export { buildLootMetadataURI, deriveLootTokenId } from "./loot-derive";

export function useMintLoot() {
  const { address } = useAccount();
  const qc = useQueryClient();
  const [isPending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mintLoot = useCallback(
    async (args: MintLootArgs): Promise<MintLootResult> => {
      if (!address) throw new Error("mintLoot: wallet not connected");

      // Pre-compute the display name on the client. The name is an
      // atmospheric, preset-agnostic label drawn from the loot's
      // `nameSeed` and element family (see `evocativeName` in
      // `lib/loot/names.ts`) — e.g. "Ember", "Inferno", "Frost". It's
      // the *identity* of the asset and stays the same across realms;
      // the schema-native TYPE label (Stiletto ↔ Switchblade) is what
      // translates and is surfaced as a chip.
      //
      // Story-object overrides (Genesis' Pilgrim's Brand) still ship a
      // verbatim name on the LootRoll. When present, it skips the
      // evocative pool so the on-chain asset reads as "The Pilgrim's
      // Brand" etc., matching the in-feed narration.
      const element =
        args.loot.slot === "weapon" ? args.loot.element : args.loot.resistElement;
      const assembledName =
        args.loot.nameOverride ??
        (args.loot.slot === "weapon" || args.loot.slot === "armor"
          ? evocativeName(args.loot.nameSeed, args.loot.tier, element)
          : `Loot #${args.loot.nameSeed.toString(16).slice(0, 8)}`);

      setPending(true);
      setError(null);
      try {
        const res = await fetch("/api/realm/mint-loot", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            preset: args.preset,
            recipient: address,
            runSeed: args.runSeed,
            depth: args.depth,
            // LootRoll has two bigint fields (`nameSeed`) — JSON can't
            // serialize bigint natively so we send a decimal string and
            // parse on the server.
            loot: {
              ...args.loot,
              nameSeed: args.loot.nameSeed.toString(),
            },
            realmLabel: args.realmLabel,
            assembledName,
            // Pass the realm address so the server can route to the
            // per-realm delegate signer for player realms. Starter
            // realms can also send this — the server tolerates the
            // starter address as a no-op match against
            // `getSeededRealm(preset)`.
            realmAddress: args.realm,
          }),
        });
        const body = (await res.json()) as
          | { ok: true; tokenId: string; txHash: `0x${string}` }
          | { ok: false; reason: string; message: string };
        if (!body.ok) {
          throw new Error(`mintLoot[${body.reason}]: ${body.message}`);
        }

        qc.invalidateQueries({ queryKey: queryKeys.inventoryCards(address) });
        qc.invalidateQueries({ queryKey: queryKeys.inventory(address) });

        return { tokenId: BigInt(body.tokenId), txHash: body.txHash };
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        throw err;
      } finally {
        setPending(false);
      }
    },
    [address, qc],
  );

  return { mintLoot, isPending, error, walletConnected: !!address };
}
