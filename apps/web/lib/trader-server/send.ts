import "server-only";

import { withSignerLock } from "@/lib/server/signer-nonce-lock";
import { loadTraderClient } from "./client";

/**
 * Broadcast a trader write with the `read-nonce → broadcast` pair serialized
 * against every other trader tx.
 *
 * Unlike the realm keyring — which shards across the admin, the three starter
 * owners and a per-realm delegate — every trader action signs from the single
 * `TRADER_PRIVATE_KEY`. buy / list / cancel / hail all contend on one nonce
 * sequence, and the rate limit is per-IP, so two different players trading at
 * the same moment is the normal case rather than an edge case. That makes this
 * the most contended signer in the system.
 *
 * Each path previously let viem resolve the nonce internally, which reads
 * `pending` immediately before signing. Two concurrent requests both read the
 * same value and the second broadcast reverts "nonce too low" — the exact race
 * `withSignerLock` was written for, just never applied here (its docblock
 * named only the two realm mint routes). Keying on the trader address means
 * trader txs serialize among themselves without blocking realm mints.
 *
 * Receipt waiting stays with the CALLER, outside the lock — holding it across
 * confirmation would serialize the trader on block time rather than on the
 * nonce reservation it actually needs to protect.
 */
export async function sendTraderTx(
  write: (nonce: number) => Promise<`0x${string}`>,
): Promise<`0x${string}`> {
  const { account, publicClient } = loadTraderClient();

  return withSignerLock(account.address, async () => {
    const nonce = await publicClient.getTransactionCount({
      address: account.address,
      blockTag: "pending",
    });
    return write(nonce);
  });
}
