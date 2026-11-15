/**
 * Tests for the kill-receipt queue.
 *
 * The queue exists because batch-minting one receipt per contributor is
 * partially failure-prone, so the cases that matter are the partial ones: a
 * crash halfway, a single recipient failing, a receipt that landed on chain
 * but whose db write was lost, and a second pass after any of those. A
 * "happy path mints everything" test would not have caught a single one.
 *
 * The chain is injected, so none of this needs a node.
 */

import Database, { type Database as DatabaseType } from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  advanceAttempt,
  correctCurrentHp,
  grantAttempt,
  listReceipts,
  migrateRaidTables,
  openAttempt,
  openNextEdition,
  pendingReceipts,
  editionsWithPendingReceipts,
} from "@/lib/server/raid-store";
import {
  RECONCILED,
  drainReceipts,
  enqueueForEdition,
  type ReceiptChain,
} from "./receipt-queue";
import { deriveRaidReceiptTokenId, shareBps } from "./receipt-derive";

const ALICE = "0x00000000000000000000000000000000000000a1" as `0x${string}`;
const BOB = "0x00000000000000000000000000000000000000b2" as `0x${string}`;
const CAROL = "0x00000000000000000000000000000000000000c3" as `0x${string}`;
const REALM = "0x0000000000000000000000000000000000000009" as `0x${string}`;

const EDITION_HP = 1_000;

let db: DatabaseType;
let grantSeq = 0;

/** Run one attempt for `player` dealing `damage`. */
function fight(player: `0x${string}`, damage: number) {
  grantAttempt(db, {
    grantKey: `g${grantSeq++}`,
    player,
    realm: REALM,
  });
  const at = openAttempt(db, { edition: 1, player, turnLimit: 30 });
  return advanceAttempt(db, {
    edition: 1,
    attemptId: at.attemptId,
    player,
    cumulativeDamage: damage,
    turns: 30,
    survived: false,
  });
}

/** A chain that always succeeds, recording what it was asked to mint. */
function okChain(): ReceiptChain & { calls: bigint[] } {
  const calls: bigint[] = [];
  return {
    calls,
    alreadyMinted: async () => false,
    mint: async ({ tokenId }) => {
      calls.push(tokenId);
      return `0x${tokenId.toString(16).padStart(64, "0").slice(0, 64)}` as `0x${string}`;
    },
  };
}

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrateRaidTables(db);
  openNextEdition(db, EDITION_HP);
  grantSeq = 0;
});

describe("shareBps", () => {
  it("floors, so shares can never sum above 100%", () => {
    expect(shareBps(1_000, 1_000)).toBe(10_000);
    expect(shareBps(333, 1_000)).toBe(3_330);
    // 1/3 of 10000 is 3333.33 — floored, not rounded up.
    expect(shareBps(1, 3)).toBe(3_333);
    expect(shareBps(0, 1_000)).toBe(0);
  });

  it("is 0 rather than NaN for an impossible pool", () => {
    expect(shareBps(10, 0)).toBe(0);
  });
});

describe("deriveRaidReceiptTokenId", () => {
  it("is deterministic in (edition, player)", () => {
    const a = deriveRaidReceiptTokenId({ edition: 1, player: ALICE });
    expect(deriveRaidReceiptTokenId({ edition: 1, player: ALICE })).toBe(a);
    expect(deriveRaidReceiptTokenId({ edition: 2, player: ALICE })).not.toBe(a);
    expect(deriveRaidReceiptTokenId({ edition: 1, player: BOB })).not.toBe(a);
  });
});

describe("enqueueForEdition", () => {
  it("refuses an edition that still stands", () => {
    fight(ALICE, 100);
    expect(() => enqueueForEdition(db, 1)).toThrow(/still stands/);
  });

  it("owes one receipt per contributor, not one per attempt", () => {
    fight(ALICE, 300);
    fight(ALICE, 200);
    fight(BOB, 500);

    const owed = enqueueForEdition(db, 1);
    expect(owed).toHaveLength(2);
    const alice = owed.find((r) => r.player === ALICE)!;
    expect(alice).toMatchObject({
      damage: 500,
      attempts: 2,
      shareBps: 5_000,
      txHash: null,
    });
  });

  it("puts the killing blow first, then the heaviest", () => {
    fight(ALICE, 300);
    fight(CAROL, 200);
    fight(BOB, 500); // takes it to 0
    const owed = enqueueForEdition(db, 1);
    expect(owed[0]!.player).toBe(BOB);
    expect(owed[0]!.killingBlow).toBe(true);
    expect(owed[1]!.player).toBe(ALICE);
    expect(owed[2]!.player).toBe(CAROL);
  });

  it("skips a contributor who dealt nothing", () => {
    fight(ALICE, 0);
    fight(BOB, 1_000);
    const owed = enqueueForEdition(db, 1);
    expect(owed.map((r) => r.player)).toEqual([BOB]);
  });

  it("is idempotent, and does not un-mint anything already paid", async () => {
    fight(ALICE, 600);
    fight(BOB, 400);
    enqueueForEdition(db, 1);
    await drainReceipts(db, 1, okChain(), EDITION_HP, 123);
    expect(pendingReceipts(db, 1)).toHaveLength(0);

    // A second kill notification, or a retry.
    enqueueForEdition(db, 1);
    expect(pendingReceipts(db, 1)).toHaveLength(0);
    expect(listReceipts(db, 1).every((r) => r.txHash !== null)).toBe(true);
  });
});

describe("drainReceipts", () => {
  beforeEach(() => {
    fight(ALICE, 600);
    fight(BOB, 400);
    enqueueForEdition(db, 1);
  });

  it("mints each receipt once and clears the queue", async () => {
    const chain = okChain();
    const res = await drainReceipts(db, 1, chain, EDITION_HP, 123);
    expect(res).toMatchObject({ minted: 2, skipped: 0, remaining: 0 });
    expect(res.failed).toEqual([]);
    expect(chain.calls).toHaveLength(2);
    expect(new Set(chain.calls).size).toBe(2);
  });

  it("does nothing on a second pass", async () => {
    await drainReceipts(db, 1, okChain(), EDITION_HP, 123);
    const chain = okChain();
    const res = await drainReceipts(db, 1, chain, EDITION_HP, 123);
    expect(res).toMatchObject({ minted: 0, remaining: 0 });
    expect(chain.calls).toEqual([]);
  });

  it("resumes after a crash, re-sending only what is still owed", async () => {
    // First pass dies after the first mint.
    const dying: ReceiptChain = {
      alreadyMinted: async () => false,
      mint: vi
        .fn()
        .mockResolvedValueOnce(`0x${"a".repeat(64)}` as `0x${string}`)
        .mockRejectedValueOnce(new Error("RPC died")),
    };
    const first = await drainReceipts(db, 1, dying, EDITION_HP, 123);
    expect(first).toMatchObject({ minted: 1, remaining: 1 });
    expect(first.failed).toHaveLength(1);

    // Second pass picks up exactly the leftover.
    const chain = okChain();
    const second = await drainReceipts(db, 1, chain, EDITION_HP, 123);
    expect(second).toMatchObject({ minted: 1, remaining: 0 });
    expect(chain.calls).toHaveLength(1);
    expect(listReceipts(db, 1).every((r) => r.txHash !== null)).toBe(true);
  });

  it("does not let one bad recipient hold up the others", async () => {
    const chain: ReceiptChain = {
      alreadyMinted: async () => false,
      // The first in order (Bob, the killing blow) fails.
      mint: vi
        .fn()
        .mockRejectedValueOnce(new Error("reverted"))
        .mockResolvedValueOnce(`0x${"b".repeat(64)}` as `0x${string}`),
    };
    const res = await drainReceipts(db, 1, chain, EDITION_HP, 123);
    expect(res.minted).toBe(1);
    expect(res.failed).toHaveLength(1);
    expect(res.remaining).toBe(1);
  });

  it("reconciles a receipt already on chain instead of minting twice", async () => {
    const chain: ReceiptChain = {
      alreadyMinted: async () => true,
      mint: vi.fn(),
    };
    const res = await drainReceipts(db, 1, chain, EDITION_HP, 123);
    expect(res).toMatchObject({ minted: 0, skipped: 2, remaining: 0 });
    expect(chain.mint).not.toHaveBeenCalled();
    // Marked with the sentinel, so an operator can tell "we minted this"
    // from "we found it already there".
    expect(listReceipts(db, 1).every((r) => r.txHash === RECONCILED)).toBe(true);
  });

  it("reports which editions still owe receipts", async () => {
    expect(editionsWithPendingReceipts(db)).toEqual([1]);
    await drainReceipts(db, 1, okChain(), EDITION_HP, 123);
    expect(editionsWithPendingReceipts(db)).toEqual([]);
  });

  it("survives an edition felled by correction rather than a blow", async () => {
    // `--set-hp 0` is a legitimate operator path, and it produces a felled
    // edition with no killing-blow row at all.
    const db2 = new Database(":memory:");
    migrateRaidTables(db2);
    openNextEdition(db2, 500);
    grantAttempt(db2, { grantKey: "x", player: ALICE, realm: REALM });
    const at = openAttempt(db2, { edition: 1, player: ALICE, turnLimit: 30 });
    advanceAttempt(db2, {
      edition: 1,
      attemptId: at.attemptId,
      player: ALICE,
      cumulativeDamage: 200,
      turns: 10,
      survived: true,
    });
    correctCurrentHp(db2, 1, 0);

    const owed = enqueueForEdition(db2, 1);
    expect(owed).toHaveLength(1);
    expect(owed[0]!.killingBlow).toBe(false);
    // Share is of the pool, not of what was recorded — so a corrected
    // edition pays out less than 100% in total, which is the honest
    // reflection of an intervention having happened.
    expect(owed[0]!.shareBps).toBe(4_000);
    db2.close();
  });
});
