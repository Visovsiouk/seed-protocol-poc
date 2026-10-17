import { beforeEach, describe, expect, it, vi } from "vitest";

// lib/env parses publicSchema at module load; realm rate limits cache on first
// read. High write ceiling so the limit never interferes — it has dedicated
// coverage in lib/server/realm-guards.test.ts.
process.env.NEXT_PUBLIC_CHAIN = "anvil";
process.env.NEXT_PUBLIC_RPC_URL = "http://127.0.0.1:8545";
process.env.REALM_WRITE_RATE_LIMIT_PER_IP_PER_10MIN = "1000";

// Hex letters are deliberate: digit-only addresses make `.toUpperCase()` a
// no-op, which would let the case-insensitivity tests below pass vacuously.
const REALM = "0x44ccdd4444444444444444444444444444444444" as const;
const OWNER = "0x22aabb2222222222222222222222222222222222" as const;
const OTHER = "0x77eeff7777777777777777777777777777777777" as const;
const REGISTRY = "0x6666666666666666666666666666666666666666" as const;

/** Uppercases the hex body, leaving the `0x` prefix intact. */
const mixedCase = (a: `0x${string}`) =>
  `0x${a.slice(2).toUpperCase()}` as `0x${string}`;

/** Deterministic delegate address per HD index, so races are observable. */
const signerFor = (i: number) =>
  `0x${i.toString(16).padStart(40, "0")}` as `0x${string}`;

// --- Boundary mocks ---------------------------------------------------------
// Chain + sqlite edges only. Zod validation, the profanity gate, the accent
// allow-list and the tier curve all execute for real.

const readContract = vi.fn();
const getPlayerRealm = vi.fn();
const getNextSignerIndex = vi.fn();
const insertPlayerRealm = vi.fn();

vi.mock("@/lib/server/realm-signer", () => ({
  derivePlayerRealmSignerAddress: (i: number) => signerFor(i),
  getPublicClient: () => ({ readContract }),
}));

vi.mock("@/lib/server/realm-db", () => ({
  getPlayerRealm: (a: `0x${string}`) => getPlayerRealm(a),
  getNextSignerIndex: () => getNextSignerIndex(),
  insertPlayerRealm: (row: unknown) => insertPlayerRealm(row),
}));

vi.mock("@/lib/contracts/addresses", () => ({ getAddress: () => REGISTRY }));

const { POST } = await import("./route");

/**
 * Builds the `getSchema` tuple the route destructures: index 3 is the
 * registering ecosystem, index 6 is `exists`.
 */
function schemaTuple(createdBy: `0x${string}`, exists = true) {
  return ["name", "uri", 0n, createdBy, OWNER, 0n, exists] as const;
}

/** Default chain state: owner matches, delegate is authorized, schemas valid. */
function stubChain(
  opts: {
    owner?: `0x${string}`;
    isMinter?: boolean;
    schemaOwner?: `0x${string}`;
    schemaExists?: boolean;
  } = {},
) {
  readContract.mockImplementation(async (args: { functionName: string }) => {
    switch (args.functionName) {
      case "owner":
        return opts.owner ?? OWNER;
      case "minters":
        return opts.isMinter ?? true;
      case "getSchema":
        return schemaTuple(opts.schemaOwner ?? REALM, opts.schemaExists ?? true);
      default:
        throw new Error(`unexpected read: ${args.functionName}`);
    }
  });
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    realmAddress: REALM,
    owner: OWNER,
    preset: "fantasy",
    bossId: "forest_hag",
    name: "Emberfall",
    ...overrides,
  };
}

function post(b: unknown): Request {
  return new Request("https://play.example.com/api/realm/register", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.11",
    },
    body: JSON.stringify(b),
  });
}

describe("POST /api/realm/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPlayerRealm.mockReturnValue(undefined);
    getNextSignerIndex.mockReturnValue(4);
    insertPlayerRealm.mockImplementation((row) => ({
      ...(row as object),
      createdAt: 1_700_000_000,
    }));
    stubChain();
  });

  describe("body validation", () => {
    it("400s on a malformed body", async () => {
      const res = await POST(post({ realmAddress: REALM }));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ ok: false, reason: "invalid" });
      expect(insertPlayerRealm).not.toHaveBeenCalled();
    });

    it("400s on an over-long name", async () => {
      expect((await POST(post(body({ name: "x".repeat(65) })))).status).toBe(
        400,
      );
    });

    it("400s on a profane realm name", async () => {
      // The obscenity gate — realm names are rendered to every other player.
      const res = await POST(post(body({ name: "fucking realm" })));
      expect(res.status).toBe(400);
      expect(insertPlayerRealm).not.toHaveBeenCalled();
    });

    it("400s on an accent outside the curated swatches", async () => {
      // Closed allow-list: the accent lands in the --color-preset-accent
      // cascade, so an arbitrary string would be CSS injection.
      const res = await POST(
        post(body({ accent: "red; background: url(evil)" })),
      );
      expect(res.status).toBe(400);
      expect(insertPlayerRealm).not.toHaveBeenCalled();
    });

    it("accepts a curated accent", async () => {
      const res = await POST(post(body({ accent: "#c9a14a" })));
      expect(res.status).toBe(200);
      expect((await res.json()).realm.accent).toBe("#c9a14a");
    });

    it("accepts a null accent as inherit-the-default", async () => {
      const res = await POST(post(body({ accent: null })));
      expect(res.status).toBe(200);
      expect((await res.json()).realm.accent).toBeNull();
    });

    it("400s on a non-decimal schema id", async () => {
      // uint256 ids overflow JS number, so they arrive as decimal strings.
      expect(
        (await POST(post(body({ lootSchemaId: "0x2a" })))).status,
      ).toBe(400);
    });

    it("422s on a boss absent from the preset's flavor bank", async () => {
      // Otherwise the play route 500s later looking for a missing boss def.
      const res = await POST(post(body({ bossId: "cthulhu" })));

      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ reason: "boss_unknown" });
      expect(insertPlayerRealm).not.toHaveBeenCalled();
    });

    it("422s on a boss from a different preset", async () => {
      const res = await POST(
        post(body({ preset: "cyberpunk", bossId: "forest_hag" })),
      );
      expect(res.status).toBe(422);
    });
  });

  describe("idempotency", () => {
    it("409s when the realm is already registered", async () => {
      getPlayerRealm.mockReturnValue({ address: REALM });

      const res = await POST(post(body()));

      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ reason: "already_registered" });
      expect(insertPlayerRealm).not.toHaveBeenCalled();
    });
  });

  describe("on-chain verification", () => {
    it("403s when the claimed owner is not the on-chain owner", async () => {
      // No spoofing: royalty and dashboard rights are pinned to owner().
      stubChain({ owner: OTHER });

      const res = await POST(post(body()));

      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ reason: "owner_mismatch" });
      expect(insertPlayerRealm).not.toHaveBeenCalled();
    });

    it("compares owners case-insensitively", async () => {
      // `owner()` comes back checksummed from viem while the body may carry
      // any casing; a case-sensitive compare would 403 every legitimate
      // registration.
      stubChain({ owner: mixedCase(OWNER) });
      expect(mixedCase(OWNER)).not.toBe(OWNER); // guard: casing really differs
      expect((await POST(post(body()))).status).toBe(200);
    });

    it("409s not_authorized when setMinter was never signed", async () => {
      // No half-authorized rows: the server must not hold a delegate the
      // player never approved.
      stubChain({ isMinter: false });

      const res = await POST(post(body()));

      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ reason: "not_authorized" });
      expect(insertPlayerRealm).not.toHaveBeenCalled();
    });

    it("409s race with retryWith when another create took the index", async () => {
      // The player authorized the delegate for index 4, but index 5 is now
      // next — so they signed for a stale address and must re-sign.
      stubChain({ isMinter: false });
      getNextSignerIndex.mockReturnValueOnce(4).mockReturnValueOnce(5);

      const res = await POST(post(body()));

      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.reason).toBe("race");
      expect(json.retryWith).toEqual({
        signerIndex: 5,
        signerAddress: signerFor(5),
      });
    });

    it("502s when the realm state read fails", async () => {
      readContract.mockRejectedValue(new Error("rpc down"));

      const res = await POST(post(body()));

      expect(res.status).toBe(502);
      expect(await res.json()).toMatchObject({ reason: "internal" });
    });

    it("verifies the delegate derived from the just-claimed index", async () => {
      getNextSignerIndex.mockReturnValue(11);

      await POST(post(body()));

      const mintersCall = readContract.mock.calls.find(
        (c) => c[0].functionName === "minters",
      );
      expect(mintersCall![0].args).toEqual([signerFor(11)]);
    });
  });

  describe("schema ownership", () => {
    it("422s a schema registered by a different ecosystem", async () => {
      // Otherwise a crafted POST could point this realm's receipts at
      // someone else's schema.
      stubChain({ schemaOwner: OTHER });

      const res = await POST(post(body({ lootSchemaId: "42" })));

      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.reason).toBe("schema_invalid");
      expect(json.message).toContain("was registered by");
      expect(insertPlayerRealm).not.toHaveBeenCalled();
    });

    it("422s a schema that does not exist", async () => {
      stubChain({ schemaExists: false });

      const res = await POST(post(body({ clearReceiptSchemaId: "99" })));

      expect(res.status).toBe(422);
      expect((await res.json()).message).toContain("does not exist");
    });

    it("persists verified schema ids", async () => {
      const res = await POST(
        post(body({ lootSchemaId: "42", clearReceiptSchemaId: "43" })),
      );

      expect(res.status).toBe(200);
      expect(insertPlayerRealm).toHaveBeenCalledWith(
        expect.objectContaining({ lootSchemaId: "42", clearReceiptSchemaId: "43" }),
      );
    });

    it("skips schema verification entirely when both ids are absent", async () => {
      // Back-compat for realms created before per-realm schemas landed.
      await POST(post(body()));

      expect(
        readContract.mock.calls.some((c) => c[0].functionName === "getSchema"),
      ).toBe(false);
    });
  });

  describe("persistence", () => {
    it("200s with the stored row and a fresh-realm T3 ceiling", async () => {
      const res = await POST(post(body()));

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        ok: true,
        realm: {
          address: REALM,
          owner: OWNER,
          preset: "fantasy",
          bossId: "forest_hag",
          name: "Emberfall",
          signerIndex: 4,
          signerAddress: signerFor(4),
          // A realm with zero clearers starts at the T3 base.
          maxTier: 3,
        },
      });
    });

    it("lowercases the stored address and owner", async () => {
      // Every lookup keys off the lowercased address (mint-loot, boss-cleared,
      // /meta), so a mixed-case row would be invisible to all of them.
      expect(mixedCase(REALM)).not.toBe(REALM); // guard: casing really differs

      await POST(
        post(body({ realmAddress: mixedCase(REALM), owner: mixedCase(OWNER) })),
      );

      expect(insertPlayerRealm).toHaveBeenCalledWith(
        expect.objectContaining({ address: REALM, owner: OWNER }),
      );
    });

    it("409s race with retryWith on a UNIQUE constraint violation", async () => {
      // The UNIQUE index on signer_index is the real serialization point.
      insertPlayerRealm.mockImplementation(() => {
        throw new Error("UNIQUE constraint failed: player_realms.signer_index");
      });
      getNextSignerIndex.mockReturnValueOnce(4).mockReturnValueOnce(6);

      const res = await POST(post(body()));

      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.reason).toBe("race");
      expect(json.retryWith).toEqual({
        signerIndex: 6,
        signerAddress: signerFor(6),
      });
    });

    it("500s on an unrelated insert failure", async () => {
      insertPlayerRealm.mockImplementation(() => {
        throw new Error("disk I/O error");
      });

      const res = await POST(post(body()));

      expect(res.status).toBe(500);
      expect(await res.json()).toMatchObject({ reason: "internal" });
    });
  });
});
