import "server-only";

import { NextResponse } from "next/server";
import { createPublicClient, createTestClient, http } from "viem";
import { activeChain } from "@/lib/chain";
import { faucetEnabled, getServerEnv } from "@/lib/env";
import { getClientIp } from "@/lib/trader-server/rate-limit";
import {
  enforceFaucetRateLimit,
  faucetBodySchema,
  FaucetRateLimitError,
  isFaucetChainId,
} from "./guards";

/**
 * Faucet — funds a freshly connected real wallet on the local anvil chain via
 * the `anvil_setBalance` cheat method so a brand-new MetaMask account has ETH
 * to sign realm-creation txs. Hard-gated to anvil (see `faucetEnabled` and the
 * runtime `isFaucetChainId` check) — it must never run against base-sepolia.
 *
 * Pattern mirrors lib/trader-server: lazy cached viem clients + a guarded
 * route handler returning a small `{ ok }` envelope.
 */

export type FaucetResponse =
  | { ok: true; funded: boolean; balanceWei: string }
  | {
      ok: false;
      reason: "disabled" | "rate_limited" | "invalid" | "internal";
      message: string;
    };

function reply(status: number, body: FaucetResponse) {
  return NextResponse.json(body, { status });
}

function build() {
  const env = getServerEnv();
  // FAUCET_RPC_URL can stay localhost even when the browser-facing RPC is a
  // LAN/public address; fall back to the realm-signer RPC so existing envs work.
  const transport = http(env.FAUCET_RPC_URL ?? env.REALM_SIGNER_RPC_URL);
  const testClient = createTestClient({
    chain: activeChain,
    mode: "anvil",
    transport,
  });
  const publicClient = createPublicClient({ chain: activeChain, transport });
  return { testClient, publicClient };
}

type FaucetClient = ReturnType<typeof build>;
let cached: FaucetClient | undefined;

function loadFaucetClient(): FaucetClient {
  if (!cached) cached = build();
  return cached;
}

/**
 * Top a wallet up to FAUCET_AMOUNT_WEI. `anvil_setBalance` overwrites (not
 * adds), so we only set when the wallet is below target — refunding a returning
 * player is bounded to the target and never clobbers a richer balance.
 */
export async function fundAddress(
  address: `0x${string}`,
): Promise<{ funded: boolean; balanceWei: string }> {
  const { testClient, publicClient } = loadFaucetClient();
  const env = getServerEnv();
  const target = BigInt(env.FAUCET_AMOUNT_WEI);

  const current = await publicClient.getBalance({ address });
  if (current >= target) {
    return { funded: false, balanceWei: current.toString() };
  }

  await testClient.setBalance({ address, value: target });
  return { funded: true, balanceWei: target.toString() };
}

export async function handleFaucet(req: Request): Promise<Response> {
  // Belt-and-suspenders: the env flag AND a runtime chain-id check.
  if (!faucetEnabled || !isFaucetChainId(activeChain.id)) {
    return reply(400, {
      ok: false,
      reason: "disabled",
      message: "Faucet is only available on the local anvil chain",
    });
  }

  const ip = getClientIp(req);
  try {
    enforceFaucetRateLimit(ip, getServerEnv().FAUCET_RATE_LIMIT_PER_IP_PER_10MIN);
  } catch (e) {
    if (e instanceof FaucetRateLimitError) {
      return reply(429, {
        ok: false,
        reason: "rate_limited",
        message: "Try again in a few minutes",
      });
    }
    throw e;
  }

  let address: `0x${string}`;
  try {
    const raw = await req.json();
    address = faucetBodySchema.parse(raw).address as `0x${string}`;
  } catch (e) {
    return reply(400, {
      ok: false,
      reason: "invalid",
      message: e instanceof Error ? e.message : "Bad request body",
    });
  }

  try {
    const { funded, balanceWei } = await fundAddress(address);
    return reply(200, { ok: true, funded, balanceWei });
  } catch (e) {
    return reply(500, {
      ok: false,
      reason: "internal",
      message: e instanceof Error ? e.message : String(e),
    });
  }
}
