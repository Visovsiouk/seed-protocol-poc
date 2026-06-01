"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient, useAccount } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { protocolExchangeAbi } from "@abis/generated";
import { getAddress } from "@/lib/contracts/addresses";
import { useActiveListings, useAssetsForListings } from "@/lib/reads/hooks";
import { queryKeys } from "@/lib/reads/cache";
import { ListingCard, type PurchasedPayload } from "./ListingCard";
import { PurchaseReceipt } from "./PurchaseReceipt";

export function ListingsGrid() {
  const publicClient = usePublicClient();
  const { address } = useAccount();
  const qc = useQueryClient();
  const { data: listings, isLoading, error } = useActiveListings();
  const { data: assets } = useAssetsForListings(listings);

  const [receipt, setReceipt] = useState<PurchasedPayload | null>(null);

  const treasuryQuery = useQuery({
    queryKey: ["exchange-treasury"],
    enabled: !!publicClient,
    staleTime: Infinity,
    queryFn: async () =>
      (await publicClient!.readContract({
        address: getAddress("protocolExchange"),
        abi: protocolExchangeAbi,
        functionName: "protocolTreasury",
      })) as `0x${string}`,
  });

  const handlePurchased = (payload: PurchasedPayload) => {
    setReceipt(payload);
    // Invalidate listings in background while modal is open.
    void qc.invalidateQueries({ queryKey: queryKeys.listings() });
    void qc.invalidateQueries({ queryKey: queryKeys.recentSales() });
    // Remove the sold item from inventory immediately.
    if (address) {
      void qc.invalidateQueries({ queryKey: queryKeys.inventoryCards(address) });
    }
  };

  // Receipt is rendered at this level unconditionally — early returns below
  // must not swallow it, otherwise a refetch that empties the list unmounts
  // the modal while it's still open.
  const receiptPortal = receipt ? (
    <PurchaseReceipt
      open
      onClose={() => setReceipt(null)}
      fees={receipt.fees}
      seller={receipt.seller}
      realm={receipt.realm}
      txHash={receipt.txHash}
      treasury={treasuryQuery.data}
    />
  ) : null;

  if (isLoading) {
    return (
      <>
        <p className="opacity-60">Loading listings…</p>
        {receiptPortal}
      </>
    );
  }
  if (error) {
    return (
      <>
        <p className="opacity-70 text-[var(--color-danger)]">
          Failed to load listings: {(error as Error).message}
        </p>
        {receiptPortal}
      </>
    );
  }
  if (!listings || listings.length === 0) {
    return (
      <>
        <div className="rounded-lg p-6 text-sm opacity-70 bg-[var(--surface-2)] border border-dashed border-[var(--border-2)]">
          No active listings. List an asset from your inventory to get started.
        </div>
        {receiptPortal}
      </>
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {listings.map((l) => (
          <ListingCard
            key={l.id.toString()}
            listing={l}
            asset={assets?.get(l.tokenId.toString())}
            onPurchased={handlePurchased}
          />
        ))}
      </div>
      {receiptPortal}
    </>
  );
}
