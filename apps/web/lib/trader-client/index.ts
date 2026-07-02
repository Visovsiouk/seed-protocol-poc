/**
 * Browser-side typed wrappers around `/api/trader/*`. The server enforces
 * rate limit + float + abuse seal; the client just narrows
 * the response shape so callers get a discriminated union.
 *
 * Shape mirrors `TraderResponse` in:
 *   { ok: true, txHash, extra? }
 *   { ok: false, reason, message }
 */

export type TraderOk = {
  ok: true;
  txHash: `0x${string}`;
  extra?: Record<string, unknown>;
};

export type TraderError = {
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

export type TraderResponse = TraderOk | TraderError;

async function call(route: string, body: unknown): Promise<TraderResponse> {
  try {
    const res = await fetch(route, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as TraderResponse;
    return json;
  } catch (e) {
    return {
      ok: false,
      reason: "internal",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export function traderBuy(listingId: bigint): Promise<TraderResponse> {
  return call("/api/trader/buy", { listingId: listingId.toString() });
}

/**
 * "Hail the Wandering Trader" — invite the trader to buy the caller's own
 * listing. The server appraises the item by tier (refuses overpriced
 * listings) and deals at most once per seller, ever.
 */
export function traderHail(listingId: bigint): Promise<TraderResponse> {
  return call("/api/trader/hail", { listingId: listingId.toString() });
}

export function traderList(
  tokenId: bigint,
  amount: bigint,
  price: bigint,
): Promise<TraderResponse> {
  return call("/api/trader/list", {
    tokenId: tokenId.toString(),
    amount: amount.toString(),
    price: price.toString(),
  });
}

export function traderCancel(listingId: bigint): Promise<TraderResponse> {
  return call("/api/trader/cancel", { listingId: listingId.toString() });
}
