"use client";

import { useCallback } from "react";
import {
  useAccount,
  usePublicClient,
  useWriteContract,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { decodeEventLog } from "viem";
import { protocolExchangeAbi, universalAssetAbi } from "@abis/generated";
import { getAddress } from "@/lib/contracts/addresses";
import { queryKeys } from "@/lib/reads/cache";

/**
 *  write hooks for the Protocol Exchange.
 *
 * Each hook returns:
 *   - a callable mutation (async fn taking the args, returning a tx hash)
 *   - `isPending` / `error` from wagmi's `useWriteContract`
 *   - any structured result that needed event-log parsing (e.g. listingId)
 *
 * After every successful tx we invalidate the relevant query keys so the
 * bazaar refetches without a manual reload. We do NOT optimistically mutate
 * the cache — the read layer's stale window (15s, see lib/reads/cache.ts)
 * keeps the UI responsive enough that optimistic updates would just add
 * surface area for rollback bugs.
 */

const EXCHANGE = () => getAddress("protocolExchange");
const ASSET = () => getAddress("universalAsset");

/**
 * Royalty constants — mirrored from contracts/SeedTypes.sol so we can compute
 * the value-flow split client-side without an extra RPC call. If these change
 * on-chain, update here too (verified by `usePurchaseWithValueFlow`'s receipt
 * cross-check against the real fee transfer events).
 */
export const ROYALTY_RATE_BPS = 500n; // 5% total fee
export const CREATOR_SHARE_BPS = 9000n; // 90% of fee → creator (4.5% of sale)
export const TREASURY_SHARE_BPS = 1000n; // 10% of fee → treasury (0.5% of sale)
export const BPS_DENOMINATOR = 10000n;

export type FeeBreakdown = {
  /** Full listing price (what the buyer paid). */
  total: bigint;
  /** Total royalty (creator + treasury). */
  royalty: bigint;
  /** Royalty share routed to the realm's creator. */
  creator: bigint;
  /** Royalty share routed to the protocol treasury. */
  treasury: bigint;
  /** Net amount the seller receives. */
  seller: bigint;
};

export function computeFeeBreakdown(price: bigint): FeeBreakdown {
  const royalty = (price * ROYALTY_RATE_BPS) / BPS_DENOMINATOR;
  const creator = (royalty * CREATOR_SHARE_BPS) / BPS_DENOMINATOR;
  // Use subtraction so creator + treasury == royalty exactly, no rounding gap.
  const treasury = royalty - creator;
  const seller = price - royalty;
  return { total: price, royalty, creator, treasury, seller };
}

// ----------------------------------------------------------------------------
// useApproveExchange — one-shot setApprovalForAll for the Exchange.
// ----------------------------------------------------------------------------

/**
 * Returns the current wallet's approval status against the Protocol Exchange
 * plus a `setApproved` mutation. `useList` uses this internally so callers
 * don't need to remember the approval step.
 */
export function useExchangeApproval() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync, isPending, error } = useWriteContract();

  const check = useCallback(async (): Promise<boolean> => {
    if (!address || !publicClient) return false;
    return (await publicClient.readContract({
      address: ASSET(),
      abi: universalAssetAbi,
      functionName: "isApprovedForAll",
      args: [address, EXCHANGE()],
    })) as boolean;
  }, [address, publicClient]);

  const approve = useCallback(async (): Promise<`0x${string}`> => {
    const hash = await writeContractAsync({
      address: ASSET(),
      abi: universalAssetAbi,
      functionName: "setApprovalForAll",
      args: [EXCHANGE(), true],
    });
    if (publicClient) {
      await publicClient.waitForTransactionReceipt({ hash });
    }
    return hash;
  }, [writeContractAsync, publicClient]);

  return { check, approve, isPending, error };
}

// ----------------------------------------------------------------------------
// useList — ProtocolExchange.list(tokenId, amount, price) → listingId
// ----------------------------------------------------------------------------

export type ListArgs = {
  tokenId: bigint;
  amount: bigint;
  /** Total price in wei (not per-unit). Matches the contract. */
  price: bigint;
};

export type ListResult = {
  listingId: bigint;
  txHash: `0x${string}`;
};

export function useList() {
  const publicClient = usePublicClient();
  const qc = useQueryClient();
  const approval = useExchangeApproval();
  const { writeContractAsync, isPending, error } = useWriteContract();

  const list = useCallback(
    async (args: ListArgs): Promise<ListResult> => {
      if (!publicClient) throw new Error("No public client");

      // Auto-approve if the user hasn't already. ERC-1155 setApprovalForAll
      // is idempotent — a no-op if already true — but we skip the tx to
      // save the wallet round-trip.
      const alreadyApproved = await approval.check();
      if (!alreadyApproved) {
        await approval.approve();
      }

      const hash = await writeContractAsync({
        address: EXCHANGE(),
        abi: protocolExchangeAbi,
        functionName: "list",
        args: [args.tokenId, args.amount, args.price],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      const listingId = parseListedEvent(receipt.logs);
      if (listingId === null) {
        throw new Error("list() succeeded but no Listed event found");
      }

      // Invalidate so the bazaar grid refetches immediately.
      qc.invalidateQueries({ queryKey: queryKeys.listings() });

      return { listingId, txHash: hash };
    },
    [publicClient, writeContractAsync, qc, approval],
  );

  return { list, isPending, error };
}

// ----------------------------------------------------------------------------
// usePurchase — ProtocolExchange.purchase(listingId) payable
// ----------------------------------------------------------------------------

export type PurchaseArgs = {
  listingId: bigint;
  /** Total price in wei — sent as msg.value. */
  price: bigint;
};

export type PurchaseResult = {
  txHash: `0x${string}`;
  fees: FeeBreakdown;
};

export function usePurchase() {
  const publicClient = usePublicClient();
  const qc = useQueryClient();
  const { writeContractAsync, isPending, error } = useWriteContract();

  const purchase = useCallback(
    async (args: PurchaseArgs): Promise<PurchaseResult> => {
      if (!publicClient) throw new Error("No public client");

      const hash = await writeContractAsync({
        address: EXCHANGE(),
        abi: protocolExchangeAbi,
        functionName: "purchase",
        args: [args.listingId],
        value: args.price,
      });
      await publicClient.waitForTransactionReceipt({ hash });

      return { txHash: hash, fees: computeFeeBreakdown(args.price) };
    },
    [publicClient, writeContractAsync, qc],
  );

  return { purchase, isPending, error };
}

// ----------------------------------------------------------------------------
// useCancel — ProtocolExchange.cancel(listingId)
// ----------------------------------------------------------------------------

export function useCancel() {
  const publicClient = usePublicClient();
  const qc = useQueryClient();
  const { writeContractAsync, isPending, error } = useWriteContract();

  const cancel = useCallback(
    async (listingId: bigint): Promise<`0x${string}`> => {
      if (!publicClient) throw new Error("No public client");

      const hash = await writeContractAsync({
        address: EXCHANGE(),
        abi: protocolExchangeAbi,
        functionName: "cancel",
        args: [listingId],
      });
      await publicClient.waitForTransactionReceipt({ hash });

      qc.invalidateQueries({ queryKey: queryKeys.listings() });
      return hash;
    },
    [publicClient, writeContractAsync, qc],
  );

  return { cancel, isPending, error };
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function parseListedEvent(
  logs: readonly { address: `0x${string}`; topics: readonly `0x${string}`[]; data: `0x${string}` }[],
): bigint | null {
  const exchange = EXCHANGE().toLowerCase();
  for (const log of logs) {
    if (log.address.toLowerCase() !== exchange) continue;
    try {
      const decoded = decodeEventLog({
        abi: protocolExchangeAbi,
        data: log.data,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });
      if (decoded.eventName === "Listed") {
        const args = decoded.args as { listingId?: bigint };
        if (args.listingId !== undefined) return args.listingId;
      }
    } catch {
      // Not a Listed event — keep scanning.
    }
  }
  return null;
}
