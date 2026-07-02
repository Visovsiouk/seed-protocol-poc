import "server-only";

import { z } from "zod";
import { NextResponse } from "next/server";
import { decodeEventLog, formatEther } from "viem";
import {
  appraiseCapWei,
  traderAlreadyDealtWith,
  userTierFromOnChain,
  type ListedEventArgs,
  type PurchasedEventArgs,
} from "./hail-guards";
import {
  protocolExchangeAbi,
  universalAssetAbi,
} from "@abis/generated";
import { getAddress } from "@/lib/contracts/addresses";
import { getServerEnv } from "@/lib/env";
import { loadTraderClient } from "./client";
import { enforceFloat, FloatLowError } from "./float";
import {
  enforceRateLimit,
  getClientIp,
  RateLimitError,
} from "./rate-limit";

/**
 * Shared response envelope.
 */
export type TraderResponse =
  | { ok: true; txHash: `0x${string}`; extra?: Record<string, unknown> }
  | {
      ok: false;
      reason:
        | "rate_limited"
        | "float_low"
        | "invalid"
        | "overpriced"
        | "already_traded"
        | "tx_reverted"
        | "internal";
      message: string;
    };

/**
 * Typed refusal thrown by trader actions when the trader declines a deal on
 * its own terms (not an infra failure). `withTraderGuards` maps it to a 400
 * with the specific reason so the UI can render it in-world.
 */
export class TraderRefusalError extends Error {
  constructor(
    public readonly reason: "overpriced" | "already_traded",
    message: string,
  ) {
    super(message);
    this.name = "TraderRefusalError";
  }
}

function reply(status: number, body: TraderResponse) {
  return NextResponse.json(body, { status });
}

/**
 * Wraps a route handler with the four shared guards: rate limit, JSON body
 * validation, float check, and unified error-to-response mapping. Routes
 * just provide a Zod schema and a function that takes the parsed body and
 * returns either a tx hash or an `extra`-augmented result.
 */
export function withTraderGuards<T extends z.ZodTypeAny>(
  schema: T,
  handler: (
    body: z.infer<T>,
  ) => Promise<{ txHash: `0x${string}`; extra?: Record<string, unknown> }>,
): (req: Request) => Promise<Response> {
  return async (req) => {
    const ip = getClientIp(req);
    try {
      enforceRateLimit(ip);
    } catch (e) {
      if (e instanceof RateLimitError) {
        return reply(429, {
          ok: false,
          reason: "rate_limited",
          message: "Try again in a few minutes",
        });
      }
      throw e;
    }

    let body: z.infer<T>;
    try {
      const raw = await req.json();
      body = schema.parse(raw);
    } catch (e) {
      return reply(400, {
        ok: false,
        reason: "invalid",
        message: e instanceof Error ? e.message : "Bad request body",
      });
    }

    try {
      await enforceFloat();
    } catch (e) {
      if (e instanceof FloatLowError) {
        return reply(503, {
          ok: false,
          reason: "float_low",
          message: "Trader is recharging — try again later",
        });
      }
      throw e;
    }

    try {
      const result = await handler(body);
      return reply(200, {
        ok: true,
        txHash: result.txHash,
        extra: result.extra,
      });
    } catch (e) {
      if (e instanceof TraderRefusalError) {
        return reply(400, { ok: false, reason: e.reason, message: e.message });
      }
      const message = e instanceof Error ? e.message : String(e);
      // viem's tx errors expose a `shortMessage` we could surface; for now
      // just classify revert vs internal heuristically.
      const isRevert =
        /revert|reverted|insufficient/i.test(message) ||
        /^Execution reverted/i.test(message);
      return reply(isRevert ? 400 : 500, {
        ok: false,
        reason: isRevert ? "tx_reverted" : "internal",
        message,
      });
    }
  };
}

// ----------------------------------------------------------------------------
// Action implementations — each takes a parsed body, signs and sends, returns
// the tx hash (and optionally extra structured data like a parsed listingId).
// ----------------------------------------------------------------------------

const EXCHANGE = () => getAddress("protocolExchange");
const ASSET = () => getAddress("universalAsset");

export const buyBodySchema = z.object({
  listingId: z.string().regex(/^\d+$/),
});

export async function doTraderBuy(body: z.infer<typeof buyBodySchema>) {
  const { wallet, publicClient, account } = loadTraderClient();
  const env = getServerEnv();
  const listingId = BigInt(body.listingId);

  const listing = (await publicClient.readContract({
    address: EXCHANGE(),
    abi: protocolExchangeAbi,
    functionName: "listings",
    args: [listingId],
  })) as readonly [
    `0x${string}`, // seller
    bigint, // tokenId
    bigint, // amount
    bigint, // price
    boolean, // active
  ];

  const [, , , price, active] = listing;
  if (!active) throw new Error("Listing is not active");

  const maxBuy = BigInt(env.TRADER_MAX_BUY_WEI);
  if (price > maxBuy) {
    throw new Error(
      `Listing price ${price.toString()} exceeds TRADER_MAX_BUY_WEI ${maxBuy.toString()}`,
    );
  }

  const txHash = await wallet.writeContract({
    address: EXCHANGE(),
    abi: protocolExchangeAbi,
    functionName: "purchase",
    args: [listingId],
    value: price,
    account,
    chain: wallet.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { txHash, extra: { price: price.toString() } };
}

export const listBodySchema = z.object({
  tokenId: z.string().regex(/^\d+$/),
  amount: z.string().regex(/^\d+$/),
  price: z.string().regex(/^\d+$/),
});

export async function doTraderList(body: z.infer<typeof listBodySchema>) {
  const { wallet, publicClient, account } = loadTraderClient();
  const tokenId = BigInt(body.tokenId);
  const amount = BigInt(body.amount);
  const price = BigInt(body.price);

  const balance = (await publicClient.readContract({
    address: ASSET(),
    abi: universalAssetAbi,
    functionName: "balanceOf",
    args: [account.address, tokenId],
  })) as bigint;
  if (balance < amount) {
    throw new Error(
      `Trader holds ${balance.toString()} of token ${tokenId.toString()}, needs ${amount.toString()}`,
    );
  }

  const approved = (await publicClient.readContract({
    address: ASSET(),
    abi: universalAssetAbi,
    functionName: "isApprovedForAll",
    args: [account.address, EXCHANGE()],
  })) as boolean;
  if (!approved) {
    throw new Error(
      "Trader has not approved the Protocol Exchange — provisioning step missing",
    );
  }

  const txHash = await wallet.writeContract({
    address: EXCHANGE(),
    abi: protocolExchangeAbi,
    functionName: "list",
    args: [tokenId, amount, price],
    account,
    chain: wallet.chain,
  });
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
  });

  const listingId = parseListedEvent(receipt.logs, EXCHANGE());
  return {
    txHash,
    extra: listingId !== null ? { listingId: listingId.toString() } : {},
  };
}

export const cancelBodySchema = z.object({
  listingId: z.string().regex(/^\d+$/),
});

export async function doTraderCancel(
  body: z.infer<typeof cancelBodySchema>,
) {
  const { wallet, publicClient, account } = loadTraderClient();
  const listingId = BigInt(body.listingId);

  const listing = (await publicClient.readContract({
    address: EXCHANGE(),
    abi: protocolExchangeAbi,
    functionName: "listings",
    args: [listingId],
  })) as readonly [
    `0x${string}`,
    bigint,
    bigint,
    bigint,
    boolean,
  ];
  const [seller, , , , active] = listing;
  if (!active) throw new Error("Listing is not active");
  if (seller.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error("Trader is not the seller of this listing");
  }

  const txHash = await wallet.writeContract({
    address: EXCHANGE(),
    abi: protocolExchangeAbi,
    functionName: "cancel",
    args: [listingId],
    account,
    chain: wallet.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { txHash };
}

export const hailBodySchema = z.object({
  listingId: z.string().regex(/^\d+$/),
});

/**
 * "Hail the Wandering Trader" — the player invites the trader to buy their
 * OWN listing, making the sell/royalty side of the loop completable solo.
 * Two extra guards beyond the plain buy path keep it honest and finite:
 *
 *   1. Fair price. The trader appraises the item by its on-chain tier and
 *      refuses anything above the per-tier cap (a listing priced at a
 *      billion ETH gets scoffed at, not bought). TRADER_MAX_BUY_WEI remains
 *      the absolute ceiling on top.
 *   2. One deal per seller, ever. Derived from chain history (any past
 *      `Purchased` by the trader on any of this seller's listings), so it
 *      survives server restarts and can't be reset by clearing a DB.
 *
 * Guard math lives in ./hail-guards.ts (pure, unit-tested).
 */
export async function doTraderHail(body: z.infer<typeof hailBodySchema>) {
  const { wallet, publicClient, account } = loadTraderClient();
  const env = getServerEnv();
  const listingId = BigInt(body.listingId);

  const listing = (await publicClient.readContract({
    address: EXCHANGE(),
    abi: protocolExchangeAbi,
    functionName: "listings",
    args: [listingId],
  })) as readonly [
    `0x${string}`, // seller
    bigint, // tokenId
    bigint, // amount
    bigint, // price
    boolean, // active
  ];

  const [seller, tokenId, , price, active] = listing;
  if (!active) throw new Error("Listing is not active");
  if (seller.toLowerCase() === account.address.toLowerCase()) {
    throw new Error("The trader does not hail itself");
  }

  // --- Guard 1: fair price by on-chain tier -------------------------------
  const attrs = (await publicClient.readContract({
    address: ASSET(),
    abi: universalAssetAbi,
    functionName: "tokenAttributes",
    args: [tokenId],
  })) as readonly [number, bigint, string];
  const tier = userTierFromOnChain(attrs[0]);
  const cap = appraiseCapWei(tier, BigInt(env.TRADER_MAX_BUY_WEI));
  if (price > cap) {
    throw new TraderRefusalError(
      "overpriced",
      `The trader appraises this T${tier} relic at no more than ${formatEther(cap)} ETH — reprice and hail again`,
    );
  }

  // --- Guard 2: one deal per seller, ever (derived from chain) ------------
  const [listedEvents, purchasedEvents] = await Promise.all([
    publicClient.getContractEvents({
      address: EXCHANGE(),
      abi: protocolExchangeAbi,
      eventName: "Listed",
      fromBlock: 0n,
      toBlock: "latest",
    }),
    publicClient.getContractEvents({
      address: EXCHANGE(),
      abi: protocolExchangeAbi,
      eventName: "Purchased",
      fromBlock: 0n,
      toBlock: "latest",
    }),
  ]);
  const alreadyTraded = traderAlreadyDealtWith(
    listedEvents as readonly { args: ListedEventArgs }[],
    purchasedEvents as readonly { args: PurchasedEventArgs }[],
    seller,
    account.address,
  );
  if (alreadyTraded) {
    throw new TraderRefusalError(
      "already_traded",
      "The Wandering Trader has already struck a deal with you — one per wanderer",
    );
  }

  const txHash = await wallet.writeContract({
    address: EXCHANGE(),
    abi: protocolExchangeAbi,
    functionName: "purchase",
    args: [listingId],
    value: price,
    account,
    chain: wallet.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { txHash, extra: { price: price.toString(), tier } };
}

function parseListedEvent(
  logs: readonly {
    address: `0x${string}`;
    topics: readonly `0x${string}`[];
    data: `0x${string}`;
  }[],
  exchange: `0x${string}`,
): bigint | null {
  const ex = exchange.toLowerCase();
  for (const log of logs) {
    if (log.address.toLowerCase() !== ex) continue;
    try {
      const decoded = decodeEventLog({
        abi: protocolExchangeAbi,
        data: log.data,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });
      if (decoded.eventName === "Listed") {
        const args = decoded.args as { listingId?: bigint };
        if (args.listingId !== undefined) return args.listingId;
      }
    } catch {
      // Not a Listed event.
    }
  }
  return null;
}
