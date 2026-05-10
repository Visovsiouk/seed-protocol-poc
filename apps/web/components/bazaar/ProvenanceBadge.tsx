"use client";

import { shortAddress } from "@/lib/utils";

/**
 * Provenance pill — "minted by <realm>". A future iteration will
 * resolve the realm address to its display name via RealmRegistry; for now
 * we render a short-address fallback so the surface is wired end-to-end.
 */
export function ProvenanceBadge({ realm }: { realm: `0x${string}` }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.1)",
      }}
      title={realm}
    >
      <span className="opacity-60">minted by</span>
      <span className="font-mono">{shortAddress(realm)}</span>
    </span>
  );
}
