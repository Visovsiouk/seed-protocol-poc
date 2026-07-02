import { describe, expect, it } from "vitest";
import {
  HAIL_PRICE_CAP_WEI,
  appraiseCapWei,
  traderAlreadyDealtWith,
  userTierFromOnChain,
} from "./hail-guards";

const SELLER = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" as const;
const OTHER = "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB" as const;
const TRADER = "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC" as const;

function listed(listingId: bigint, seller: `0x${string}`) {
  return { args: { listingId, seller } };
}
function purchased(listingId: bigint, buyer: `0x${string}`) {
  return { args: { listingId, buyer } };
}

describe("userTierFromOnChain", () => {
  it("shifts the 0-indexed enum to user tiers 1..5", () => {
    expect(userTierFromOnChain(0)).toBe(1);
    expect(userTierFromOnChain(4)).toBe(5);
  });
  it("clamps out-of-range values", () => {
    expect(userTierFromOnChain(-3)).toBe(1);
    expect(userTierFromOnChain(9)).toBe(5);
  });
});

describe("appraiseCapWei", () => {
  const maxBuy = 200_000_000_000_000_000n; // 0.2 ETH default env ceiling

  it("appraises by tier", () => {
    expect(appraiseCapWei(1, maxBuy)).toBe(HAIL_PRICE_CAP_WEI[1]);
    expect(appraiseCapWei(5, maxBuy)).toBe(HAIL_PRICE_CAP_WEI[5]);
  });

  it("the env ceiling wins when lower than the tier cap", () => {
    expect(appraiseCapWei(5, 1_000n)).toBe(1_000n);
  });

  it("a billion-ETH listing exceeds every appraisal", () => {
    const billionEth = 10n ** 27n;
    for (let tier = 1; tier <= 5; tier++) {
      expect(billionEth > appraiseCapWei(tier, maxBuy)).toBe(true);
    }
  });
});

describe("traderAlreadyDealtWith", () => {
  it("false when the trader never bought from this seller", () => {
    const listedEvents = [listed(1n, SELLER), listed(2n, OTHER)];
    const purchasedEvents = [purchased(2n, TRADER), purchased(1n, OTHER)];
    expect(
      traderAlreadyDealtWith(listedEvents, purchasedEvents, SELLER, TRADER),
    ).toBe(false);
  });

  it("true when the trader bought any of the seller's listings", () => {
    const listedEvents = [listed(1n, SELLER), listed(2n, SELLER)];
    const purchasedEvents = [purchased(2n, TRADER)];
    expect(
      traderAlreadyDealtWith(listedEvents, purchasedEvents, SELLER, TRADER),
    ).toBe(true);
  });

  it("address comparison is case-insensitive", () => {
    const listedEvents = [
      { args: { listingId: 7n, seller: SELLER.toLowerCase() as `0x${string}` } },
    ];
    const purchasedEvents = [
      { args: { listingId: 7n, buyer: TRADER.toLowerCase() as `0x${string}` } },
    ];
    expect(
      traderAlreadyDealtWith(listedEvents, purchasedEvents, SELLER, TRADER),
    ).toBe(true);
  });

  it("ignores events with missing args", () => {
    const listedEvents = [{ args: {} }, listed(1n, SELLER)];
    const purchasedEvents = [{ args: {} }];
    expect(
      traderAlreadyDealtWith(listedEvents, purchasedEvents, SELLER, TRADER),
    ).toBe(false);
  });
});
