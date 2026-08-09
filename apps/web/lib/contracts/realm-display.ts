/**
 * Pure helper that joins on-chain `EcosystemRegistry` summaries with the
 * per-preset starter metadata (name/tagline/bossId) and surfaces a
 * single unified `RealmDisplay[]` for the realm selector.
 *
 * No chain-config imports — kept pure so its tests don't transitively
 * load `lib/chain.ts` (which validates `NEXT_PUBLIC_RPC_URL` at module
 * load). Same isolation pattern as `realm-picker.ts`.
 *
 * Output ordering:
 *   1. Starter realms in canonical narrative order (fantasy → cyberpunk →
 *      scifi — matches `REALM_ORDER` in `lib/story/progression.ts`),
 *      whether or not they're already on-chain. Slots that aren't
 *      seeded yet still render with `onchain: undefined` so the UI can
 *      show a "Not yet deployed" indicator instead of silently dropping
 *      the card.
 *   2. Creator-deployed realms (anything in the registry that isn't a
 *      starter) sorted ascending by `createdAt`.
 */

import type { Preset } from "@/lib/engine/types";
import type { RealmSummary } from "@/lib/reads/types";
import { ZERO_ADDRESS, isStarterRealmDeployed } from "./realm-picker";

export type StarterRealmInput = {
  preset: Preset;
  realm: `0x${string}`;
  bossId: string;
  name: string;
  tagline: string;
};

export type RealmDisplay =
  | {
      kind: "starter";
      preset: Preset;
      address: `0x${string}`;
      bossId: string;
      name: string;
      tagline: string;
      /** False until `pnpm seed` has populated `generated/realms.json`. */
      deployed: boolean;
      /** Matching registry entry; undefined if the address isn't registered yet. */
      onchain: RealmSummary | undefined;
      /** `deployed && onchain?.active === true`. */
      ready: boolean;
    }
  | {
      kind: "creator";
      address: `0x${string}`;
      owner: `0x${string}`;
      createdAt: bigint;
      active: boolean;
    };

export function buildRealmDisplay(args: {
  starters: readonly StarterRealmInput[];
  registry: readonly RealmSummary[];
}): RealmDisplay[] {
  const starterAddresses = new Set<string>();
  for (const s of args.starters) {
    if (isStarterRealmDeployed(s.realm)) {
      starterAddresses.add(s.realm.toLowerCase());
    }
  }

  const registryByAddress = new Map<string, RealmSummary>();
  for (const r of args.registry) {
    registryByAddress.set(r.address.toLowerCase(), r);
  }

  const starterCards: RealmDisplay[] = args.starters.map((s) => {
    const deployed = isStarterRealmDeployed(s.realm);
    const onchain = deployed
      ? registryByAddress.get(s.realm.toLowerCase())
      : undefined;
    return {
      kind: "starter",
      preset: s.preset,
      address: deployed ? s.realm : ZERO_ADDRESS,
      bossId: s.bossId,
      name: s.name,
      tagline: s.tagline,
      deployed,
      onchain,
      ready: deployed && onchain?.active === true,
    };
  });

  const creatorCards: RealmDisplay[] = args.registry
    .filter((r) => !starterAddresses.has(r.address.toLowerCase()))
    .sort((a, b) => Number(a.createdAt - b.createdAt))
    .map((r) => ({
      kind: "creator",
      address: r.address,
      owner: r.owner,
      createdAt: r.createdAt,
      active: r.active,
    }));

  return [...starterCards, ...creatorCards];
}
