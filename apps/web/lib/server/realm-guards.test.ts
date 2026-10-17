import { beforeEach, describe, expect, it, vi } from "vitest";

// lib/env parses publicSchema at module load and caches the realm rate limits
// on first read, so both must be set before the dynamic import below.
process.env.NEXT_PUBLIC_CHAIN = "anvil";
process.env.NEXT_PUBLIC_RPC_URL = "http://127.0.0.1:8545";
process.env.REALM_WRITE_RATE_LIMIT_PER_IP_PER_10MIN = "3";
process.env.REALM_READ_RATE_LIMIT_PER_IP_PER_10MIN = "5";

const { withRealmGuards, __resetRealmRateLimits } = await import(
  "./realm-guards"
);

/** A request from `ip`, shaped the way Caddy forwards it. */
function req(ip: string, forgedPrefix?: string): Request {
  return new Request("https://play.example.com/api/realm/mint-loot", {
    method: "POST",
    headers: {
      "x-forwarded-for": forgedPrefix ? `${forgedPrefix}, ${ip}` : ip,
    },
  });
}

const ok = async () => Response.json({ ok: true });

describe("withRealmGuards", () => {
  beforeEach(() => {
    __resetRealmRateLimits();
  });

  it("passes through to the handler and returns its response", async () => {
    const handler = vi.fn(ok);
    const res = await withRealmGuards("write", handler)(req("1.1.1.1"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("forwards extra route args (the [address] params object)", async () => {
    const handler = vi.fn(
      async (_r: Request, ctx: { params: Promise<{ address: string }> }) =>
        Response.json({ address: (await ctx.params).address }),
    );
    const guarded = withRealmGuards("read", handler);

    const res = await guarded(req("1.1.1.1"), {
      params: Promise.resolve({ address: "0xabc" }),
    });

    expect(await res.json()).toEqual({ address: "0xabc" });
  });

  it("429s with a JSON envelope once the write budget is spent", async () => {
    const guarded = withRealmGuards("write", ok);
    for (let i = 0; i < 3; i++) {
      expect((await guarded(req("2.2.2.2"))).status).toBe(200);
    }

    const res = await guarded(req("2.2.2.2"));
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({
      ok: false,
      reason: "rate_limited",
    });
  });

  it("does not invoke the handler once rate limited", async () => {
    const handler = vi.fn(ok);
    const guarded = withRealmGuards("write", handler);
    for (let i = 0; i < 4; i++) await guarded(req("3.3.3.3"));

    // 3 allowed + 1 refused; the refused call must not reach the handler,
    // which is the whole point — it is what stops the tx being signed.
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it("keeps read and write budgets independent", async () => {
    const write = withRealmGuards("write", ok);
    const read = withRealmGuards("read", ok);

    // Exhaust the write budget for this IP.
    for (let i = 0; i < 3; i++) await write(req("4.4.4.4"));
    expect((await write(req("4.4.4.4"))).status).toBe(429);

    // UI polling a read route must still work — and vice versa, exhausting
    // reads must not consume the budget protecting the signing routes.
    expect((await read(req("4.4.4.4"))).status).toBe(200);
  });

  it("buckets per IP", async () => {
    const guarded = withRealmGuards("write", ok);
    for (let i = 0; i < 3; i++) await guarded(req("5.5.5.5"));

    expect((await guarded(req("5.5.5.5"))).status).toBe(429);
    expect((await guarded(req("6.6.6.6"))).status).toBe(200);
  });

  it("ignores a forged X-Forwarded-For prefix", async () => {
    // Integration of the client-ip fix with the limiter: rotating a spoofed
    // leading hop must not hand out a fresh budget. All four calls below are
    // the same real peer.
    const guarded = withRealmGuards("write", ok);
    const forged = ["9.9.9.9", "8.8.8.8", "7.7.7.7"];

    for (const f of forged) {
      expect((await guarded(req("10.0.0.1", f))).status).toBe(200);
    }
    const res = await guarded(req("10.0.0.1", "6.6.6.6"));
    expect(res.status).toBe(429);
  });

  it("converts a thrown handler error into a 500 WITH a JSON body", async () => {
    // The failure this exists to prevent: an unhandled throw makes Next
    // return a bodyless 500, which clients surface as "Unexpected end of
    // JSON input" instead of a reason.
    const guarded = withRealmGuards("write", async () => {
      throw new Error("rpc exploded");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await guarded(req("11.0.0.1"));

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({
      ok: false,
      reason: "internal",
      message: "rpc exploded",
    });
  });

  it("survives a non-Error throw", async () => {
    const guarded = withRealmGuards("write", async () => {
      throw "a bare string";
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await guarded(req("12.0.0.1"));
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ message: "a bare string" });
  });
});
