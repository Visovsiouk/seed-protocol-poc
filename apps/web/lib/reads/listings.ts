import { protocolExchangeAbi } from "@abis/generated";
import { getReadClient } from "./client";
import { getAddress } from "@/lib/contracts/addresses";
import { publicEnv } from "@/lib/env";
import type { ListingSummary, SaleSummary } from "./types";

/**
 *  listing reads.
 *
 * Strategy: fetch all `Listed` events from genesis, then filter out any
 * listing whose id appears in a later `Purchased` or `Cancelled` event.
 * At PoC scale (low listing volume) this is fast enough; if it stops being,
 * the spec's escape hatch is Ponder.
 */

const EXCHANGE = () => getAddress("protocolExchange");

/**
 * Pre-seed seller allowlist. Sourced from
 * NEXT_PUBLIC_PRESEED_SELLERS (comma-separated). Callers can also override
 * at runtime via `setPreseedSellers`.
 */
let preseedSellers: Set<string> = new Set(
  (publicEnv.NEXT_PUBLIC_PRESEED_SELLERS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^0x[0-9a-f]{40}$/.test(s)),
);

export function setPreseedSellers(addrs: `0x${string}`[]) {
  preseedSellers = new Set(addrs.map((a) => a.toLowerCase()));
}

function isPreseed(seller: `0x${string}`): boolean {
  return preseedSellers.has(seller.toLowerCase());
}

export async function fetchActiveListings(): Promise<ListingSummary[]> {
  const client = getReadClient();
  const address = EXCHANGE();

  const [listed, purchased, cancelled] = await Promise.all([
    client.getContractEvents({
      address,
      abi: protocolExchangeAbi,
      eventName: "Listed",
      fromBlock: 0n,
      toBlock: "latest",
    }),
    client.getContractEvents({
      address,
      abi: protocolExchangeAbi,
      eventName: "Purchased",
      fromBlock: 0n,
      toBlock: "latest",
    }),
    client.getContractEvents({
      address,
      abi: protocolExchangeAbi,
      eventName: "Cancelled",
      fromBlock: 0n,
      toBlock: "latest",
    }),
  ]);

  const closed = new Set<string>();
  for (const ev of purchased) {
    if (ev.args.listingId !== undefined) closed.add(ev.args.listingId.toString());
  }
  for (const ev of cancelled) {
    if (ev.args.listingId !== undefined) closed.add(ev.args.listingId.toString());
  }

  const out: ListingSummary[] = [];
  for (const ev of listed) {
    const { listingId, seller, tokenId, amount, price } = ev.args;
    if (
      listingId === undefined ||
      seller === undefined ||
      tokenId === undefined ||
      amount === undefined ||
      price === undefined
    ) {
      continue;
    }
    if (closed.has(listingId.toString())) continue;
    out.push({
      id: listingId,
      seller,
      tokenId,
      amount,
      price,
      active: true,
      preseed: isPreseed(seller),
      blockNumber: ev.blockNumber,
    });
  }

  // Newest first.
  out.sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));
  return out;
}

/**
 * Recent sales — last `windowBlocks` (default 1000) `Purchased` events.
 * Poc-impl cache key: ["recent-sales"].
 */
export async function fetchRecentSales(
  windowBlocks = 1000n,
): Promise<SaleSummary[]> {
  const client = getReadClient();
  const head = await client.getBlockNumber();
  const fromBlock = head > windowBlocks ? head - windowBlocks : 0n;

  const events = await client.getContractEvents({
    address: EXCHANGE(),
    abi: protocolExchangeAbi,
    eventName: "Purchased",
    fromBlock,
    toBlock: "latest",
  });

  return events
    .filter((e) => e.args.listingId !== undefined)
    .map<SaleSummary>((e) => ({
      listingId: e.args.listingId!,
      buyer: e.args.buyer!,
      price: e.args.price!,
      blockNumber: e.blockNumber,
      txHash: e.transactionHash,
    }))
    .sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));
}
