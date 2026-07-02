"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient, useAccount } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { protocolExchangeAbi } from "@abis/generated";
import { getAddress } from "@/lib/contracts/addresses";
import { useActiveListings, useAssetsForListings } from "@/lib/reads/hooks";
import { queryKeys } from "@/lib/reads/cache";
import { presetForRealm } from "@/lib/contracts/adapters";
import { translateElement } from "@/lib/engine/boss-intel";
import { buildAssetCardFromMetadata } from "@/lib/metadata/asset-card";
import type { Preset } from "@/lib/engine/types";
import { ListingCard, type PurchasedPayload } from "./ListingCard";
import { PurchaseReceipt } from "./PurchaseReceipt";

const PRESETS: readonly Preset[] = ["fantasy", "scifi", "cyberpunk"];

/**
 * Counter-pick deep-link filter (`/?station=market&element=holy&epreset=
 * fantasy`, set by the loadout's warden-intel strip). `element` is in the
 * TARGET realm's vocabulary; a listing matches when its weapon's element —
 * translated by the same index mapping the adapters apply — equals it.
 */
type ElementFilter = { element: string; preset: Preset };

export function ListingsGrid() {
  const publicClient = usePublicClient();
  const { address } = useAccount();
  const qc = useQueryClient();
  const { data: listings, isLoading, error } = useActiveListings();
  const { data: assets } = useAssetsForListings(listings);

  const [receipt, setReceipt] = useState<PurchasedPayload | null>(null);

  // Read the counter-pick filter from the URL on mount (SSR-safe, same
  // pattern as the hub's ?station= read). Dismissable via the chip below.
  const [filter, setFilter] = useState<ElementFilter | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const element = params.get("element");
    const preset = params.get("epreset");
    if (element && preset && PRESETS.includes(preset as Preset)) {
      setFilter({ element, preset: preset as Preset });
    }
  }, []);

  const visible = useMemo(() => {
    if (!listings) return listings;
    if (!filter || !assets) return listings;
    return listings.filter((l) => {
      const summary = assets.get(l.tokenId.toString());
      if (!summary) return false;
      const card = buildAssetCardFromMetadata({
        tokenId: summary.tokenId,
        tier: summary.tier,
        schemaId: summary.schemaId,
        metadataURI: summary.metadataURI,
        mintedByRealm: summary.mintedByRealm,
      });
      if (card.slot !== "weapon") return false;
      const from = card.realmPreset ?? presetForRealm(card.realm);
      if (!from) return false;
      return translateElement(card.element, from, filter.preset) === filter.element;
    });
  }, [listings, assets, filter]);

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
        <p className="opacity-70">Loading listings…</p>
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

  const filterChip = filter ? (
    <div className="mb-3 flex items-center gap-2 text-xs">
      <span className="rounded-full border border-[var(--color-preset-accent)] px-3 py-1 font-mono uppercase tracking-widest text-[var(--color-preset-accent)]">
        weapons countering with {filter.element}
      </span>
      <button
        type="button"
        onClick={() => setFilter(null)}
        className="opacity-60 hover:opacity-100"
        aria-label="Clear the counter-pick filter"
      >
        clear ×
      </button>
    </div>
  ) : null;

  return (
    <>
      {filterChip}
      {filter && (visible?.length ?? 0) === 0 ? (
        <div className="rounded-lg p-6 text-sm opacity-70 bg-[var(--surface-2)] border border-dashed border-[var(--border-2)]">
          Nothing countering with {filter.element} is listed right now.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(visible ?? []).map((l) => (
            <ListingCard
              key={l.id.toString()}
              listing={l}
              asset={assets?.get(l.tokenId.toString())}
              onPurchased={handlePurchased}
            />
          ))}
        </div>
      )}
      {receiptPortal}
    </>
  );
}
