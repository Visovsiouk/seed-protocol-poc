import { describe, expect, it, vi } from "vitest";

// lib/env parses publicSchema at module load, so the public vars must exist
// before the import — hence the dynamic import below rather than a static one.
process.env.NEXT_PUBLIC_CHAIN = "anvil";
process.env.NEXT_PUBLIC_RPC_URL = "http://127.0.0.1:8545";

const { getRealmRateLimits, getServerEnv, isPlaceholderPrivateKey } =
  await import("@/lib/env");

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

describe("getRealmRateLimits", () => {
  it("falls back to defaults when unset", () => {
    delete process.env.REALM_WRITE_RATE_LIMIT_PER_IP_PER_10MIN;
    delete process.env.REALM_READ_RATE_LIMIT_PER_IP_PER_10MIN;
    expect(getRealmRateLimits()).toEqual({
      REALM_WRITE_RATE_LIMIT_PER_IP_PER_10MIN: 60,
      REALM_READ_RATE_LIMIT_PER_IP_PER_10MIN: 300,
    });
  });

  it("resolves even when the full server env is unusable", async () => {
    // Regression guard. `withRealmGuards` wraps /api/realm/list and
    // /[address]/meta, neither of which needs a trader or signer key. Reading
    // the limits through getServerEnv() would couple them to
    // TRADER_PRIVATE_KEY and 500 those routes on any install that has not run
    // `pnpm seed:trader` — a rate limit must not stop working because an
    // unrelated secret is unset.
    //
    // Needs a fresh module: the suite above already cached a successful
    // getServerEnv() parse, so the shared instance would never throw here.
    stubServerEnv(ZERO_KEY);
    vi.resetModules();
    const fresh = await import("@/lib/env");

    expect(() => fresh.getServerEnv()).toThrow();
    expect(
      fresh.getRealmRateLimits().REALM_WRITE_RATE_LIMIT_PER_IP_PER_10MIN,
    ).toBeGreaterThan(0);
  });
});

describe("getStoryAiEnv", () => {
  const STORY_KEYS = [
    "STORY_AI_ENABLED",
    "STORY_AI_MODEL",
    "STORY_AI_TIMEOUT_MS",
    "STORY_AI_RATE_LIMIT_PER_IP_PER_10MIN",
    "ANTHROPIC_API_KEY",
  ] as const;

  async function freshStoryEnv(over: Record<string, string | undefined>) {
    for (const k of STORY_KEYS) delete process.env[k];
    for (const [k, v] of Object.entries(over)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    vi.resetModules();
    return import("@/lib/env");
  }

  it("falls back to defaults on a bare environment", async () => {
    const env = await freshStoryEnv({});
    expect(env.getStoryAiEnv().STORY_AI_ENABLED).toBe("false");
    expect(env.storyAiEnabled()).toBe(false);
  });

  it.each([
    ["a mis-cased flag", { STORY_AI_ENABLED: "TRUE" }],
    ["a non-numeric timeout", { STORY_AI_TIMEOUT_MS: "6s" }],
    ["a negative rate limit", { STORY_AI_RATE_LIMIT_PER_IP_PER_10MIN: "-1" }],
    ["an empty model", { STORY_AI_MODEL: "" }],
  ])("does not throw on %s", async (_label, over) => {
    // Regression guard for the whole story-AI contract. `.default()` only
    // substitutes for an *absent* value, so a present-but-invalid one used to
    // make `.parse` throw — and because `withStoryGuards` reads the rate limit
    // before the handler runs, that surfaced as a 500 from every
    // /api/story/* request. The routes promise narration can never change a
    // response code, and this is where that is kept.
    const env = await freshStoryEnv(over);
    expect(() => env.getStoryAiEnv()).not.toThrow();
    expect(env.getStoryAiEnv().STORY_AI_ENABLED).toBe("false");
    expect(env.storyAiEnabled()).toBe(false);
  });

  it("warns rather than failing silently, naming the key", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const env = await freshStoryEnv({ STORY_AI_ENABLED: "TRUE" });
      env.getStoryAiEnv();
      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0]![0]).toContain("STORY_AI_ENABLED");
    } finally {
      warn.mockRestore();
    }
  });

  it("still reads a valid environment", async () => {
    const env = await freshStoryEnv({
      STORY_AI_ENABLED: "true",
      ANTHROPIC_API_KEY: "sk-ant-test",
      STORY_AI_TIMEOUT_MS: "1234",
    });
    expect(env.getStoryAiEnv().STORY_AI_TIMEOUT_MS).toBe(1234);
    expect(env.storyAiEnabled()).toBe(true);
  });

  it("memoises, so one bad value warns once rather than per request", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const env = await freshStoryEnv({ STORY_AI_TIMEOUT_MS: "soon" });
      env.getStoryAiEnv();
      env.getStoryAiEnv();
      env.getStoryAiEnv();
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
  });
});
