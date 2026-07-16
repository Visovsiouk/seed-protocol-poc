"use client";

import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { usePublicClient } from "wagmi";

import type { AssetCard, Preset } from "@/lib/engine/types";
import {
  presetForRealm,
  translateCardForRealm,
} from "@/lib/contracts/adapters";
import { loadEquipped, type EquippedSnapshot } from "./equipped";

export type EquippedSlots = {
  weapon?: AssetCard;
  armor?: AssetCard;
};

/**
 * One-shot equipped-gear hydration, shared by the two play routes
 * (`/play/[preset]` and `/play/realm/[address]`).
 *
 * Reads the persisted loadout (native cards staged in the hub), translates
 * each slot against the target realm's adapter, then pins two snapshots
 * together:
 *
 *   - `equippedNative` — the staged gear pre-translation. This is the
 *     canonical, persisted shape: always the native card (source realm +
 *     native stats), never a translated copy. Drives the cross-genre entry
 *     beat and any drawer/inventory renders (their `AssetCard` views use
 *     `targetRealm` for display-side translation, so they need the native
 *     source to start from). Set immediately so the UI renders against the
 *     right shape from frame one.
 *
 *   - `runStartEquipped` — the loadout frozen for the whole delve (gear is
 *     locked once you descend; there is no in-run equip path). Holds
 *     *translated* cards so the engine boots against this realm's numbers.
 *     Pinned only after the translations resolve, so the engine never boots
 *     a run against native stats it'd then drift away from — callers gate
 *     run start on `runStartEquipped !== null`.
 *
 * A *starter* card (`tokenId === 0n`) is realm-local — it represents the
 * gear handed out by `makeStarterGear` for one specific realm. If the
 * persisted slot is a starter from a different realm (e.g. the player
 * loaded /play/cyberpunk first, which seeded its starter into
 * localStorage, then now lands on /play/fantasy), it is discarded in
 * favour of this realm's `starterGear`. Real on-chain cards (tokenId > 0n)
 * keep travelling across realms — that's the cross-preset translation
 * story we want to preserve.
 *
 * Hydration fires once — after it has run, re-renders never clobber the
 * snapshots (that would wipe drawer equip choices). `ready` lets callers
 * hold it off until their own gates resolve (the starter route waits for
 * the realm-chain lock verdict so a sealed preset never leaks its starter
 * into localStorage).
 */
export function useEquippedHydration(args: {
  /** Target realm the run boots in; null while unresolved. */
  realm: `0x${string}` | null;
  /** This realm's starter gear (hydration fallback); null while unresolved. */
  starterGear: { weapon: AssetCard; armor: AssetCard } | null;
  /** Extra caller gate — hydration waits until this is true. */
  ready?: boolean;
}): {
  equippedNative: EquippedSlots | null;
  setEquippedNative: Dispatch<SetStateAction<EquippedSlots | null>>;
  runStartEquipped: EquippedSlots | null;
  setRunStartEquipped: Dispatch<SetStateAction<EquippedSlots | null>>;
} {
  const { realm, starterGear, ready = true } = args;
  const publicClient = usePublicClient();

  const [equippedNative, setEquippedNative] = useState<EquippedSlots | null>(
    null,
  );
  const [runStartEquipped, setRunStartEquipped] =
    useState<EquippedSlots | null>(null);

  useEffect(() => {
    if (!ready || !realm || !starterGear) return;
    if (runStartEquipped !== null) return;
    let cancelled = false;
    const stored = loadEquipped();
    const keepIfNative = (
      card: AssetCard | undefined,
      fallback: AssetCard,
    ): AssetCard => {
      if (!card) return fallback;
      if (
        card.tokenId === 0n &&
        card.realm?.toLowerCase() !== realm.toLowerCase()
      ) {
        return fallback;
      }
      return card;
    };
    const nativeBaseline: EquippedSnapshot = stored
      ? {
          weapon: keepIfNative(stored.weapon, starterGear.weapon),
          armor: keepIfNative(stored.armor, starterGear.armor),
        }
      : { weapon: starterGear.weapon, armor: starterGear.armor };
    setEquippedNative(nativeBaseline);

    const translateOne = async (
      card: AssetCard | undefined,
    ): Promise<AssetCard | undefined> => {
      if (!card || !publicClient) return card;
      try {
        return await translateCardForRealm({
          card,
          targetRealm: realm,
          publicClient,
        });
      } catch {
        // Adapter missing / reverted — fall back to native stats.
        return card;
      }
    };

    void Promise.all([
      translateOne(nativeBaseline.weapon),
      translateOne(nativeBaseline.armor),
    ]).then(([w, a]) => {
      if (cancelled) return;
      setRunStartEquipped({ weapon: w, armor: a });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, realm, starterGear]);

  return {
    equippedNative,
    setEquippedNative,
    runStartEquipped,
    setRunStartEquipped,
  };
}

/**
 * Did the player carry gear from a *different* genre into this realm? If
 * so, the "your gear changes shape" entry beat plays once before the run.
 * Reads the *native* cards' origin preset (starter gear is realm-local, so
 * a first-ever descent with starter gear is native and shows nothing).
 */
export function useIsCrossGenre(
  equipped: EquippedSlots | null,
  preset: Preset,
): boolean {
  return useMemo(() => {
    if (!equipped) return false;
    return [equipped.weapon, equipped.armor].some((c) => {
      if (!c) return false;
      const origin = c.realmPreset ?? presetForRealm(c.realm);
      return !!origin && origin !== preset;
    });
  }, [equipped, preset]);
}
