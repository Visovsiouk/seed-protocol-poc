"use client";

import { useActiveListings, useAssetsForListings } from "@/lib/reads/hooks";
import { ListingCard } from "./ListingCard";

export function ListingsGrid() {
  const { data: listings, isLoading, error } = useActiveListings();
  const { data: assets } = useAssetsForListings(listings);

  if (isLoading) {
    return <p className="opacity-60">Loading listings…</p>;
  }
  if (error) {
    return (
      <p className="opacity-70" style={{ color: "#ff6b6b" }}>
        Failed to load listings: {(error as Error).message}
      </p>
    );
  }
  if (!listings || listings.length === 0) {
    return (
      <div className="rounded-lg p-6 text-sm opacity-70" style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px dashed rgba(255,255,255,0.15)",
      }}>
        No active listings yet. Run <code>SeedBazaar.s.sol</code> or list an asset from your inventory once Phase 1 writes are wired.
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {listings.map((l) => (
        <ListingCard
          key={l.id.toString()}
          listing={l}
          asset={assets?.get(l.tokenId.toString())}
        />
      ))}
    </div>
  );
}
