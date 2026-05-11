import "server-only";

import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { activeChain } from "@/lib/chain";
import { getServerEnv } from "@/lib/env";

/**
 * Trader signer. Loaded lazily and cached for the
 * lifetime of the server process. Reads `TRADER_PRIVATE_KEY` +
 * `TRADER_RPC_URL` from server-only env.
 *
 * IMPORTANT: never import this from a "use client" file. The `server-only`
 * import at the top of this module turns any client-bundle inclusion into
 * a build error.
 */

function build() {
  const env = getServerEnv();
  const account = privateKeyToAccount(env.TRADER_PRIVATE_KEY as `0x${string}`);
  const transport = http(env.TRADER_RPC_URL);

  const wallet = createWalletClient({
    account,
    chain: activeChain,
    transport,
  });
  const publicClient = createPublicClient({
    chain: activeChain,
    transport,
  });

  return { account, wallet, publicClient };
}

type TraderClient = ReturnType<typeof build>;
let cached: TraderClient | undefined;

export function loadTraderClient(): TraderClient {
  if (!cached) cached = build();
  return cached;
}
