"use client";

/**
 * `useCreateEcosystem` — write hook for the `/create` flow.
 *
 * `EcosystemFactory.createEcosystem()` is a public, unauthenticated
 * function: any wallet may call it to mint a fresh clone of the
 * `EcosystemTemplate`. The caller becomes the clone's owner. The
 * factory also registers the new clone in `EcosystemRegistry`, so the
 * landing-page selector picks it up automatically once `useRealms()`
 * refetches.
 *
 * Unlike the realm-signed mint paths (`/api/realm/mint-loot` and
 * friends), this is a direct **user-signed** tx via `useWriteContract`.
 * The creator pays gas and provably owns the clone. No server route is
 * required.
 *
 * The hook decodes the `EcosystemCreated(ecosystem, owner)` event from
 * the receipt so the caller can route the user straight to
 * `/play/realm/[address]` (trial mode for now — `/play/[preset]`
 * preset routing requires preset metadata that doesn't exist on-chain
 * yet, see `app/play/realm/[address]/page.tsx`).
 *
 * Realm display metadata (name, preset, bossId) is intentionally not
 * stored on-chain at the PoC stage: the design decision (per the user)
 * is that "realms are ecosystems" and `EcosystemRegistry` is the only
 * source of truth. Cosmetic metadata can land later via a side contract
 * if/when the design evolves.
 */

import { useCallback } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { ecosystemFactoryAbi } from "@abis/generated";
import { getAddress } from "@/lib/contracts/addresses";
import { queryKeys } from "@/lib/reads/cache";
import { parseEcosystemCreated } from "./factory-parse";

const FACTORY = () => getAddress("ecosystemFactory");

export type CreateEcosystemResult = {
  /** Address of the freshly deployed ecosystem clone. */
  ecosystem: `0x${string}`;
  /** Owner of the clone (the caller). */
  owner: `0x${string}`;
  txHash: `0x${string}`;
};

export { parseEcosystemCreated } from "./factory-parse";

export function useCreateEcosystem() {
  const publicClient = usePublicClient();
  const { address } = useAccount();
  const qc = useQueryClient();
  const { writeContractAsync, isPending, error } = useWriteContract();

  const createEcosystem = useCallback(async (): Promise<CreateEcosystemResult> => {
    if (!publicClient) throw new Error("No public client");

    // Pre-flight the call so a failing invariant (e.g. "Seed already
    // spent on an ecosystem" / "Caller does not hold a Seed") surfaces
    // as the actual revert reason instead of the misleading empty-logs
    // "no EcosystemCreated event found" path. The mock connector mines
    // reverting txs, so without this the user only sees the symptom.
    await publicClient.simulateContract({
      account: address,
      address: FACTORY(),
      abi: ecosystemFactoryAbi,
      functionName: "createEcosystem",
      args: [],
    });

    const hash = await writeContractAsync({
      address: FACTORY(),
      abi: ecosystemFactoryAbi,
      functionName: "createEcosystem",
      args: [],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === "reverted") {
      throw new Error("createEcosystem() reverted on-chain");
    }

    const parsed = parseEcosystemCreated(receipt.logs, FACTORY());
    if (!parsed) {
      throw new Error(
        "createEcosystem() succeeded but no EcosystemCreated event found",
      );
    }

    // Selector picks up the new clone on the next refetch.
    qc.invalidateQueries({ queryKey: queryKeys.realms() });

    return { ecosystem: parsed.ecosystem, owner: parsed.owner, txHash: hash };
  }, [publicClient, address, writeContractAsync, qc]);

  return { createEcosystem, isPending, error };
}
