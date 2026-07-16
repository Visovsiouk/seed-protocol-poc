"use client";

/**
 * Deployment guard — invalidates client-side persistence when the chain is
 * redeployed.
 *
 * Several PoC flags live in localStorage because the chain can't witness
 * them (codex cross-realm carry, equipped gear, toast seen-sets). They are
 * keyed by wallet address only, so a fresh local deploy — new anvil chain,
 * same browser, same dev address — used to leak the previous world's
 * progress into the new one (a pre-stamped "Carry gear across worlds",
 * equipped tokenIds pointing at assets that no longer exist).
 *
 * The chain's identity is its genesis block hash (anvil stamps a fresh
 * timestamp into block 0 on every boot, so redeploys always differ; public
 * testnets never do). We fetch it once per session, compare with the stored
 * id, and wipe the deployment-scoped keys on mismatch before anything reads
 * them — consumers gate on the returned `checked` flag.
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";

const DEPLOYMENT_KEY = "seed-protocol-poc:deployment-id";

/** Every localStorage key that describes state on a specific deployment. */
const DEPLOYMENT_SCOPED_KEYS = [
  "seed-protocol-poc:codex-flags",
  "seed-protocol-poc:codex-seen",
  "seed-protocol-poc:equipped",
] as const;

/**
 * Returns `true` once the stored deployment id has been checked against the
 * live chain (wiping stale state if they differ). Until then, consumers must
 * not read the deployment-scoped keys.
 */
export function useDeploymentGuard(): boolean {
  const client = usePublicClient();

  const genesis = useQuery({
    queryKey: ["deployment-id"],
    enabled: !!client,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async () => {
      const block = await client!.getBlock({ blockNumber: 0n });
      return block.hash;
    },
  });

  const [checked, setChecked] = useState(false);
  useEffect(() => {
    if (!genesis.data) return;
    try {
      const stored = window.localStorage.getItem(DEPLOYMENT_KEY);
      if (stored !== genesis.data) {
        for (const key of DEPLOYMENT_SCOPED_KEYS) {
          window.localStorage.removeItem(key);
        }
        window.localStorage.setItem(DEPLOYMENT_KEY, genesis.data);
      }
    } catch {
      // Storage disabled — nothing persisted, so nothing stale to wipe.
    }
    setChecked(true);
  }, [genesis.data]);

  return checked;
}
