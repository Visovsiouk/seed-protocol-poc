/**
 * Pure realm-detail resolver for the `/realm/[address]` dashboard.
 *
 * Joins three inputs:
 *   - the URL-supplied address
 *   - the on-chain `EcosystemRegistry` snapshot (`RealmSummary[]`)
 *   - the per-preset starter overlay (`StarterRealmEntry[]`)
 *
 * Produces a discriminated union the dashboard binds against:
 *
 *   { kind: "starter" }  → registered starter realm; carries preset
 *                          metadata (name, tagline, bossId) plus the
 *                          on-chain summary.
 *   { kind: "creator" }  → registered ecosystem that isn't a starter;
 *                          runs in trial mode.
 *   { kind: "unknown" }  → address not in the registry. The dashboard
 *                          still renders a degraded panel rather than
 *                          a 404 — useful when the registry hasn't
 *                          finished hydrating, or when the seed script
 *                          hasn't been run yet.
 *
 * Pure (no chain-config imports) so the unit tests don't load
 * `lib/chain.ts` and trip env validation. Same isolation pattern as
 * `realm-picker.ts` and `realm-display.ts`.
 */

import type { Preset } from "@/lib/engine/types";
import type { RealmSummary } from "@/lib/reads/types";
import type { StarterRealmEntry } from "./starter-realms";

export type RealmDetail =
  | {
      kind: "starter";
      address: `0x${string}`;
      preset: Preset;
      name: string;
      tagline: string;
      bossId: string;
      onchain: RealmSummary;
    }
  | {
      kind: "creator";
      address: `0x${string}`;
      onchain: RealmSummary;
    }
  | {
      kind: "unknown";
      address: `0x${string}`;
    };

export function resolveRealmDetail(args: {
  address: `0x${string}`;
  registry: readonly RealmSummary[];
  starters: readonly StarterRealmEntry[];
}): RealmDetail {
  const needle = args.address.toLowerCase();
  const onchain = args.registry.find(
    (r) => r.address.toLowerCase() === needle,
  );
  if (!onchain) {
    return { kind: "unknown", address: args.address };
  }
  const starter = args.starters.find(
    (s) => s.realm.toLowerCase() === needle,
  );
  if (starter) {
    return {
      kind: "starter",
      address: onchain.address,
      preset: starter.preset,
      name: starter.name,
      tagline: starter.tagline,
      bossId: starter.bossId,
      onchain,
    };
  }
  return { kind: "creator", address: onchain.address, onchain };
}
