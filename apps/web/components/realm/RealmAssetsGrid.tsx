"use client";

/**
 * `<RealmAssetsGrid/>` — catalog of assets a realm has issued.
 *
 * Bound to `useRealmAssets`. Renders the same `<AssetCard/>` the
 * inventory drawer uses — including the cross-realm translation
 * strip when the viewer is "in" a different preset (not applicable
 * here since this surface is realm-native, so we omit `targetRealm`).
 */

import { useRealmAssets } from "@/lib/reads/hooks";
import { AssetCard } from "@/components/inventory/AssetCard";
import type { Preset } from "@/lib/engine/types";
import { Panel, Stamp } from "@/components/ui";

export function RealmAssetsGrid({
  realm,
  preset,
  limit = 24,
}: {
  realm: `0x${string}`;
  preset: Preset | null;
  limit?: number;
}) {
  const assets = useRealmAssets({ realm, preset, limit });

  return (
    <Panel
      as="section"
      tone="glass-1"
      aria-label="Realm assets"
      className="flex flex-col gap-3 p-4"
    >
      <header className="flex items-baseline justify-between gap-2">
        <Stamp>Assets minted by this realm</Stamp>
        <span className="text-[10px] opacity-50">
          {assets.data?.length ?? 0} shown · newest first
        </span>
      </header>

      {assets.isLoading ? (
        <p className="text-sm opacity-60">Hydrating asset metadata…</p>
      ) : assets.isError ? (
        <p className="text-sm text-[var(--color-danger)]">
          Failed to load realm assets.
        </p>
      ) : !assets.data || assets.data.length === 0 ? (
        <p className="text-sm opacity-60">
          No loot has been minted from this realm yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {assets.data.map((card) => (
            <AssetCard
              key={card.tokenId.toString()}
              card={card}
              compact={false}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}
