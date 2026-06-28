import { describe, it, expect, beforeEach } from "vitest";
import {
  FAUCET_CHAIN_ID,
  FaucetRateLimitError,
  enforceFaucetRateLimit,
  faucetBodySchema,
  isFaucetChainId,
  __resetFaucetRateLimit,
} from "./guards";

describe("faucet chain gate", () => {
  it("accepts the anvil chain id only", () => {
    expect(isFaucetChainId(FAUCET_CHAIN_ID)).toBe(true);
    expect(isFaucetChainId(31337)).toBe(true);
    expect(isFaucetChainId(84532)).toBe(false); // base-sepolia
    expect(isFaucetChainId(1)).toBe(false); // mainnet
  });
});

describe("faucet body validation", () => {
  it("accepts a well-formed 0x address", () => {
    const addr = "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720";
    expect(faucetBodySchema.parse({ address: addr }).address).toBe(addr);
  });

  it("rejects malformed or missing addresses", () => {
    expect(() => faucetBodySchema.parse({ address: "0x123" })).toThrow();
    expect(() => faucetBodySchema.parse({ address: "not-an-address" })).toThrow();
    expect(() => faucetBodySchema.parse({})).toThrow();
  });
});

describe("faucet rate limit", () => {
  beforeEach(() => __resetFaucetRateLimit());

  it("allows up to `max` calls then throws", () => {
    const ip = "203.0.113.7";
    expect(() => enforceFaucetRateLimit(ip, 3)).not.toThrow();
    expect(() => enforceFaucetRateLimit(ip, 3)).not.toThrow();
    expect(() => enforceFaucetRateLimit(ip, 3)).not.toThrow();
    expect(() => enforceFaucetRateLimit(ip, 3)).toThrow(FaucetRateLimitError);
  });

  it("tracks buckets per IP independently", () => {
    expect(() => enforceFaucetRateLimit("198.51.100.1", 1)).not.toThrow();
    expect(() => enforceFaucetRateLimit("198.51.100.1", 1)).toThrow();
    // A different IP still has its full budget.
    expect(() => enforceFaucetRateLimit("198.51.100.2", 1)).not.toThrow();
  });
});
