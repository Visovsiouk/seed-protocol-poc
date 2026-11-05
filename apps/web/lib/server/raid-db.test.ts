/**
 * Tests for the app-facing raid wrapper — specifically the HP-bar cache.
 *
 * The store's own tests cover the SQL. What only exists here is the memory
 * cache, and a cache that fails to invalidate is exactly the bug that would
 * not show up in a store test: every query would still be correct, and the
 * bar would simply stop moving. So these go through `raid-db.ts` and assert
 * that a write is visible to the next read.
 *
 * `REALMS_DB_PATH` is set before the dynamic import because `sqlite.ts`
 * resolves the path at call time but caches the connection per path — the
 * env var has to be in place before the first `db()` call, which the import
 * itself does not make but the first exported function does.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let dir: string;
let raid: typeof import("./raid-db");

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "raid-db-test-"));
  process.env.REALMS_DB_PATH = join(dir, "realms.db");
  // `raid-db.ts` reads the gate threshold from `lib/env`, which parses its
  // public schema at module load — so these have to exist before the import
  // below, the same reason `lib/env.test.ts` sets them at its top level.
  process.env.NEXT_PUBLIC_CHAIN ??= "anvil";
  process.env.NEXT_PUBLIC_RPC_URL ??= "http://127.0.0.1:8545";
  // A small threshold so the gate can actually be crossed here. Set before
  // the import because `getRaidEnv` caches on first read.
  process.env.RAID_UNLOCK_T5_CLEARS = "3";
  raid = await import("./raid-db");
});

afterAll(async () => {
  const { closeRealmsDb } = await import("./sqlite");
  closeRealmsDb();
  delete process.env.REALMS_DB_PATH;
  delete process.env.RAID_UNLOCK_T5_CLEARS;
  rmSync(dir, { recursive: true, force: true });
});

const ALICE = "0x00000000000000000000000000000000000000a1" as `0x${string}`;

function hash(n: number): `0x${string}` {
  return `0x${n.toString(16).padStart(64, "0")}` as `0x${string}`;
}

describe("raid-db", () => {
  it("reports no bar before the first edition is opened", () => {
    expect(raid.raidBar()).toBeNull();
    // Repeated so the "read, and there is nothing" cache path is exercised
    // rather than only the "not yet read" one.
    expect(raid.raidBar()).toBeNull();
  });

  it("creates its tables on first use, without a migration call", () => {
    const e = raid.openEdition(1000);
    expect(e.edition).toBe(1);
    expect(raid.raidBar()).toEqual({
      edition: 1,
      totalHp: 1000,
      currentHp: 1000,
      phase: 1,
      felled: false,
    });
  });

  it("moves the bar as soon as an attempt lands", () => {
    // Read first, so a stale cache would have something to be stale with.
    expect(raid.raidBar()?.currentHp).toBe(1000);
    raid.submitAttempt({
      edition: 1,
      attemptId: hash(1),
      player: ALICE,
      damage: 400,
      turns: 30,
      survived: false,
    });
    expect(raid.raidBar()?.currentHp).toBe(600);
  });

  it("does not move it again for a duplicate submission", () => {
    const input = {
      edition: 1,
      attemptId: hash(2),
      player: ALICE,
      damage: 100,
      turns: 10,
      survived: true,
    };
    raid.submitAttempt(input);
    expect(raid.raidBar()?.currentHp).toBe(500);
    const dupe = raid.submitAttempt(input);
    expect(dupe.duplicate).toBe(true);
    expect(raid.raidBar()?.currentHp).toBe(500);
  });

  it("surfaces the phase flip through the cache", () => {
    expect(raid.raidBar()?.phase).toBe(2);
  });

  it("reports the kill and then the successor edition", () => {
    raid.submitAttempt({
      edition: 1,
      attemptId: hash(3),
      player: ALICE,
      damage: 9999,
      turns: 12,
      survived: true,
    });
    expect(raid.raidBar()).toMatchObject({ currentHp: 0, felled: true });

    raid.openEdition(250);
    expect(raid.raidBar()).toMatchObject({
      edition: 2,
      currentHp: 250,
      felled: false,
    });
  });

  it("keeps the gate shut until the counter reaches the threshold", () => {
    // Env is read lazily and cached on first call, so this test fixes the
    // threshold by having set RAID_UNLOCK_T5_CLEARS in beforeAll.
    const required = raid.raidGate().required;
    expect(required).toBe(3);
    expect(raid.raidGate()).toMatchObject({
      unlocked: false,
      t5Clears: 0,
      remaining: 3,
      overridden: false,
    });

    raid.recordT5Clear();
    raid.recordT5Clear();
    expect(raid.raidGate()).toMatchObject({ unlocked: false, remaining: 1 });

    raid.recordT5Clear();
    expect(raid.raidGate()).toMatchObject({
      unlocked: true,
      t5Clears: 3,
      remaining: 0,
      overridden: false,
    });
  });

  it("does not go backwards past the threshold", () => {
    raid.recordT5Clear();
    expect(raid.raidGate()).toMatchObject({ unlocked: true, t5Clears: 4 });
  });

  it("reports the configured edition HP", () => {
    expect(raid.defaultEditionHp()).toBe(10_214);
  });

  it("refuses to issue an attempt the player has not earned", () => {
    // The gate is open by now (the suite above crossed it) and edition 2
    // stands, so a balance of zero is the only thing left to stop this.
    expect(raid.playerAttemptBalance(ALICE)).toBe(0);
    expect(() => raid.issueAttempt(ALICE)).toThrow(/no unspent attempts/);
  });

  it("grants on a clear and issues against the standing edition", () => {
    expect(
      raid.grantAttemptsForClear({
        clearReceiptTokenId: 9001n,
        player: ALICE,
        realm: "0x0000000000000000000000000000000000000001",
      }),
    ).toBe(1);
    expect(raid.playerAttemptBalance(ALICE)).toBe(1);

    const issued = raid.issueAttempt(ALICE);
    expect(issued.edition).toBe(2);
    expect(issued.turnLimit).toBe(30);
    expect(issued.editionHp).toBe(250);
    expect(raid.playerAttemptBalance(ALICE)).toBe(0);
  });

  it("grants nothing for a replayed clear", () => {
    expect(
      raid.grantAttemptsForClear({
        clearReceiptTokenId: 9001n,
        player: ALICE,
        realm: "0x0000000000000000000000000000000000000001",
      }),
    ).toBe(0);
    expect(raid.playerAttemptBalance(ALICE)).toBe(0);
  });

  it("moves the bar when an issued attempt reports progress", () => {
    raid.grantAttemptsForClear({
      clearReceiptTokenId: 9002n,
      player: ALICE,
      realm: "0x0000000000000000000000000000000000000001",
    });
    const issued = raid.issueAttempt(ALICE);
    expect(raid.raidBar()?.currentHp).toBe(250);

    raid.advanceAttemptProgress({
      edition: issued.edition,
      attemptId: issued.attemptId,
      player: ALICE,
      cumulativeDamage: 60,
      turns: 8,
      survived: false,
    });
    expect(raid.raidBar()?.currentHp).toBe(190);

    // Mid-fight top-up: the delta lands and the bar follows.
    raid.advanceAttemptProgress({
      edition: issued.edition,
      attemptId: issued.attemptId,
      player: ALICE,
      cumulativeDamage: 100,
      turns: 14,
      survived: false,
    });
    expect(raid.raidBar()?.currentHp).toBe(150);
  });

  it("notices a write made by another process", async () => {
    // The operator script is a second writer by design — succession,
    // correction and rehearsal all live there — so invalidate-on-write alone
    // left the bar insisting edition 1 was felled while edition 2 stood.
    // Observed in a browser, not theorised.
    const before = raid.raidBar()!;
    expect(before.felled).toBe(false);

    const Database = (await import("better-sqlite3")).default;
    const { correctCurrentHp, migrateRaidTables } = await import("./raid-store");
    const outside = new Database(process.env.REALMS_DB_PATH!);
    migrateRaidTables(outside);
    correctCurrentHp(outside, before.edition, 7);
    outside.close();

    // Nothing in this process called invalidate(), so a cache relying only
    // on its own writes would still be serving `before`. `PRAGMA
    // data_version` is what catches it.
    expect(raid.raidBar()).toMatchObject({
      edition: before.edition,
      currentHp: 7,
    });
  });

  it("keeps the contributor record of the felled edition", () => {
    const rows = raid.raidContributors(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ player: ALICE, attempts: 3, damage: 1000 });
    // Counts are per-edition. Edition 1's three survive untouched by the
    // edition-2 attempts the tests above opened; an edition that never
    // existed has none.
    expect(raid.raidPlayerAttempts(1, ALICE)).toBe(3);
    expect(raid.raidPlayerAttempts(99, ALICE)).toBe(0);
  });
});
