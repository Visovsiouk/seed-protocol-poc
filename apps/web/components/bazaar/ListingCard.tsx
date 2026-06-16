"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PreseedBadge } from "./PreseedBadge";
import { AssetCard } from "@/components/inventory/AssetCard";
import { Button, Panel } from "@/components/ui";
import { formatEth, shortAddress } from "@/lib/utils";
import {
  usePurchase,
  computeFeeBreakdown,
  type FeeBreakdown,
} from "@/lib/contracts/exchange";
import { traderBuy } from "@/lib/trader-client";
import { buildAssetCardFromMetadata } from "@/lib/metadata/asset-card";
import { queryKeys } from "@/lib/reads/cache";
import type { AssetSummary, ListingSummary } from "@/lib/reads/types";

export type PurchasedPayload = {
  fees: FeeBreakdown;
  txHash: `0x${string}`;
  seller: `0x${string}`;
  realm: `0x${string}`;
};

export function ListingCard({
  listing,
  asset,
  onPurchased,
}: {
  listing: ListingSummary;
  asset?: AssetSummary;
  onPurchased: (payload: PurchasedPayload) => void;
}) {
  const qc = useQueryClient();
  const { purchase, isPending } = usePurchase();
  const [demoStatus, setDemoStatus] = useState<"idle" | "running" | "error">("idle");
  const [demoError, setDemoError] = useState<string | null>(null);

  const card = useMemo(() => {
    if (!asset) return null;
    const c = buildAssetCardFromMetadata({
      tokenId: asset.tokenId,
      tier: asset.tier,
      schemaId: asset.schemaId,
      metadataURI: asset.metadataURI,
      mintedByRealm: asset.mintedByRealm,
    });
    if (c.slot === "accessory") return null;
    return c;
  }, [asset]);

  const refetchAfterPurchase = () => {
    // Background refetch — the listing disappears while the receipt modal is
    // open. No optimistic removal: setQueryData notifies React Query subscribers
    // synchronously, which unmounts the card before React can commit the receipt
    // state update, making the modal vanish.
    void qc.invalidateQueries({ queryKey: queryKeys.listings() });
    void qc.invalidateQueries({ queryKey: queryKeys.recentSales() });
  };

  const onBuy = async () => {
    if (!asset) return;
    try {
      const result = await purchase({ listingId: listing.id, price: listing.price });
      onPurchased({
        fees: result.fees,
        txHash: result.txHash,
        seller: listing.seller,
        realm: asset.mintedByRealm,
      });
      refetchAfterPurchase();
    } catch (e) {
      console.warn("purchase failed", e);
    }
  };

  const onDemo = async () => {
    if (!asset) return;
    setDemoStatus("running");
    setDemoError(null);
    try {
      const result = await traderBuy(listing.id);
      if (result.ok) {
        onPurchased({
          fees: computeFeeBreakdown(listing.price),
          txHash: result.txHash,
          seller: listing.seller,
          realm: asset.mintedByRealm,
        });
        refetchAfterPurchase();
        setDemoStatus("idle");
      } else {
        setDemoStatus("error");
        setDemoError(result.message);
      }
    } catch (e) {
      setDemoStatus("error");
      setDemoError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Panel
      as="article"
      tone="glass-1"
      className="flex flex-col gap-3 rounded-xl p-4 transition hover:translate-y-[-2px]"
    >
      {card ? (
        <AssetCard card={card} />
      ) : (
        <Panel tone="glass-2" className="rounded-md p-3 text-xs opacity-70">
          Loading asset…
        </Panel>
      )}

      <div className="flex items-end justify-between gap-3 px-1">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-widest opacity-65">
            Price
          </span>
          <span className="text-lg font-semibold tabular-nums leading-tight">
            {formatEth(listing.price)} ETH
          </span>
          {listing.amount > 1n && (
            <span className="text-[10px] opacity-70">
              × {listing.amount.toString()}
            </span>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <PreseedBadge preseed={listing.preseed} />
          <span className="text-[10px] opacity-65 font-mono">
            seller {shortAddress(listing.seller)}
          </span>
        </div>
      </div>

      <footer className="flex flex-col gap-1 pt-1">
        <div className="flex gap-2">
          <Button
            intent="primary"
            onClick={onBuy}
            disabled={isPending || !asset}
            className="flex-1"
          >
            {isPending ? "Buying…" : "Buy"}
          </Button>
          <Button
            intent="ghost"
            onClick={onDemo}
            disabled={demoStatus === "running" || !asset}
            title="Buy via the Wandering Trader (server-side EOA)"
          >
            {demoStatus === "running" ? "Trader…" : "Value-flow demo"}
          </Button>
        </div>
        {demoError && (
          <p className="text-[11px] text-[var(--color-danger)]">
            {demoError}
          </p>
        )}
      </footer>
    </Panel>
  );
}
