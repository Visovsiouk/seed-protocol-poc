"use client";

/**
 * `useRunSeedCommitment` — pulls the inputs the engine's pure
 * `deriveRunSeed` needs (player address + latest block hash + per-run
 * nonce) from the connected wallet + public client, then returns the
 * derived seed alongside the inputs so the UI can surface a
 * "commitment receipt" (i.e. "this seed = keccak(0xabc, 0xdef, 7)") for
 * a future on-chain commit contract or claim-loot wrapper to verify.
 *
 * The hook never throws; it returns `data: undefined` while inputs
 * aren't available (no wallet, no public client, RPC mid-flight) so the
 * play route can fall back to the CSPRNG path.
 *
 * IMPORTANT: the latest blockhash is pinned at *first successful fetch*
 * within the React Query stale window. Repeated calls within that
 * window return the same commitment, so the seed doesn't shift under
 * the player mid-run. A "Restart" action should bump the React Query
 * key to invalidate.
 */

import { useAccount, usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import type { PublicClient } from "viem";
import { deriveRunSeed, type RunSeedInputs } from "@/lib/engine/run-seed";

export type RunSeedCommitment = RunSeedInputs & {
  seed: `0x${string}`;
  /** The block number whose hash was pinned. */
  blockNumber: bigint;
};

async function resolveCommitment(
  client: PublicClient,
  player: `0x${string}`,
  nonce: bigint,
): Promise<RunSeedCommitment> {
  // `getBlock` without args returns latest. We grab the full block so
  // both `hash` and `number` are available — `number` is what the
  // future commit contract will use to re-derive via BLOCKHASH(n).
  const block = await client.getBlock();
  if (!block.hash) {
    throw new Error("run-seed: latest block has no hash (pending block?)");
  }
  const inputs: RunSeedInputs = {
    player,
    blockhash: block.hash,
    nonce,
  };
  return {
    ...inputs,
    seed: deriveRunSeed(inputs),
    blockNumber: block.number,
  };
}

/**
 * Resolves the run-seed commitment for the connected player.
 *
 * @param nonce per-run discriminator. The play page passes a stable
 *              value (e.g. the run-start timestamp) so the commitment
 *              doesn't shift across re-renders.
 */
export function useRunSeedCommitment(nonce: bigint) {
  const { address } = useAccount();
  const publicClient = usePublicClient();

  return useQuery<RunSeedCommitment>({
    // Keying on `nonce` lets a "Restart" action bump it to re-derive.
    queryKey: ["run-seed", address ?? "anon", nonce.toString()],
    enabled: !!address && !!publicClient,
    queryFn: () => {
      if (!address) throw new Error("run-seed: no address");
      if (!publicClient) throw new Error("run-seed: no public client");
      return resolveCommitment(publicClient, address, nonce);
    },
    // Pin the commitment within the stale window — see hook docstring.
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
}
