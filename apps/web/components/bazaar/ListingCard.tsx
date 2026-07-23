"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { BaseError } from "viem";
import { PreseedBadge } from "./PreseedBadge";
import { AssetCard } from "@/components/inventory/AssetCard";
import { Button, Panel, ExplorerLink } from "@/components/ui";
import { formatEth, shortAddress } from "@/lib/utils";
import {
  usePurchase,
  computeFeeBreakdown,
  type FeeBreakdown,
} from "@/lib/contracts/exchange";
import { traderHail } from "@/lib/trader-client";
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
  const { address } = useAccount();
  const { purchase, isPending } = usePurchase();
  const [hailStatus, setHailStatus] = useState<
    "idle" | "running" | "refused" | "error"
  >("idle");
  const [hailError, setHailError] = useState<string | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);

  // The Wandering Trader is hailed by the SELLER, on their own listing —
  // that keeps the demo counterparty honest (player-initiated, labeled) and
  // finite (the server refuses overpriced listings and deals once per
  // seller, ever — derived from chain history, so it survives restarts).
  const isOwnListing =
    !!address && listing.seller.toLowerCase() === address.toLowerCase();

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
    // The settlement stamps codex steps ("Witness the split" / "Earn your
    // first royalty") — refetch the journey scan so they toast now, not on
    // some later reload.
    void qc.invalidateQueries({ queryKey: queryKeys.exchangeJourneyAll() });
  };

  const onBuy = async () => {
    if (!asset) return;
    setBuyError(null);
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
      // viem's shortMessage is the one-liner ("User rejected the request.");
      // the full message dumps the whole request object.
      setBuyError(
        e instanceof BaseError
          ? e.shortMessage
          : e instanceof Error
            ? e.message
            : String(e),
      );
    }
  };

  const onHail = async () => {
    if (!asset) return;
    setHailStatus("running");
    setHailError(null);
    try {
      const result = await traderHail(listing.id);
      if (result.ok) {
        onPurchased({
          fees: computeFeeBreakdown(listing.price),
          txHash: result.txHash,
          seller: listing.seller,
          realm: asset.mintedByRealm,
        });
        refetchAfterPurchase();
        setHailStatus("idle");
      } else {
        setHailStatus(
          result.reason === "overpriced" || result.reason === "already_traded"
            ? "refused"
            : "error",
        );
        setHailError(result.message);
      }
    } catch (e) {
      setHailStatus("error");
      setHailError(e instanceof Error ? e.message : String(e));
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
          <ExplorerLink
            type="address"
            value={listing.seller}
            className="text-[10px] opacity-65 font-mono"
          >
            seller {shortAddress(listing.seller)}
          </ExplorerLink>
        </div>
      </div>

      <footer className="flex flex-col gap-1 pt-1">
        <div className="flex gap-2">
          {!isOwnListing && (
            <Button
              intent="primary"
              onClick={onBuy}
              disabled={isPending || !asset}
              className="flex-1"
            >
              {isPending ? "Buying…" : "Buy"}
            </Button>
          )}
          {isOwnListing && (
            <Button
              intent="ghost"
              onClick={onHail}
              disabled={hailStatus === "running" || !asset}
              className="flex-1"
              title="Invite the Wandering Trader (the demo counterparty) to buy this listing — fair prices only, one deal per wanderer"
            >
              {hailStatus === "running"
                ? "The trader considers…"
                : "Hail the Wandering Trader"}
            </Button>
          )}
        </div>
        {hailError && (
          <p
            className="text-[11px]"
            style={{
              color:
                hailStatus === "refused"
                  ? "var(--color-preset-accent)"
                  : "var(--color-danger)",
            }}
          >
            {hailError}
          </p>
        )}
        {buyError && (
          <p className="text-[11px] text-[var(--color-danger)]">{buyError}</p>
        )}
      </footer>
    </Panel>
  );
}
