"use client";

/**
 * `useClaimSeed` — client hook for the Act-4 tutorial CTA.
 *
 * Posts `{ player }` to `/api/realm/claim-seed`. The server rebuilds the
 * `ContributionProof` from on-chain `AssetMinted` events filtered by
 * per-realm clearReceipt schemaId, picks the claim realm, resolves the
 * matching owner signer, and calls
 * `EcosystemTemplate.triggerSeedMint(player, proof)`.
 *
 * Why the hook no longer accepts an events array: server-side proof
 * reconstruction is the load-bearing trust boundary. A client-supplied
 * proof would just be re-checked and discarded by the server, so we
 * stopped sending it.
 *
 * Revert messages from `SeedSBT`'s proof validation bubble up verbatim
 * via `error` so the author can debug shape drift.
 */

import { useCallback, useState } from "react";
import { useAccount } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/reads/cache";

export type ClaimSeedResult = {
  txHash: `0x${string}`;
  realm: `0x${string}`;
};

export function useClaimSeed() {
  const { address } = useAccount();
  const qc = useQueryClient();
  const [isPending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const claimSeed = useCallback(async (): Promise<ClaimSeedResult> => {
    if (!address) throw new Error("claimSeed: wallet not connected");

    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/realm/claim-seed", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ player: address }),
      });
      const body = (await res.json()) as
        | { ok: true; txHash: `0x${string}`; realm: `0x${string}` }
        | { ok: false; reason: string; message: string };
      if (!body.ok) {
        throw new Error(`claimSeed[${body.reason}]: ${body.message}`);
      }

      qc.invalidateQueries({ queryKey: queryKeys.hasSeed(address) });
      qc.invalidateQueries({ queryKey: queryKeys.tutorialProgress(address) });

      return { txHash: body.txHash, realm: body.realm };
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      throw err;
    } finally {
      setPending(false);
    }
  }, [address, qc]);

  return { claimSeed, isPending, error, walletConnected: !!address };
}
