/**
 * Per-attempt fee jitter for the /create flow's player-signed writes.
 *
 * Some wallet signers (seen live with Brave Wallet against anvil) emit raw
 * tx bytes the node rejects with `-32602: Failed to decode transaction`
 * whenever the ECDSA signature's recovery bit is 0 (their yParity=0 is
 * RLP-encoded non-canonically). Deterministic RFC-6979 signing means an
 * identical retry re-produces the identical bytes — it can never succeed.
 * Nudging the fee by a few wei changes the sighash, which re-rolls the
 * recovery bit and turns every retry into a fresh coin flip instead of a
 * guaranteed repeat failure.
 *
 * The jitter is ≤1000 wei — dust next to any real fee — so the /create
 * writes apply it unconditionally rather than only after a failure.
 */

import type { PublicClient } from "viem";

export async function jitteredFees(
  publicClient: Pick<PublicClient, "estimateFeesPerGas">,
): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
  const fees = await publicClient.estimateFeesPerGas();
  const jitter = BigInt(Math.floor(Math.random() * 1000)) + 1n;
  return {
    maxFeePerGas: fees.maxFeePerGas + jitter,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas + jitter,
  };
}
