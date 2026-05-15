/**
 * Pure mapping from on-chain `BossCleared` events into the
 * `SeedTypes.ContributionProof` shape that `EcosystemTemplate.triggerSeedMint`
 * and `SeedSBT.mint` expect:
 *
 *   struct ContributionProof {
 *     bytes32[] metricHashes;
 *     uint64[]  timestamps;
 *     bytes32[] eventReferences;
 *   }
 *
 * Per-clear, the PoC emits:
 *   - `metricHashes[i]`  = keccak256(packed(realm, finalHp, turns))
 *                          — a stable hash of the clear's mechanical outcome
 *                          that the contract can recompute from its own
 *                          stored event data when validating.
 *   - `timestamps[i]`    = the BossCleared event's block number, narrowed to
 *                          uint64. The contract treats this as a logical
 *                          clock; using blockNumber keeps us out of the
 *                          getBlock-per-event round-trip rabbit hole.
 *   - `eventReferences[i]` = bytes32 packing of (blockNumber, logIndex).
 *                            Unique per log; the contract can audit the
 *                            log on demand.
 *
 * The three arrays are always the same length and in the same order so
 * `proof.metricHashes[i]` corresponds to `proof.eventReferences[i]`.
 *
 * NOTE: this is a placeholder mapping until nails down
 * the proof shape the deployed `SeedSBT` actually validates. The hook
 * (`useClaimSeed`) will surface a clear revert message if the contract
 * disagrees with these inputs.
 */

import { encodePacked, keccak256 } from "viem";
import type { BossClearEvent } from "./progress";

export type ContributionProof = {
  metricHashes: readonly `0x${string}`[];
  timestamps: readonly bigint[];
  eventReferences: readonly `0x${string}`[];
};

function metricHashOf(event: BossClearEvent): `0x${string}` {
  return keccak256(
    encodePacked(
      ["address", "uint16", "uint16"],
      [event.realm, event.finalHp, event.turns],
    ),
  );
}

function eventReferenceOf(event: BossClearEvent): `0x${string}` {
  // Pack (blockNumber, logIndex) into 32 bytes — uint192 + uint64 gives us
  // ample headroom for both fields and keeps the encoding stable.
  return keccak256(
    encodePacked(
      ["uint192", "uint64"],
      [BigInt(event.blockNumber), BigInt(event.logIndex)],
    ),
  );
}

/**
 * Build a `ContributionProof` from the player's BossCleared event union.
 * Sorts events by `(blockNumber, logIndex)` ascending so the proof is
 * deterministic regardless of the order they came back from the multi-
 * realm scan.
 *
 * If `events` is empty, returns empty arrays — the contract will reject
 * the mint, but we don't second-guess that here.
 */
export function buildContributionProof(
  events: readonly BossClearEvent[],
): ContributionProof {
  const sorted = [...events].sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) {
      return a.blockNumber < b.blockNumber ? -1 : 1;
    }
    return a.logIndex - b.logIndex;
  });

  return {
    metricHashes: sorted.map(metricHashOf),
    timestamps: sorted.map((e) => BigInt(e.blockNumber)),
    eventReferences: sorted.map(eventReferenceOf),
  };
}

/**
 * Picks the realm to call `triggerSeedMint` on. Any cleared realm works
 * — the seed mints into the SBT, not into a realm — but the convention
 * is to use the *latest* clear so the UX matches "I just beat the third
 * boss, now claim".
 *
 * Returns undefined when the player hasn't cleared anything.
 */
export function pickClaimRealm(
  events: readonly BossClearEvent[],
): `0x${string}` | undefined {
  if (events.length === 0) return undefined;
  let latest = events[0]!;
  for (const e of events) {
    if (
      e.blockNumber > latest.blockNumber ||
      (e.blockNumber === latest.blockNumber && e.logIndex > latest.logIndex)
    ) {
      latest = e;
    }
  }
  return latest.realm;
}
