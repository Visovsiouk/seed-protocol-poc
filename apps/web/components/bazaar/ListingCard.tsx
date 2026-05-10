"use client";

import { useState } from "react";
import { ProvenanceBadge } from "./ProvenanceBadge";
import { PreseedBadge } from "./PreseedBadge";
import { PurchaseReceipt } from "./PurchaseReceipt";
import { formatEth, shortAddress } from "@/lib/utils";
import {
  usePurchase,
  computeFeeBreakdown,
  type FeeBreakdown,
} from "@/lib/contracts/exchange";
import { traderBuy } from "@/lib/trader-client";
import type { ListingSummary, AssetSummary } from "@/lib/reads/types";

export function ListingCard({
  listing,
  asset,
}: {
  listing: ListingSummary;
  asset?: AssetSummary;
}) {
  const { purchase, isPending } = usePurchase();
  const [receipt, setReceipt] = useState<
    | { open: true; fees: FeeBreakdown; txHash: `0x${string}` }
    | { open: false }
  >({ open: false });
  const [demoStatus, setDemoStatus] = useState<
    "idle" | "running" | "error"
  >("idle");
  const [demoError, setDemoError] = useState<string | null>(null);

  const onBuy = async () => {
    try {
      const result = await purchase({
        listingId: listing.id,
        price: listing.price,
      });
      setReceipt({ open: true, fees: result.fees, txHash: result.txHash });
    } catch (e) {
      // Wallet rejection or revert — surfaced via console for now; the
      // wagmi hook's `error` could also be wired into a toast in.
      console.warn("purchase failed", e);
    }
  };

  const onDemo = async () => {
    setDemoStatus("running");
    setDemoError(null);
    try {
      const result = await traderBuy(listing.id);
      if (result.ok) {
        setReceipt({
          open: true,
          fees: computeFeeBreakdown(listing.price),
          txHash: result.txHash,
        });
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
    <article
      className="flex flex-col gap-3 rounded-xl p-4 transition hover:translate-y-[-2px]"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-xs opacity-60">
            #{listing.tokenId.toString()}
          </span>
          {asset ? (
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide"
              style={{
                background: tierBg(asset.tier),
                color: "#0b0b0f",
                width: "fit-content",
              }}
            >
              T{asset.tier} · schema {asset.schemaId}
            </span>
          ) : (
            <span className="text-[10px] opacity-50">loading attrs…</span>
          )}
        </div>
        <PreseedBadge preseed={listing.preseed} />
      </header>

      <div className="flex items-end justify-between">
        <div className="flex flex-col">
          <span className="text-xs opacity-60">price</span>
          <span className="text-lg font-semibold">
            {formatEth(listing.price)} ETH
          </span>
          {listing.amount > 1n && (
            <span className="text-xs opacity-60">
              × {listing.amount.toString()}
            </span>
          )}
        </div>
        <span className="text-xs opacity-50">
          seller {shortAddress(listing.seller)}
        </span>
      </div>

      {asset && <ProvenanceBadge realm={asset.mintedByRealm} />}

      <footer className="flex flex-col gap-1 pt-1">
        <div className="flex gap-2">
          <button
            onClick={onBuy}
            disabled={isPending}
            className="flex-1 rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
            style={{
              background: "var(--color-preset-accent)",
              color: "var(--color-preset-bg)",
            }}
          >
            {isPending ? "Buying…" : "Buy"}
          </button>
          <button
            onClick={onDemo}
            disabled={demoStatus === "running"}
            className="rounded-md px-3 py-2 text-sm disabled:opacity-50"
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
            title="Buy via the Wandering Trader (server-side EOA)"
          >
            {demoStatus === "running" ? "Trader…" : "Value-flow demo"}
          </button>
        </div>
        {demoError && (
          <p className="text-[11px]" style={{ color: "#ff7a7a" }}>
            {demoError}
          </p>
        )}
      </footer>

      {receipt.open && asset && (
        <PurchaseReceipt
          open={receipt.open}
          onClose={() => setReceipt({ open: false })}
          fees={receipt.fees}
          seller={listing.seller}
          realm={asset.mintedByRealm}
          txHash={receipt.txHash}
        />
      )}
    </article>
  );
}

function tierBg(tier: number): string {
  // T1 grey → T5 gold (matches MetadataRenderer convention).
  switch (tier) {
    case 1:
      return "#9aa0a6";
    case 2:
      return "#7ad6a0";
    case 3:
      return "#4ad8ff";
    case 4:
      return "#b388ff";
    case 5:
      return "#f5c542";
    default:
      return "#888";
  }
}
