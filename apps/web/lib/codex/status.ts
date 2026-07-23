import type { CodexStepId } from "./steps";
import { CODEX_STEPS } from "./steps";

/**
 * Pure codex-status derivation. All inputs are plain data so this can be
 * unit-tested without chain access; the hook in `use-codex.ts` gathers the
 * inputs from the existing read layer and localStorage flags.
 */

export type CodexInputs = {
  /** Player holds ≥1 hydrated (non-receipt) asset card. */
  hasAnyLoot: boolean;
  /** Distinct founding-realm boss clears (0..3). */
  starterClears: number;
  /** SeedSBT balance > 0. */
  hasSeed: boolean;
  /** Player owns a realm (factory's 1-Seed-1-realm binding). */
  ownsRealm: boolean;
  /** Owned realm's earned loot ceiling (T3 base), if any. */
  realmMaxTier: number | null;
  /** From the exchange scan. */
  hasListed: boolean;
  hasPurchased: boolean;
  /** One of the player's listings sold — incl. to the Wandering Trader. */
  hasSold: boolean;
  royaltyEarned: boolean;
  /** localStorage: carried foreign-provenance gear into a descent. */
  crossRealmCarry: boolean;
};

export type CodexStatus = {
  done: ReadonlySet<CodexStepId>;
  /** Completed count over the non-frontier steps (the "n/9" headline). */
  completed: number;
  total: number;
  /** First not-done step in journey order, if any — the suggested CTA. */
  nextId: CodexStepId | null;
};

export function deriveCodexStatus(i: CodexInputs): CodexStatus {
  const done = new Set<CodexStepId>();

  if (i.hasAnyLoot) done.add("first-loot");
  if (i.starterClears >= 1) done.add("first-clear");
  if (i.crossRealmCarry) done.add("cross-realm");
  if (i.starterClears >= 3) done.add("three-clears");
  if (i.hasSeed) done.add("seed");
  if (i.ownsRealm) done.add("realm");
  if (i.hasListed) done.add("list");
  // "Witness the split" counts both sides of a settlement — buying any
  // relic, or having yours bought (the hail path), per the step copy.
  if (i.hasPurchased || i.hasSold) done.add("purchase");
  if (i.royaltyEarned) done.add("royalty");
  if ((i.realmMaxTier ?? 0) >= 4) done.add("tier");

  const core = CODEX_STEPS.filter((s) => !s.frontier);
  const completed = core.filter((s) => done.has(s.id)).length;
  const next = CODEX_STEPS.find((s) => !done.has(s.id)) ?? null;

  return {
    done,
    completed,
    total: core.length,
    nextId: next?.id ?? null,
  };
}
