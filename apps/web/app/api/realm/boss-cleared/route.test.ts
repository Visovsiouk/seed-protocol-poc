import { beforeEach, describe, expect, it, vi } from "vitest";

// lib/env parses publicSchema at module load; realm rate limits cache on first
// read. High write ceiling so the limit never interferes — it has dedicated
// coverage in lib/server/realm-guards.test.ts.
process.env.NEXT_PUBLIC_CHAIN = "anvil";
process.env.NEXT_PUBLIC_RPC_URL = "http://127.0.0.1:8545";
process.env.REALM_WRITE_RATE_LIMIT_PER_IP_PER_10MIN = "1000";

const STARTER = "0x1111111111111111111111111111111111111111" as const;
const PLAYER_REALM = "0x4444444444444444444444444444444444444444" as const;
const PLAYER = "0x2222222222222222222222222222222222222222" as const;
const OWNER = "0x3333333333333333333333333333333333333333" as const;
const DELEGATE = "0x5555555555555555555555555555555555555555" as const;
const ASSET = "0x6666666666666666666666666666666666666666" as const;
const TX = "0xc0ffee" as const;
const RUN_SEED = `0x${"cd".repeat(32)}` as const;
const ZERO = "0x0000000000000000000000000000000000000000" as const;

// --- Boundary mocks ---------------------------------------------------------
// Chain + sqlite edges only. Zod validation, tokenId derivation, metadata
// building and the real withSignerLock all execute.

const writeContract = vi.fn();
const getTransactionCount = vi.fn();
const waitForTransactionReceipt = vi.fn();
const readContract = vi.fn();
const getPlayerRealm = vi.fn();
const getSeededRealm = vi.fn();
const getSeededSchemaIds = vi.fn();

vi.mock("@/lib/server/realm-signer", () => ({
  getOwnerSigner: () => ({
    account: { address: OWNER },
    wallet: { chain: { id: 31337 }, writeContract },
  }),
  getPlayerRealmSigner: () => ({
    account: { address: DELEGATE },
    wallet: { chain: { id: 31337 }, writeContract },
  }),
  getPublicClient: () => ({
    getTransactionCount,
    waitForTransactionReceipt,
    readContract,
  }),
}));

vi.mock("@/lib/server/realm-db", () => ({
  getPlayerRealm: (a: `0x${string}`) => getPlayerRealm(a),
}));

vi.mock("@/lib/contracts/seeded-realms", () => ({
  getSeededRealm: (p: string) => getSeededRealm(p),
  getSeededSchemaIds: (p: string) => getSeededSchemaIds(p),
}));

vi.mock("@/lib/contracts/addresses", () => ({ getAddress: () => ASSET }));

const { POST } = await import("./route");

const PLAYER_ROW = {
  address: PLAYER_REALM,
  preset: "fantasy" as const,
  signerIndex: 9,
  lootSchemaId: "42",
  clearReceiptSchemaId: "43",
};

function body(overrides: Record<string, unknown> = {}) {
  return {
    preset: "fantasy",
    player: PLAYER,
    runSeed: RUN_SEED,
    bossId: "forest_hag",
    turns: 7,
    finalHp: 12,
    realmLabel: "Emberfall",
    ...overrides,
  };
}

function post(b: unknown): Request {
  return new Request("https://play.example.com/api/realm/boss-cleared", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.7",
    },
    body: JSON.stringify(b),
  });
}

describe("POST /api/realm/boss-cleared", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTransactionCount.mockResolvedValue(21);
    writeContract.mockResolvedValue(TX);
    waitForTransactionReceipt.mockResolvedValue({ status: "success" });
    // No pre-existing receipt for this tokenId.
    readContract.mockResolvedValue(0n);
    getPlayerRealm.mockReturnValue(undefined);
    getSeededRealm.mockReturnValue(STARTER);
    getSeededSchemaIds.mockReturnValue({ loot: 7n, clearReceipt: 8n });
  });

  describe("body validation", () => {
    it("400s on a malformed body", async () => {
      const res = await POST(post({ preset: "fantasy" }));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ ok: false, reason: "invalid" });
      expect(writeContract).not.toHaveBeenCalled();
    });

    it("400s on a bad player address", async () => {
      expect((await POST(post(body({ player: "0xnope" })))).status).toBe(400);
    });

    it("400s on a runSeed that is not 32 bytes", async () => {
      expect((await POST(post(body({ runSeed: "0xabcd" })))).status).toBe(400);
    });

    it("400s when turns is below 1", async () => {
      // A real clear consumes at least one round.
      expect((await POST(post(body({ turns: 0 })))).status).toBe(400);
    });

    it("accepts finalHp of 0", async () => {
      // Deliberately legal: thorns reflect even when the incoming hit drops
      // the player to 0, so the monster can die the same turn the player does.
      expect((await POST(post(body({ finalHp: 0 })))).status).toBe(200);
    });

    it("400s when finalHp is negative", async () => {
      expect((await POST(post(body({ finalHp: -1 })))).status).toBe(400);
    });
  });

  describe("realm routing", () => {
    it("404s for a realmAddress that is neither registered nor the starter", async () => {
      const res = await POST(
        post(body({ realmAddress: "0x9999999999999999999999999999999999999999" })),
      );

      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({ reason: "realm_unknown" });
      expect(writeContract).not.toHaveBeenCalled();
    });

    it("accepts the starter address as its own realmAddress", async () => {
      expect((await POST(post(body({ realmAddress: STARTER })))).status).toBe(
        200,
      );
    });

    it("409s when the preset's realm is not seeded on this chain", async () => {
      getSeededRealm.mockReturnValue(ZERO);

      const res = await POST(post(body()));

      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ reason: "realm_not_seeded" });
      expect(writeContract).not.toHaveBeenCalled();
    });

    it("409s when no clearReceipt schema is registered", async () => {
      getSeededSchemaIds.mockReturnValue({ loot: 7n, clearReceipt: 0n });

      const res = await POST(post(body()));

      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ reason: "schema_not_seeded" });
      expect(writeContract).not.toHaveBeenCalled();
    });

    it("signs starter clears with the static owner key", async () => {
      await POST(post(body()));

      expect(writeContract.mock.calls[0]![0].address).toBe(STARTER);
      expect(getTransactionCount).toHaveBeenCalledWith({
        address: OWNER,
        blockTag: "pending",
      });
      // Seeded clearReceipt id is the fallback for starter realms.
      expect(writeContract.mock.calls[0]![0].args[3].extensionSchemaId).toBe(
        8n,
      );
    });

    it("signs player-realm clears with the delegate and the realm's own schema", async () => {
      getPlayerRealm.mockReturnValue(PLAYER_ROW);

      const res = await POST(post(body({ realmAddress: PLAYER_REALM })));

      expect(res.status).toBe(200);
      expect(writeContract.mock.calls[0]![0].address).toBe(PLAYER_REALM);
      expect(getTransactionCount).toHaveBeenCalledWith({
        address: DELEGATE,
        blockTag: "pending",
      });
      expect(writeContract.mock.calls[0]![0].args[3].extensionSchemaId).toBe(
        43n,
      );
    });

    it("falls back to the seeded schema for a legacy row without its own id", async () => {
      getPlayerRealm.mockReturnValue({
        ...PLAYER_ROW,
        clearReceiptSchemaId: null,
      });

      await POST(post(body({ realmAddress: PLAYER_REALM })));

      expect(writeContract.mock.calls[0]![0].args[3].extensionSchemaId).toBe(
        8n,
      );
    });
  });

  describe("idempotency", () => {
    it("returns 200 without minting when the receipt already exists", async () => {
      // Deterministic tokenId means a double-tap or network retry must not
      // produce a second on-chain mint.
      readContract.mockResolvedValue(1n);

      const res = await POST(post(body()));

      expect(res.status).toBe(200);
      expect((await res.json()).ok).toBe(true);
      expect(writeContract).not.toHaveBeenCalled();
    });

    it("derives a stable tokenId across resubmissions", async () => {
      const b = body();
      const first = await (await POST(post(b))).json();
      const second = await (await POST(post(b))).json();

      expect(first.tokenId).toBe(second.tokenId);
    });

    it("varies the tokenId by runSeed", async () => {
      const a = await (await POST(post(body()))).json();
      const b = await (
        await POST(post(body({ runSeed: `0x${"ef".repeat(32)}` })))
      ).json();

      expect(a.tokenId).not.toBe(b.tokenId);
    });

    it("fails open and still mints when the balance probe errors", async () => {
      // Documented choice: a duplicate receipt beats a broken mint flow.
      readContract.mockRejectedValue(new Error("rpc down"));

      const res = await POST(post(body()));

      expect(res.status).toBe(200);
      expect(writeContract).toHaveBeenCalledOnce();
    });
  });

  describe("nonce handling", () => {
    it("passes an explicit pending nonce", async () => {
      await POST(post(body()));

      expect(getTransactionCount).toHaveBeenCalledWith({
        address: OWNER,
        blockTag: "pending",
      });
      expect(writeContract.mock.calls[0]![0].nonce).toBe(21);
    });

    it("serializes against concurrent clears on the same key", async () => {
      // The end-of-descent case: the loot batch and this clear-receipt mint
      // fire near-simultaneously on the same signer.
      const order: string[] = [];
      getTransactionCount.mockImplementation(async () => {
        order.push("read");
        await new Promise((r) => setTimeout(r, 5));
        return 21;
      });
      writeContract.mockImplementation(async () => {
        order.push("write");
        return TX;
      });

      await Promise.all([
        POST(post(body())),
        POST(post(body({ runSeed: `0x${"11".repeat(32)}` }))),
      ]);

      expect(order).toEqual(["read", "write", "read", "write"]);
    });
  });

  describe("receipt handling", () => {
    it("200s with tokenId and txHash on success", async () => {
      const res = await POST(post(body()));

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toMatchObject({ ok: true, txHash: TX });
      expect(json.tokenId).toMatch(/^\d+$/);
    });

    it("502s when the mint reverts", async () => {
      waitForTransactionReceipt.mockResolvedValue({ status: "reverted" });

      const res = await POST(post(body()));

      expect(res.status).toBe(502);
      expect(await res.json()).toMatchObject({ reason: "tx_reverted" });
    });

    it("504s with the tx hash when the receipt wait times out", async () => {
      waitForTransactionReceipt.mockRejectedValue(new Error("timed out"));

      const res = await POST(post(body()));

      expect(res.status).toBe(504);
      const json = await res.json();
      expect(json.reason).toBe("receipt_timeout");
      expect(json.message).toContain(TX);
    });

    it("500s when the broadcast fails", async () => {
      writeContract.mockRejectedValue(new Error("nonce too low"));

      const res = await POST(post(body()));

      expect(res.status).toBe(500);
      expect(await res.json()).toMatchObject({ reason: "tx_failed" });
    });
  });
});
