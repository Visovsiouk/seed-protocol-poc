"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useInventoryCards,
  usePlayerRealms,
  useTutorialProgress,
} from "@/lib/reads/hooks";
import { defaultReadQueryOptions, queryKeys } from "@/lib/reads/cache";
import { fetchExchangeJourney } from "@/lib/reads/exchange-journey";
import type { ExchangeJourney } from "@/lib/reads/exchange-journey";
import { loadCodexFlags } from "./local";
import { deriveCodexStatus, type CodexStatus } from "./status";
import { useDeploymentGuard } from "@/lib/persistence/deployment-guard";
import type { PlayerRealmMeta } from "@/lib/reads/hooks";

/**
 * Composite codex hook: joins the existing tutorial-progress / inventory /
 * player-realm queries with the exchange-journey scan and the localStorage
 * flags, then runs the pure `deriveCodexStatus`. Everything except the
 * cross-realm carry flag re-derives from chain on every mount — reload the
 * page and the stamps are still earned, because the chain says so.
 */
export function useCodexStatus(player: `0x${string}` | undefined): {
  status: CodexStatus;
  isLoading: boolean;
  ownedRealm: PlayerRealmMeta | null;
} {
  const progress = useTutorialProgress(player);
  const cards = useInventoryCards(player);
  const realms = usePlayerRealms();

  const ownedRealm = useMemo(() => {
    if (!player || !realms.data) return null;
    const me = player.toLowerCase();
    for (const meta of realms.data.values()) {
      if (meta.owner.toLowerCase() === me) return meta;
    }
    return null;
  }, [player, realms.data]);

  const journey = useQuery<ExchangeJourney>({
    queryKey: queryKeys.exchangeJourney(
      player ?? "none",
      ownedRealm?.address ?? "none",
    ),
    enabled: !!player,
    queryFn: () => fetchExchangeJourney(player!, ownedRealm?.address ?? null),
    ...defaultReadQueryOptions,
  });

  // Don't read the localStorage flags until the deployment guard has
  // confirmed they belong to THIS chain — a fresh redeploy would otherwise
  // show last deployment's cross-realm carry as already stamped.
  const guardChecked = useDeploymentGuard();
  const flags = guardChecked ? loadCodexFlags(player) : {};

  const status = useMemo(
    () =>
      deriveCodexStatus({
        hasAnyLoot: (cards.data?.length ?? 0) > 0,
        starterClears: progress.data?.starterClears ?? 0,
        hasSeed: progress.data?.hasSeed ?? false,
        ownsRealm: ownedRealm !== null,
        realmMaxTier: ownedRealm?.maxTier ?? null,
        hasListed: journey.data?.hasListed ?? false,
        hasPurchased: journey.data?.hasPurchased ?? false,
        hasSold: journey.data?.hasSold ?? false,
        royaltyEarned: journey.data?.royaltyEarned ?? false,
        crossRealmCarry: flags.crossRealmCarry ?? false,
      }),
    [cards.data, progress.data, ownedRealm, journey.data, flags.crossRealmCarry],
  );

  return {
    status,
    isLoading:
      !guardChecked ||
      progress.isLoading ||
      cards.isLoading ||
      realms.isLoading ||
      journey.isLoading,
    ownedRealm,
  };
}
