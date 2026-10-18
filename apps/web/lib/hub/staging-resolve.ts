/**
 * Pure resolution of a picked realm into everything `LoadoutStaging` needs
 * to render a doorway: preset, address, name, accent.
 *
 * Extracted from the component because the interesting part is the
 * *absence* cases, and they're easy to get wrong. A creator realm can be
 * listed on-chain (`EcosystemRegistry.ecosystemList`) and still have no row
 * in the player-realm store — deployed straight off the factory, or created
 * before `/create` registered metadata. The selector happily offers those
 * cards (CreatorCard labels them "Trial →"), so staging must have an answer
 * for them. Previously it had none: a missing row and a still-loading query
 * both collapsed to `null`, and the screen held "Preparing the doorway…"
 * forever with no way back.
 *
 * The three outcomes are therefore distinct:
 *
 *   - `loading` — the store hasn't answered yet. Transient; wait.
 *   - `error`   — the store failed, or the door points nowhere. We can't
 *                 tell a registered realm from an unregistered one, so
 *                 guessing would risk previewing HP/AC the run contradicts.
 *                 Say so and let the player back out.
 *   - `ready`   — resolved. `trial` marks the fallback path, where the
 *                 realm runs in the same stand-in flavor
 *                 `/play/realm/[address]` already uses and nothing mints.
 *
 * No chain-config imports: `starters` is passed in (the caller holds
 * `listStarterRealms()`, which does load chain config) so these tests stay
 * free of `lib/chain.ts` env validation. Same pattern as `buildRealmDisplay`.
 */

import type { Preset } from "@/lib/engine/types";
import type { StarterRealmInput } from "@/lib/contracts/realm-display";
import type { PlayerRealmMeta } from "@/lib/reads/hooks";
import type { RealmSelection } from "@/components/game/RealmSelector";
import { TRIAL_PRESET, trialRealmName } from "@/lib/contracts/realm-trial";

export type ResolvedRealm = {
  preset: Preset;
  realm: `0x${string}`;
  name: string;
  /** Creator-chosen accent hex, or null to inherit the genre default. */
  accent: string | null;
};

export type StagingResolution =
  | {
      status: "ready";
      resolved: ResolvedRealm;
      /** True when the realm has no registry row and runs as a stand-in. */
      trial: boolean;
    }
  | { status: "loading" }
  | { status: "error"; message: string };

/** Shape of `usePlayerRealms()` narrowed to what resolution depends on. */
export type PlayerRealmsState = {
  data: ReadonlyMap<string, PlayerRealmMeta> | undefined;
  /** React Query `isPending` — true only while no data has arrived yet. */
  isPending: boolean;
  isError: boolean;
};

export function resolveStagingRealm(args: {
  selection: RealmSelection;
  starters: readonly StarterRealmInput[];
  playerRealms: PlayerRealmsState;
}): StagingResolution {
  const { selection, starters, playerRealms } = args;

  if (selection.kind === "starter") {
    const entry = starters.find((s) => s.preset === selection.preset);
    if (!entry) {
      return {
        status: "error",
        message: `No starter realm is configured for the ${selection.preset} door on this chain.`,
      };
    }
    // Starter realms carry no custom accent — they inherit the genre default.
    return {
      status: "ready",
      trial: false,
      resolved: {
        preset: entry.preset,
        realm: entry.realm,
        name: entry.name,
        accent: null,
      },
    };
  }

  // Both play routes lowercase the realm before building starter gear, and
  // the gear's realm + name are baked into its metadata. Match them so the
  // card staged here is the same card the run boots with.
  const realm = selection.address.toLowerCase() as `0x${string}`;
  const meta = playerRealms.data?.get(realm);

  // Data first: a cached row stays authoritative through a background
  // refetch or a failed revalidation.
  if (meta) {
    return {
      status: "ready",
      trial: false,
      resolved: {
        preset: meta.preset,
        realm,
        name: meta.name,
        accent: meta.accent,
      },
    };
  }

  if (playerRealms.isPending) return { status: "loading" };

  if (playerRealms.isError) {
    return {
      status: "error",
      message:
        "Couldn't reach the realm registry, so this doorway can't be read. Check the dev server logs and try again.",
    };
  }

  // Settled, and the realm genuinely isn't registered — the trial path.
  return {
    status: "ready",
    trial: true,
    resolved: {
      preset: TRIAL_PRESET,
      realm,
      name: trialRealmName(realm),
      accent: null,
    },
  };
}
