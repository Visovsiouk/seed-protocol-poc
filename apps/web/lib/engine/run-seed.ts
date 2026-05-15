/**
 * Deterministic run-seed derivation.
 *
 * The PoC engine consumes a 256-bit hex seed (`rngSeed`) to drive every
 * sub-rng in a run. For the seed to be *verifiable* — i.e. for a future
 * on-chain commit contract or claim-loot wrapper to reproduce a drop
 * from the same inputs — we derive it from public, reproducible inputs:
 *
 *   rngSeed = keccak256(abi.encodePacked(player, blockhash, nonce))
 *
 * - `player`   : the connected wallet address.
 * - `blockhash`: the hash of an L1 block the player pinned at run-start.
 *                Using the latest finalized block guarantees the
 *                contract can re-fetch it later via `BLOCKHASH(n)` or
 *                an oracle; using a future block opens a commit-reveal
 *                escape hatch (out of scope here).
 * - `nonce`    : a per-run discriminator. Today this is the run-start
 *                timestamp (uint64 ms), which is fine because the same
 *                player can't run two starts in the same millisecond.
 *                A real contract should accept this as an explicit
 *                parameter, not infer it.
 *
 * The pure derivation lives here so it can be tested without a public
 * client; the chain-bound resolver lives in `lib/contracts/run-seed.ts`.
 */

import { encodePacked, keccak256 } from "viem";

export type RunSeedInputs = {
  player: `0x${string}`;
  blockhash: `0x${string}`;
  /** Per-run discriminator; bigint so callers can use bigger types later. */
  nonce: bigint;
};

export function deriveRunSeed(inputs: RunSeedInputs): `0x${string}` {
  return keccak256(
    encodePacked(
      ["address", "bytes32", "uint256"],
      [inputs.player, inputs.blockhash, inputs.nonce],
    ),
  );
}
