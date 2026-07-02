"use client";

/**
 * Boss intel — shown on the loadout screen for PLAYER realms only. Surfaces
 * the warden's elemental weakness (combat already applies 1.5×/0.5×; nobody
 * could see it before descending) and appraises the chosen weapon against it.
 *
 * If the weapon is no counter AND a counter-element weapon is actually
 * listed on the bazaar, a deep-link appears. No listing → no hint: the
 * strip never advertises a purchase that cannot be made.
 */

import { useMemo } from "react";
import Link from "next/link";
import { Chip } from "@/components/ui";
import {
  getBossIntel,
  matchAgainstBoss,
  translateElement,
} from "@/lib/engine/boss-intel";
import { presetForRealm, useElementLabel } from "@/lib/contracts/adapters";
import { buildAssetCardFromMetadata } from "@/lib/metadata/asset-card";
import { useActiveListings, useAssetsForListings } from "@/lib/reads/hooks";
import type { AssetCard, Preset } from "@/lib/engine/types";

/** Does any active listing hold a weapon that counters `weakTo` here? */
function useCounterListingExists(
  weakTo: string | null,
  realmPreset: Preset,
): boolean {
  const { data: listings } = useActiveListings();
  const { data: assets } = useAssetsForListings(listings);

  return useMemo(() => {
    if (!weakTo || !listings || !assets) return false;
    for (const l of listings) {
      const summary = assets.get(l.tokenId.toString());
      if (!summary) continue;
      const card = buildAssetCardFromMetadata({
        tokenId: summary.tokenId,
        tier: summary.tier,
        schemaId: summary.schemaId,
        metadataURI: summary.metadataURI,
        mintedByRealm: summary.mintedByRealm,
      });
      if (card.slot !== "weapon") continue;
      const from = card.realmPreset ?? presetForRealm(card.realm);
      if (!from) continue;
      if (translateElement(card.element, from, realmPreset) === weakTo) {
        return true;
      }
    }
    return false;
  }, [weakTo, listings, assets, realmPreset]);
}

export function BossIntelStrip({
  realmPreset,
  bossId,
  weapon,
}: {
  realmPreset: Preset;
  bossId: string;
  weapon?: AssetCard;
}) {
  const intel = getBossIntel(realmPreset, bossId);

  // The weapon's element as it will read INSIDE this realm (adapters
  // re-encode by index; translateElement mirrors that mapping).
  const weaponPreset = weapon
    ? weapon.realmPreset ?? presetForRealm(weapon.realm) ?? realmPreset
    : realmPreset;
  const localElement = translateElement(
    weapon?.element,
    weaponPreset,
    realmPreset,
  );
  const match = intel
    ? matchAgainstBoss(localElement, intel)
    : ("neutral" as const);

  const counterListed = useCounterListingExists(
    intel?.weakTo ?? null,
    realmPreset,
  );

  const weakLabel = useElementLabel(intel?.weakTo ?? "none", realmPreset);

  if (!intel || !intel.weakTo) return null;

  return (
    <div
      aria-label="Warden intel"
      className="flex flex-col gap-1.5 rounded-md px-3 py-2 text-xs bg-[var(--surface-1)] border border-dashed border-[var(--border-2)]"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono uppercase tracking-[0.22em] opacity-65">
          Warden intel
        </span>
        <Chip color="var(--color-preset-accent)" label={`falters vs ${weakLabel}`} />
      </div>
      <p className="leading-relaxed opacity-80">
        {match === "counter" && (
          <>
            Your weapon strikes true here — <strong>1.5×</strong> against{" "}
            {intel.bossName}.
          </>
        )}
        {match === "resisted" && (
          <>
            {intel.bossName} shrugs off your weapon&apos;s element —{" "}
            <strong>0.5×</strong>. Consider another edge.
          </>
        )}
        {match === "neutral" && (
          <>
            Your weapon carries no counter — {intel.bossName} takes plain
            damage from it.
          </>
        )}
      </p>
      {match !== "counter" && counterListed && (
        <Link
          href={`/?station=market&element=${encodeURIComponent(
            intel.weakTo,
          )}&epreset=${realmPreset}`}
          className="self-start font-mono text-[11px] uppercase tracking-widest text-[var(--color-preset-accent)] hover:underline"
        >
          A {weakLabel} weapon is listed at the bazaar →
        </Link>
      )}
    </div>
  );
}
