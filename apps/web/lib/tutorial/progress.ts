/**
 * Tutorial progress reconstruction.
 *
 * The "tutorial" is the forced linear arc the player walks through on
 * their first runs: cold-open Book → fantasy (door I) → cyberpunk
 * (door II) → sci-fi (door III). Once those three starters are
 * cleared, the protocol surfaces (bazaar, create, Genesis claim) light
 * up and the Seed becomes claimable — clearing all three starters (and
 * not already holding a Seed) is the whole requirement.
 *
 * Source of truth is on-chain: each per-realm `EcosystemTemplate` emits
 * `BossCleared(player, finalHp, turns)` on its boss room clear. The
 * caller partitions those events into starter vs community by an
 * address-set membership check before passing them in, so this module
 * stays pure and testable.
 */

import type { Preset } from "../engine/types";

export type BossClearEvent = {
  realm: `0x${string}`;
  preset: Preset;
  finalHp: number;
  turns: number;
  ts: number;
  blockNumber: bigint;
  logIndex: number;
};

export type TutorialProgress = {
  /** True when the player owns a SeedSBT. */
  hasSeed: boolean;
  /** Distinct realms the player has cleared, oldest first. */
  cleared: { realm: `0x${string}`; preset: Preset; ts: number }[];
  /** Distinct starter-realm clears, 0..3. */
  starterClears: number;
  /** Distinct community-realm clears, 0..3 (capped). */
  communityClears: number;
  /** Total community realms currently registered (uncapped). */
  communityRealmCount: number;
  /**
   * Back-compat alias for surfaces that still display "X / 3". Equal
   * to `starterClears` — the original UI was only tracking starters.
   */
  distinctClears: number;
  /** Tutorial act 1..5; 5 == post-Seed normal play. */
  act: 1 | 2 | 3 | 4 | 5;
  /**
   * True once the player has cleared all three starters and they don't
   * already own a Seed.
   */
  eligibleForSeed: boolean;
};

/**
 * Pure derivation from on-chain data. `events` should already be
 * filtered to a single player. `starterRealmAddresses` is the set of
 * lowercased starter-realm addresses, used to partition clears between
 * the two tiers. `communityRealmCount` is the total number of
 * registered community realms (not just the ones the player has
 * cleared), used to compute the `min(3, N)` requirement.
 */
export function deriveTutorialProgress(args: {
  hasSeed: boolean;
  events: BossClearEvent[];
  starterRealmAddresses?: ReadonlySet<string>;
  communityRealmCount?: number;
}): TutorialProgress {
  const { hasSeed, events } = args;
  const starterSet = args.starterRealmAddresses ?? new Set<string>();
  const communityRealmCount = Math.max(0, args.communityRealmCount ?? 0);

  // Earliest clear per realm — that's the one that counted.
  const byRealm = new Map<string, BossClearEvent>();
  for (const e of events) {
    const key = e.realm.toLowerCase();
    const prior = byRealm.get(key);
    if (!prior || e.ts < prior.ts) byRealm.set(key, e);
  }
  const cleared = Array.from(byRealm.values())
    .sort((a, b) => a.ts - b.ts)
    .map((e) => ({ realm: e.realm, preset: e.preset, ts: e.ts }));

  let starterClears = 0;
  let communityClears = 0;
  for (const c of cleared) {
    if (starterSet.has(c.realm.toLowerCase())) starterClears += 1;
    else communityClears += 1;
  }
  starterClears = Math.min(3, starterClears);
  const communityClearsCapped = Math.min(3, communityClears);

  let act: TutorialProgress["act"];
  if (hasSeed) {
    act = 5;
  } else if (starterClears === 0) {
    act = 1;
  } else if (starterClears === 1) {
    act = 2;
  } else if (starterClears === 2) {
    act = 3;
  } else {
    act = 4; // 3 starters down — awaiting Seed claim
  }

  const eligibleForSeed = !hasSeed && starterClears >= 3;

  return {
    hasSeed,
    cleared,
    starterClears,
    communityClears: communityClearsCapped,
    communityRealmCount,
    distinctClears: starterClears,
    act,
    eligibleForSeed,
  };
}

/**
 * Convenience factory for the not-yet-onboarded case (no wallet, no
 * deployed realms). Used by `/play` while the chain is still warming
 * up — keeps the overlay rendering against a stable shape.
 */
export function emptyTutorialProgress(): TutorialProgress {
  return {
    hasSeed: false,
    cleared: [],
    starterClears: 0,
    communityClears: 0,
    communityRealmCount: 0,
    distinctClears: 0,
    act: 1,
    eligibleForSeed: false,
  };
}
