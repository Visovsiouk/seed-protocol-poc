/**
 * Minimum-valid `ContributionProof` for seeder use only.
 *
 * `SeedSBT.mint` validates a proof structurally (SeedSBT.sol:103-117):
 *
 *   - metricHashes.length >= MIN_CONTRIBUTION_DIMENSIONS  (== 2)
 *   - timestamps.length   >= 1
 *   - timestamps are monotonically non-decreasing
 *   - timestamps[last] - timestamps[0] >= minContributionDuration
 *   - eventReferences.length >= 1
 *
 * The deploy script sets `minContributionDuration = 0 days`
 * (DeployFlow.sol:69), so one timestamp is enough to satisfy the duration
 * check. This module produces the smallest payload that clears every gate.
 *
 * IMPORTANT: this is the *seeder* stub. Player-issued proofs are built
 * from real `AssetMinted` clear-receipt events by `tutorial/proof.ts`. A
 * stub proof should never leak into the play-time claim flow.
 */

import { encodePacked, keccak256 } from "viem";

export type ContributionProof = {
  metricHashes: readonly `0x${string}`[];
  timestamps: readonly bigint[];
  eventReferences: readonly `0x${string}`[];
};

/**
 * Build a seeder-stub proof for `participant`. The two metric hashes and
 * the one event reference are deterministic functions of `(participant,
 * nonce)` so re-runs of the seeder produce identical bytes — useful if
 * the user wants to diff broadcasts.
 *
 * @param participant  address that will receive the Seed
 * @param nonce        per-call discriminator (the seeder uses the
 *                     target realm index 0/1/2 so the three stub proofs
 *                     don't collide)
 * @param timestamp    seconds-since-epoch the contract will check against
 *                     `minContributionDuration` (set to 0, so the value
 *                     itself doesn't matter — pass `Date.now() / 1000`).
 */
export function buildSeederStubProof(
  participant: `0x${string}`,
  nonce: bigint,
  timestamp: bigint,
): ContributionProof {
  const m0 = keccak256(
    encodePacked(
      ["address", "uint256", "string"],
      [participant, nonce, "seed-stub-metric-0"],
    ),
  );
  const m1 = keccak256(
    encodePacked(
      ["address", "uint256", "string"],
      [participant, nonce, "seed-stub-metric-1"],
    ),
  );
  const ref = keccak256(
    encodePacked(
      ["address", "uint256", "string"],
      [participant, nonce, "seed-stub-ref"],
    ),
  );

  return {
    metricHashes: [m0, m1],
    timestamps: [timestamp],
    eventReferences: [ref],
  };
}
