import { beforeEach, describe, expect, it, vi } from "vitest";

import { createRng } from "@/lib/engine/rng";
import { rollLoot, type RealmSchemas } from "@/lib/engine/loot";
import type { LootRoll, Preset, Tier } from "@/lib/engine/types";

// lib/env parses publicSchema at module load; realm rate limits cache on first
// read. Set a high write ceiling so the limit never interferes here — it has
// dedicated coverage in lib/server/realm-guards.test.ts.
process.env.NEXT_PUBLIC_CHAIN = "anvil";
process.env.NEXT_PUBLIC_RPC_URL = "http://127.0.0.1:8545";
process.env.REALM_WRITE_RATE_LIMIT_PER_IP_PER_10MIN = "1000";

const STARTER = "0x1111111111111111111111111111111111111111" as const;
const PLAYER_REALM = "0x4444444444444444444444444444444444444444" as const;
const RECIPIENT = "0x2222222222222222222222222222222222222222" as const;
const OWNER = "0x3333333333333333333333333333333333333333" as const;
const DELEGATE = "0x5555555555555555555555555555555555555555" as const;
const TX = "0xfeedface" as const;
const RUN_SEED = `0x${"ab".repeat(32)}` as const;

// --- Boundary mocks ---------------------------------------------------------
// Chain + sqlite edges are stubbed. The validation chain under test —
// Zod schema, the per-preset element refinement, validateLootRoll, the
// registry catalog check — and the real withSignerLock all run for real.

const writeContract = vi.fn();
const getTransactionCount = vi.fn();
const waitForTransactionReceipt = vi.fn();
const getPlayerRealm = vi.fn();
const countDistinctClearers = vi.fn();
const getCatalogEffectsForSlot = vi.fn();

vi.mock("@/lib/server/realm-signer", () => ({
  getOwnerSigner: () => ({
    account: { address: OWNER },
    wallet: { chain: { id: 31337 }, writeContract },
  }),
  getPlayerRealmSigner: () => ({
    account: { address: DELEGATE },
    wallet: { chain: { id: 31337 }, writeContract },
  }),
  getPublicClient: () => ({ getTransactionCount, waitForTransactionReceipt }),
}));

vi.mock("@/lib/server/realm-db", () => ({
  getPlayerRealm: (a: `0x${string}`) => getPlayerRealm(a),
}));

vi.mock("@/lib/contracts/seeded-realms", () => ({
  getSeededRealm: () => STARTER,
  getSeededSchemaIds: () => ({ loot: 7n, clearReceipt: 8n }),
}));

vi.mock("@/lib/reads/realm-tier", async (importOriginal) => {
  // playerRealmMaxTier is a pure curve — keep the real one so the cap maths
  // under test is the production maths.
  const actual =
    await importOriginal<typeof import("@/lib/reads/realm-tier")>();
  return { ...actual, countDistinctClearers: () => countDistinctClearers() };
});

vi.mock("@/lib/contracts/catalog-effects", () => ({
  getCatalogEffectsForSlot: (p: Preset, s: string) =>
    getCatalogEffectsForSlot(p, s),
}));

const { POST } = await import("./route");

// --- Helpers ----------------------------------------------------------------

/**
 * Produces a loot roll straight from the engine, so the body is valid by
 * construction rather than hand-tuned against the catalog tables. Searches
 * seeds for a roll at the wanted tier; the engine is the same code the client
 * runs, so anything it emits must pass the server validator.
 */
function engineRoll(opts: {
  tier: Tier;
  slot: "weapon" | "armor";
  preset: Preset;
  maxTier: Tier;
  difficulty: "trivial" | "standard" | "deep" | "boss";
  effects?: RealmSchemas["weapon"]["catalogEffects"];
  /**
   * Minimum catalog effects the roll must carry. Effect count is itself
   * rolled by tier, so a seed matching the wanted tier may still yield zero
   * effects — which would silently not exercise an effect-related assertion.
   */
  minEffects?: number;
}): LootRoll {
  const schemas: RealmSchemas = {
    weapon: { schemaId: 1, catalogEffects: opts.effects ?? [] },
    armor: { schemaId: 2, catalogEffects: opts.effects ?? [] },
    maxTier: opts.maxTier,
  };
  for (let i = 1; i < 4000; i++) {
    const seed = `0x${i.toString(16).padStart(64, "0")}` as `0x${string}`;
    const roll = rollLoot({
      rng: createRng(seed),
      difficulty: opts.difficulty,
      slot: opts.slot,
      schemas,
      preset: opts.preset,
    });
    if (
      roll.tier === opts.tier &&
      roll.catalogEffects.length >= (opts.minEffects ?? 0)
    ) {
      return roll;
    }
  }
  throw new Error(
    `no seed produced a T${opts.tier} ${opts.slot} roll with >= ${opts.minEffects ?? 0} effects`,
  );
}

/** Serializes a LootRoll to its wire form (nameSeed is a decimal string). */
function wire(loot: LootRoll) {
  return { ...loot, nameSeed: loot.nameSeed.toString() };
}

function body(overrides: Record<string, unknown> = {}) {
  const loot = engineRoll({
    tier: 2,
    slot: "weapon",
    preset: "fantasy",
    maxTier: 2,
    difficulty: "standard",
  });
  return {
    preset: "fantasy",
    recipient: RECIPIENT,
    runSeed: RUN_SEED,
    depth: 3,
    loot: wire(loot),
    realmLabel: "Emberfall",
    assembledName: "Ashen Blade",
    ...overrides,
  };
}

function post(b: unknown): Request {
  return new Request("https://play.example.com/api/realm/mint-loot", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.9",
    },
    body: JSON.stringify(b),
  });
}

describe("POST /api/realm/mint-loot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTransactionCount.mockResolvedValue(11);
    writeContract.mockResolvedValue(TX);
    waitForTransactionReceipt.mockResolvedValue({ status: "success" });
    getPlayerRealm.mockReturnValue(undefined);
    countDistinctClearers.mockResolvedValue(0);
    // Permissive by default; the registry-check test narrows it.
    getCatalogEffectsForSlot.mockReturnValue([
      "lifesteal",
      "armor_pierce",
      "crit_chance",
      "multi_hit",
      "bleed",
      "regen",
      "thorns",
      "dodge_chance",
      "damage_reduction",
    ]);
  });

  describe("body validation", () => {
    it("400s on a malformed body", async () => {
      const res = await POST(post({ preset: "fantasy" }));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ ok: false, reason: "invalid" });
      expect(writeContract).not.toHaveBeenCalled();
    });

    it("400s on an unknown preset", async () => {
      const res = await POST(post(body({ preset: "steampunk" })));
      expect(res.status).toBe(400);
    });

    it("400s on a bad recipient address", async () => {
      const res = await POST(post(body({ recipient: "0xnope" })));
      expect(res.status).toBe(400);
    });

    it("400s when depth is out of range", async () => {
      expect((await POST(post(body({ depth: 0 })))).status).toBe(400);
      expect((await POST(post(body({ depth: 99_999 })))).status).toBe(400);
    });

    it("400s on a cross-preset element", async () => {
      // The superRefine: the element enum accepts every preset's vocabulary,
      // so a fantasy mint carrying a cyberpunk element would otherwise slip
      // through to the on-chain encoder and map to a bogus enum index.
      const loot = engineRoll({
        tier: 2,
        slot: "weapon",
        preset: "fantasy",
        maxTier: 2,
        difficulty: "standard",
      });
      const res = await POST(
        post(body({ loot: { ...wire(loot), element: "incendiary" } })),
      );

      expect(res.status).toBe(400);
      expect((await res.json()).message).toContain("incendiary");
      expect(writeContract).not.toHaveBeenCalled();
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
      const res = await POST(post(body({ realmAddress: STARTER })));
      expect(res.status).toBe(200);
    });

    it("signs starter mints with the static owner key", async () => {
      await POST(post(body()));
      expect(writeContract.mock.calls[0]![0].address).toBe(STARTER);
      expect(getTransactionCount).toHaveBeenCalledWith({
        address: OWNER,
        blockTag: "pending",
      });
    });

    it("signs player-realm mints with the realm's delegate", async () => {
      getPlayerRealm.mockReturnValue({
        address: PLAYER_REALM,
        preset: "fantasy",
        signerIndex: 9,
        lootSchemaId: "42",
        clearReceiptSchemaId: "43",
      });

      const loot = engineRoll({
        tier: 3,
        slot: "weapon",
        preset: "fantasy",
        maxTier: 3,
        difficulty: "boss",
      });
      const res = await POST(
        post(body({ realmAddress: PLAYER_REALM, depth: 10, loot: wire(loot) })),
      );

      expect(res.status).toBe(200);
      expect(writeContract.mock.calls[0]![0].address).toBe(PLAYER_REALM);
      expect(getTransactionCount).toHaveBeenCalledWith({
        address: DELEGATE,
        blockTag: "pending",
      });
      // The realm's own loot schema id wins over the seeded fallback.
      expect(writeContract.mock.calls[0]![0].args[3].extensionSchemaId).toBe(
        42n,
      );
    });
  });

  describe("tier ceiling", () => {
    it("422s a tier above the starter realm's T2 cap", async () => {
      // The load-bearing check: mintAsset is onlyOwner, so contracts never
      // enforce tiers. This route is the only place a forged T5 is stopped.
      const loot = engineRoll({
        tier: 5,
        slot: "weapon",
        preset: "fantasy",
        maxTier: 5,
        difficulty: "boss",
      });
      const res = await POST(post(body({ depth: 10, loot: wire(loot) })));

      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({
        reason: "loot_bounds_violation",
      });
      expect(writeContract).not.toHaveBeenCalled();
    });

    it("422s a tier the realm has not yet earned", async () => {
      // 0 distinct clearers => T3 ceiling, so a T5 must be refused.
      getPlayerRealm.mockReturnValue({
        address: PLAYER_REALM,
        preset: "fantasy",
        signerIndex: 9,
        lootSchemaId: "42",
        clearReceiptSchemaId: "43",
      });
      countDistinctClearers.mockResolvedValue(0);

      const loot = engineRoll({
        tier: 5,
        slot: "weapon",
        preset: "fantasy",
        maxTier: 5,
        difficulty: "boss",
      });
      const res = await POST(
        post(body({ realmAddress: PLAYER_REALM, depth: 10, loot: wire(loot) })),
      );

      expect(res.status).toBe(422);
      expect(writeContract).not.toHaveBeenCalled();
    });

    it("allows T5 once the realm has 50 distinct clearers", async () => {
      getPlayerRealm.mockReturnValue({
        address: PLAYER_REALM,
        preset: "fantasy",
        signerIndex: 9,
        lootSchemaId: "42",
        clearReceiptSchemaId: "43",
      });
      countDistinctClearers.mockResolvedValue(50);

      const loot = engineRoll({
        tier: 5,
        slot: "weapon",
        preset: "fantasy",
        maxTier: 5,
        difficulty: "boss",
      });
      const res = await POST(
        post(body({ realmAddress: PLAYER_REALM, depth: 10, loot: wire(loot) })),
      );

      expect(res.status).toBe(200);
    });
  });

  describe("registry-declared catalog effects", () => {
    it("422s an effect the schema does not declare", async () => {
      // Defends against a tampered client attaching an effect the realm's
      // on-chain schema never declared.
      // Tier must stay inside the starter realm's T2 cap, or the tier check
      // rejects first and this never reaches the catalog check.
      const loot = engineRoll({
        tier: 2,
        slot: "weapon",
        preset: "fantasy",
        maxTier: 2,
        difficulty: "standard",
        effects: ["lifesteal"],
        minEffects: 1,
      });
      expect(loot.catalogEffects[0]!.name).toBe("lifesteal");
      getCatalogEffectsForSlot.mockReturnValue(["bleed"]);

      const res = await POST(post(body({ depth: 3, loot: wire(loot) })));

      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.reason).toBe("loot_bounds_violation");
      expect(json.message).toContain("is not declared");
      expect(writeContract).not.toHaveBeenCalled();
    });
  });

  describe("minting", () => {
    it("200s with a deterministic tokenId and an explicit nonce", async () => {
      const res = await POST(post(body()));

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toMatchObject({ ok: true, txHash: TX });
      expect(json.tokenId).toMatch(/^\d+$/);
      expect(writeContract.mock.calls[0]![0].nonce).toBe(11);
    });

    it("derives the same tokenId for an identical resubmission", async () => {
      // Idempotency claim in the route docblock: retrying the same body must
      // not let a player conjure a second asset.
      const b = body();
      const first = await (await POST(post(b))).json();
      const second = await (await POST(post(b))).json();

      expect(first.tokenId).toBe(second.tokenId);
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
