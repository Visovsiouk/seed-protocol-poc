"use client";

/**
 * `useMintClearReceipt` — client hook that posts a boss-clear
 * receipt to the realm-owner-signed `/api/realm/boss-cleared` route.
 *
 * Symmetric with `useMintLoot`: the realm clone's `mintAsset` is
 * `onlyOwner`, so the connected player wallet cannot mint the receipt
 * directly. The hook hands the engine outputs to the server, which
 * re-derives the deterministic tokenId, builds the metadata, and
 * broadcasts as the realm owner.
 *
 * Idempotency: same `(realm, runSeed, player, bossId)` derives the same
 * tokenId, so re-firing the POST after a flaky network call no-ops
 * against `UniversalAsset.create`.
 */

import { useCallback, useState } from "react";
import { useAccount } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/reads/cache";
import type { Preset } from "@/lib/engine/types";

export type MintClearReceiptArgs = {
  preset: Preset;
  /** The run's RNG seed — pins the receipt to a specific run. */
  runSeed: `0x${string}`;
  /** Engine catalog id for the cleared boss (e.g. "forest_hag"). */
  bossId: string;
  turns: number;
  finalHp: number;
  /** Human-readable realm label baked into the metadata JSON. */
  realmLabel: string;
  /** Realm address — routes the server signer to the per-realm
   *  delegate for player realms; ignored for starter realms. */
  realm: `0x${string}`;
};

export type MintClearReceiptResult = {
  tokenId: bigint;
  txHash: `0x${string}`;
};

export { buildClearReceiptMetadataURI, deriveClearReceiptTokenId } from "./clear-receipt-derive";

export function useMintClearReceipt() {
  const { address } = useAccount();
  const qc = useQueryClient();
  const [isPending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mintClearReceipt = useCallback(
    async (args: MintClearReceiptArgs): Promise<MintClearReceiptResult> => {
      if (!address) throw new Error("mintClearReceipt: wallet not connected");

      setPending(true);
      setError(null);
      try {
        const res = await fetch("/api/realm/boss-cleared", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            preset: args.preset,
            player: address,
            runSeed: args.runSeed,
            bossId: args.bossId,
            turns: args.turns,
            finalHp: args.finalHp,
            realmLabel: args.realmLabel,
            realmAddress: args.realm,
          }),
        });
        const body = (await res.json()) as
          | { ok: true; tokenId: string; txHash: `0x${string}` }
          | { ok: false; reason: string; message: string };
        if (!body.ok) {
          throw new Error(`mintClearReceipt[${body.reason}]: ${body.message}`);
        }

        // The tutorial-progress reader scans receipts via the inventory
        // path (clearReceipt is just another asset on the realm), so
        // invalidating these caches flips the overlay to Act 4 as soon
        // as the mint settles.
        qc.invalidateQueries({ queryKey: queryKeys.inventoryCards(address) });
        qc.invalidateQueries({ queryKey: queryKeys.inventory(address) });
        qc.invalidateQueries({ queryKey: queryKeys.tutorialProgress(address) });
        qc.invalidateQueries({ queryKey: queryKeys.bossClears(address) });

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

  return { mintClearReceipt, isPending, error, walletConnected: !!address };
}
