/**
 * Tutorial progress reconstruction.
 *
 * The "tutorial" is the 3-Act onboarding arc the player walks through on
 * their first runs: Act 1 (first realm), Act 2 (second realm — Seed
 * mechanic introduced), Act 3 (third realm — eligible to claim the Seed).
 * Act 4/5 are post-Seed states.
 *
 * Source of truth is on-chain: each per-realm `EcosystemTemplate` emits
 * `BossCleared(player, finalHp, turns)` on its boss room clear. We union
 * those events across every known realm contract, dedupe by realm address,
 * and derive `act` from the distinct-realm count.
 *
 * In the BossCleared event isn't wired yet (deploys the
 * starter realms with the event-emitting template). For now the reader is
 * permissive: if the realm list is empty or no events come back, we return
 * `{ act: 1, distinctClears: 0, eligibleForSeed: false }` so the UI can
 * still render the tutorial overlay without throwing.
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
  /** Count of distinct-realm clears, 0..3 (further clears don't move the dial). */
  distinctClears: number;
  /** Tutorial act 1..5; 5 == post-Seed normal play. */
  act: 1 | 2 | 3 | 4 | 5;
  /** True when the player has 3+ distinct clears and no Seed yet. */
  eligibleForSeed: boolean;
};

/**
 * Pure derivation from on-chain data. `events` should already be filtered
 * to a single player; `hasSeed` comes from a SeedSBT `balanceOf` read.
 */
export function deriveTutorialProgress(args: {
  hasSeed: boolean;
  events: BossClearEvent[];
}): TutorialProgress {
  const { hasSeed, events } = args;
  const byRealm = new Map<string, BossClearEvent>();
  for (const e of events) {
    const key = e.realm.toLowerCase();
    const prior = byRealm.get(key);
    // Keep the earliest clear per realm — that's the one that counted.
    if (!prior || e.ts < prior.ts) byRealm.set(key, e);
  }
  const cleared = Array.from(byRealm.values())
    .sort((a, b) => a.ts - b.ts)
    .map((e) => ({ realm: e.realm, preset: e.preset, ts: e.ts }));
  const distinctClears = cleared.length;

  let act: TutorialProgress["act"];
  if (hasSeed) {
    act = 5;
  } else if (distinctClears === 0) {
    act = 1;
  } else if (distinctClears === 1) {
    act = 2;
  } else if (distinctClears === 2) {
    act = 3;
  } else {
    act = 4; // 3+ clears, awaiting Seed claim
  }

  return {
    hasSeed,
    cleared,
    distinctClears: Math.min(3, distinctClears),
    act,
    eligibleForSeed: !hasSeed && distinctClears >= 3,
  };
}

/**
 * Convenience factory for the not-yet-onboarded case (no wallet, no
 * deployed realms). Used by `/play` while Phase 2C contracts aren't in
 * place yet — keeps the tutorial overlay rendering during local dev.
 */
export function emptyTutorialProgress(): TutorialProgress {
  return {
    hasSeed: false,
    cleared: [],
    distinctClears: 0,
    act: 1,
    eligibleForSeed: false,
  };
}
