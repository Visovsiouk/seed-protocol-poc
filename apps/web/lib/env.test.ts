import { describe, expect, it } from "vitest";

// lib/env parses publicSchema at module load, so the public vars must exist
// before the import — hence the dynamic import below rather than a static one.
process.env.NEXT_PUBLIC_CHAIN = "anvil";
process.env.NEXT_PUBLIC_RPC_URL = "http://127.0.0.1:8545";

const { getServerEnv, isPlaceholderPrivateKey } = await import("@/lib/env");

const ZERO_KEY = `0x${"0".repeat(64)}`;
// Anvil default account #8 — safe to hardcode in a test.
const REAL_KEY =
  "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97";

function stubServerEnv(key: string) {
  process.env.TRADER_PRIVATE_KEY = key;
  process.env.TRADER_RPC_URL = "http://127.0.0.1:8545";
  process.env.TRADER_FLOAT_MIN_WEI = "10000000000000000";
  process.env.REALM_SIGNER_MNEMONIC = "test test junk";
  process.env.REALM_SIGNER_RPC_URL = "http://127.0.0.1:8545";
}

describe("isPlaceholderPrivateKey", () => {
  it("flags the all-zeros placeholder", () => {
    expect(isPlaceholderPrivateKey(ZERO_KEY)).toBe(true);
  });
  it("passes a real key", () => {
    expect(isPlaceholderPrivateKey(REAL_KEY)).toBe(false);
  });
});

describe("getServerEnv", () => {
  // Order matters: getServerEnv caches its first successful parse, so the
  // rejection case must run before the acceptance case.
  it("rejects the placeholder TRADER_PRIVATE_KEY with a pointer to .env.local", () => {
    stubServerEnv(ZERO_KEY);
    expect(() => getServerEnv()).toThrow(/placeholder.*\.env\.local/s);
  });

  it("accepts a real TRADER_PRIVATE_KEY", () => {
    stubServerEnv(REAL_KEY);
    expect(getServerEnv().TRADER_PRIVATE_KEY).toBe(REAL_KEY);
  });
});
