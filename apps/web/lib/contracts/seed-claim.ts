"use client";

/**
 * `useClaimSeed` — write hook for the Act-4 tutorial CTA. Calls
 * `EcosystemTemplate.triggerSeedMint(participant, proof)` on a chosen
 * cleared realm, which in turn instructs `SeedSBT` to mint the player
 * their soulbound Seed token.
 *
 * Flow:
 *   1. Build a `ContributionProof` from the player's BossCleared events
 *      via the pure `buildContributionProof` (unit-tested separately).
 *   2. Call `triggerSeedMint(player, proof)` on the chosen realm. The
 *      realm address can be any of the cleared starter realms; we
 *      default to the most recent clear when the caller doesn't pin one.
 *   3. Wait for receipt, then invalidate the `hasSeed` and
 *      `tutorial-progress` queries so the overlay flips to Act 5.
 *
 * Known open question: the on-chain SBT validates the proof shape. The
 * exact validation rules aren't documented in the deployed ABI; if the
 * contract rejects our `metricHashes`/`timestamps`/`eventReferences`
 * mapping, the revert message is surfaced verbatim via `error` so the
 *  contract author can iterate without web changes.
 */

import { useCallback } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { ecosystemTemplateAbi } from "@abis/generated";
import { queryKeys } from "@/lib/reads/cache";
import {
  buildContributionProof,
  pickClaimRealm,
} from "@/lib/tutorial/proof";
import type { BossClearEvent } from "@/lib/tutorial/progress";

export type ClaimSeedArgs = {
  /**
   * The player's BossCleared union across cleared starter realms. The
   * hook re-sorts internally; caller order doesn't matter.
   */
  events: readonly BossClearEvent[];
  /**
   * Optional explicit realm to call `triggerSeedMint` on. When omitted,
   * the hook picks the most-recent cleared realm. Useful for tests or
   * for letting the player choose ("claim from Greenwood Vale").
   */
  realm?: `0x${string}`;
};

export type ClaimSeedResult = {
  txHash: `0x${string}`;
  realm: `0x${string}`;
};

export function useClaimSeed() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const qc = useQueryClient();
  const { writeContractAsync, isPending, error } = useWriteContract();

  const claimSeed = useCallback(
    async (args: ClaimSeedArgs): Promise<ClaimSeedResult> => {
      if (!address) throw new Error("claimSeed: wallet not connected");
      if (!publicClient) throw new Error("claimSeed: no public client");
      if (args.events.length === 0) {
        throw new Error("claimSeed: no cleared realms in proof");
      }

      const realm = args.realm ?? pickClaimRealm(args.events);
      if (!realm) {
        throw new Error("claimSeed: could not pick a claim realm");
      }

      const proof = buildContributionProof(args.events);

      const hash = await writeContractAsync({
        address: realm,
        abi: ecosystemTemplateAbi,
        functionName: "triggerSeedMint",
        args: [
          address,
          {
            metricHashes: [...proof.metricHashes],
            timestamps: [...proof.timestamps],
            eventReferences: [...proof.eventReferences],
          },
        ],
      });
      await publicClient.waitForTransactionReceipt({ hash });

      qc.invalidateQueries({ queryKey: queryKeys.hasSeed(address) });
      qc.invalidateQueries({ queryKey: queryKeys.tutorialProgress(address) });

      return { txHash: hash, realm };
    },
    [address, publicClient, qc, writeContractAsync],
  );

  return { claimSeed, isPending, error, walletConnected: !!address };
}
