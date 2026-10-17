import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BossClearEvent } from "@/lib/tutorial/progress";

// lib/env parses publicSchema at module load; the realm rate limits are cached
// on first read. Both must be set before the route module is imported. The
// write ceiling is high here so the rate limit never interferes — it has its
// own coverage in lib/server/realm-guards.test.ts.
process.env.NEXT_PUBLIC_CHAIN = "anvil";
process.env.NEXT_PUBLIC_RPC_URL = "http://127.0.0.1:8545";
process.env.REALM_WRITE_RATE_LIMIT_PER_IP_PER_10MIN = "1000";

const REALM = "0x1111111111111111111111111111111111111111" as const;
const PLAYER = "0x2222222222222222222222222222222222222222" as const;
const OWNER = "0x3333333333333333333333333333333333333333" as const;
const TX = "0xdeadbeef" as const;

// --- Boundary mocks ---------------------------------------------------------
// The signer keyring, the event scan and the starter-realm config are the
// chain/config edges. Everything in between — Zod validation, proof building,
// claim-realm selection, and critically the real `withSignerLock` — runs for
// real, because that is the logic under test.

const writeContract = vi.fn();
const getTransactionCount = vi.fn();
const waitForTransactionReceipt = vi.fn();
const fetchBossClears = vi.fn();

vi.mock("@/lib/server/realm-signer", () => ({
  getOwnerSigner: () => ({
    account: { address: OWNER },
    wallet: { chain: { id: 31337 }, writeContract },
  }),
  getPublicClient: () => ({ getTransactionCount, waitForTransactionReceipt }),
}));

vi.mock("@/lib/reads/boss-clears", () => ({
  fetchBossClears: (p: `0x${string}`) => fetchBossClears(p),
}));

vi.mock("@/lib/contracts/starter-realms", () => ({
  listStarterRealms: () => [{ realm: REALM, preset: "fantasy" }],
}));

const { POST } = await import("./route");

function clear(overrides: Partial<BossClearEvent> = {}): BossClearEvent {
  return {
    realm: REALM,
    preset: "fantasy",
    finalHp: 12,
    turns: 7,
    ts: 1_700_000_000,
    blockNumber: 100n,
    logIndex: 0,
    ...overrides,
  };
}

function post(body: unknown): Request {
  return new Request("https://play.example.com/api/realm/claim-seed", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.5",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/realm/claim-seed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTransactionCount.mockResolvedValue(41);
    writeContract.mockResolvedValue(TX);
    waitForTransactionReceipt.mockResolvedValue({ status: "success" });
    fetchBossClears.mockResolvedValue([clear()]);
  });

  describe("validation", () => {
    it("400s on a malformed body", async () => {
      const res = await POST(post({ player: "not-an-address" }));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ ok: false, reason: "invalid" });
      expect(writeContract).not.toHaveBeenCalled();
    });

    it("400s on a non-JSON body without leaking a SyntaxError shape", async () => {
      const res = await POST(
        new Request("https://play.example.com/api/realm/claim-seed", {
          method: "POST",
          body: "{{{",
        }),
      );
      expect(res.status).toBe(400);
      expect((await res.json()).ok).toBe(false);
    });

    it("ignores any client-supplied proof in the body", async () => {
      // The hardening claim in the route docblock: the body shrank to
      // { player } and a forged proof must not reach the contract.
      await POST(
        post({
          player: PLAYER,
          proof: { metricHashes: ["0xforged"], timestamps: [1], eventReferences: ["0xforged"] },
        }),
      );

      const proofArg = writeContract.mock.calls[0]![0].args[1];
      expect(proofArg.metricHashes).not.toContain("0xforged");
      // Exactly one server-derived clear went in.
      expect(proofArg.metricHashes).toHaveLength(1);
    });
  });

  describe("on-chain eligibility", () => {
    it("409s when the player has no clears on chain", async () => {
      fetchBossClears.mockResolvedValue([]);

      const res = await POST(post({ player: PLAYER }));

      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({
        ok: false,
        reason: "no_clears_on_chain",
      });
      expect(writeContract).not.toHaveBeenCalled();
    });

    it("500s when the cleared realm is absent from starter config", async () => {
      fetchBossClears.mockResolvedValue([
        clear({ realm: "0x9999999999999999999999999999999999999999" }),
      ]);

      const res = await POST(post({ player: PLAYER }));

      expect(res.status).toBe(500);
      expect(await res.json()).toMatchObject({
        reason: "unknown_realm_preset",
      });
      expect(writeContract).not.toHaveBeenCalled();
    });

    it("claims against the latest clear", async () => {
      fetchBossClears.mockResolvedValue([
        clear({ blockNumber: 100n, logIndex: 0 }),
        clear({ blockNumber: 300n, logIndex: 1 }),
        clear({ blockNumber: 200n, logIndex: 9 }),
      ]);

      const res = await POST(post({ player: PLAYER }));

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ ok: true, realm: REALM });
      // Proof carries all three clears, deterministically ordered.
      expect(writeContract.mock.calls[0]![0].args[1].timestamps).toEqual([
        100n,
        200n,
        300n,
      ]);
    });
  });

  describe("nonce handling", () => {
    it("passes an explicit nonce read from the pending block", async () => {
      // Regression guard for the nonce race: letting viem resolve the nonce
      // internally moves the read outside withSignerLock, so a claim racing a
      // starter-realm mint-loot (same getOwnerSigner key) could reuse a nonce
      // and revert "nonce too low".
      await POST(post({ player: PLAYER }));

      expect(getTransactionCount).toHaveBeenCalledWith({
        address: OWNER,
        blockTag: "pending",
      });
      expect(writeContract.mock.calls[0]![0].nonce).toBe(41);
    });

    it("serializes concurrent claims on the same signer key", async () => {
      // Prove the lock actually holds: with the read and the broadcast
      // interleaved, both callers would observe the same nonce. Track the
      // order of operations and assert they never overlap.
      const order: string[] = [];
      getTransactionCount.mockImplementation(async () => {
        order.push("read");
        await new Promise((r) => setTimeout(r, 5));
        return 41;
      });
      writeContract.mockImplementation(async () => {
        order.push("write");
        return TX;
      });

      await Promise.all([
        POST(post({ player: PLAYER })),
        POST(post({ player: PLAYER })),
      ]);

      // Serialized => read,write,read,write. Interleaved would be
      // read,read,write,write.
      expect(order).toEqual(["read", "write", "read", "write"]);
    });
  });

  describe("receipt handling", () => {
    it("200s with the tx hash on success", async () => {
      const res = await POST(post({ player: PLAYER }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, txHash: TX, realm: REALM });
    });

    it("502s when the tx reverts", async () => {
      waitForTransactionReceipt.mockResolvedValue({ status: "reverted" });

      const res = await POST(post({ player: PLAYER }));

      expect(res.status).toBe(502);
      expect(await res.json()).toMatchObject({ reason: "tx_reverted" });
    });

    it("504s WITH a JSON body when the receipt wait times out", async () => {
      // The item-2 fix. This await was previously unguarded, so an RPC
      // timeout threw into a bodyless 500 and the client's res.json() blew up
      // with "Unexpected end of JSON input" — on the one action a player
      // cannot safely retry blind. The tx hash must survive into the body.
      waitForTransactionReceipt.mockRejectedValue(new Error("timed out"));

      const res = await POST(post({ player: PLAYER }));

      expect(res.status).toBe(504);
      const body = await res.json();
      expect(body).toMatchObject({ ok: false, reason: "receipt_timeout" });
      expect(body.message).toContain(TX);
    });

    it("500s when the broadcast itself fails", async () => {
      writeContract.mockRejectedValue(new Error("insufficient funds"));

      const res = await POST(post({ player: PLAYER }));

      expect(res.status).toBe(500);
      expect(await res.json()).toMatchObject({ reason: "tx_failed" });
    });
  });
});
