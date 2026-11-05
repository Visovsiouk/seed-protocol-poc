/**
 * Tests for the three raid routes, against a real (temporary) database.
 *
 * Nothing is mocked. The usual reason to mock the db edge is that it cannot
 * be pointed anywhere safe, which was true of `realm-db.ts` and is exactly
 * what `raid-store.ts` was built to avoid — so these run the real store
 * through the real `raid-db.ts` against a throwaway file. The routes are
 * mostly validation and delegation, and a mock would pass while the wiring
 * between them was wrong, which is the failure worth catching here.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// lib/env parses publicSchema at module load and caches each lazy schema on
// first read, so every one of these must be set before the route imports.
// The write ceiling is high so the rate limit never interferes; it has its
// own coverage in lib/server/realm-guards.test.ts.
process.env.NEXT_PUBLIC_CHAIN = "anvil";
process.env.NEXT_PUBLIC_RPC_URL = "http://127.0.0.1:8545";
process.env.REALM_WRITE_RATE_LIMIT_PER_IP_PER_10MIN = "1000";
process.env.REALM_READ_RATE_LIMIT_PER_IP_PER_10MIN = "1000";
// Forced open: the gate otherwise needs a realm with 50 distinct clearers,
// which is the whole reason the override exists.
process.env.RAID_UNLOCK_OVERRIDE = "true";
process.env.RAID_TURN_LIMIT = "30";

const dir = mkdtempSync(join(tmpdir(), "raid-route-test-"));
process.env.REALMS_DB_PATH = join(dir, "realms.db");

const ALICE = "0x00000000000000000000000000000000000000a1" as const;
const BOB = "0x00000000000000000000000000000000000000b2" as const;
const REALM = "0x0000000000000000000000000000000000000009" as const;

const raid = await import("@/lib/server/raid-db");
const { GET: getState } = await import("./state/route");
const { POST: postAttempt } = await import("./attempt/route");
const { POST: postProgress } = await import("./progress/route");

afterAll(async () => {
  const { closeRealmsDb } = await import("@/lib/server/sqlite");
  closeRealmsDb();
  delete process.env.REALMS_DB_PATH;
  delete process.env.RAID_UNLOCK_OVERRIDE;
  delete process.env.RAID_TURN_LIMIT;
  rmSync(dir, { recursive: true, force: true });
});

function stateReq(player?: string) {
  const url = player
    ? `http://localhost/api/raid/state?player=${player}`
    : "http://localhost/api/raid/state";
  return new Request(url);
}

function postReq(path: string, body: unknown) {
  return new Request(`http://localhost/api/raid/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, never> & {
    ok: boolean;
    reason?: string;
    [k: string]: unknown;
  };
}

/** Earn Alice an attempt the way a T5 clear would. */
function earn(tokenId: bigint, player: `0x${string}` = ALICE) {
  return raid.grantAttemptsForClear({
    clearReceiptTokenId: tokenId,
    player,
    realm: REALM,
  });
}

describe("GET /api/raid/state", () => {
  it("describes a sealed-but-unopened raid rather than 404ing", async () => {
    const body = await json(await getState(stateReq()));
    expect(body.ok).toBe(true);
    // Override is on, so the gate reports open even with no clears counted.
    expect(body.gate).toMatchObject({ unlocked: true, overridden: true });
    // No edition yet — that is a null boss, not an error.
    expect(body.boss).toBeNull();
    expect(body.contributors).toEqual([]);
  });

  it("omits the attempt balance when no player is given", async () => {
    const body = await json(await getState(stateReq()));
    expect(body.attemptsAvailable).toBeNull();
  });

  it("rejects a malformed player", async () => {
    const res = await getState(stateReq("not-an-address"));
    expect(res.status).toBe(400);
    expect((await json(res)).reason).toBe("invalid");
  });

  it("reports the pool and the balance once both exist", async () => {
    raid.openEdition(1_000);
    earn(1n);
    const body = await json(await getState(stateReq(ALICE)));
    expect(body.boss).toMatchObject({
      edition: 1,
      totalHp: 1_000,
      currentHp: 1_000,
      phase: 1,
      felled: false,
    });
    expect(body.attemptsAvailable).toBe(1);
  });
});

describe("POST /api/raid/attempt", () => {
  it("rejects a body without a valid player", async () => {
    const res = await postAttempt(postReq("attempt", { player: "nope" }));
    expect(res.status).toBe(400);
    expect((await json(res)).reason).toBe("invalid");
  });

  it("refuses a player with nothing earned, with a distinct reason", async () => {
    const res = await postAttempt(postReq("attempt", { player: BOB }));
    expect(res.status).toBe(409);
    expect((await json(res)).reason).toBe("no_attempts");
  });

  it("issues a seed, a limit, and the pool/total split", async () => {
    const body = await json(await postAttempt(postReq("attempt", { player: ALICE })));
    expect(body.ok).toBe(true);
    expect(body.attemptId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(body.rngSeed).toMatch(/^0x[0-9a-f]{64}$/);
    // Distinct values: the public id must not reveal the seed.
    expect(body.rngSeed).not.toBe(body.attemptId);
    expect(body).toMatchObject({
      edition: 1,
      turnLimit: 30,
      startHp: 1_000,
      editionHp: 1_000,
    });
  });

  it("spends the balance, so a second call is refused", async () => {
    expect((await json(await getState(stateReq(ALICE)))).attemptsAvailable).toBe(0);
    const res = await postAttempt(postReq("attempt", { player: ALICE }));
    expect((await json(res)).reason).toBe("no_attempts");
  });

  it("issues unpredictable seeds across attempts", async () => {
    earn(2n);
    earn(3n);
    const a = await json(await postAttempt(postReq("attempt", { player: ALICE })));
    const b = await json(await postAttempt(postReq("attempt", { player: ALICE })));
    expect(a.rngSeed).not.toBe(b.rngSeed);
    expect(a.attemptId).not.toBe(b.attemptId);
  });
});

describe("POST /api/raid/progress", () => {
  let attemptId: string;

  beforeAll(async () => {
    earn(100n);
    const issued = await json(await postAttempt(postReq("attempt", { player: ALICE })));
    attemptId = issued.attemptId as string;
  });

  const base = () => ({
    attemptId,
    player: ALICE,
    cumulativeDamage: 0,
    turns: 0,
    survived: false,
  });

  it("404s an attempt that was never issued", async () => {
    const res = await postProgress(
      postReq("progress", { ...base(), attemptId: `0x${"1".repeat(64)}` }),
    );
    expect(res.status).toBe(404);
    expect((await json(res)).reason).toBe("unknown_attempt");
  });

  it("refuses a player who does not own the attempt", async () => {
    const res = await postProgress(postReq("progress", { ...base(), player: BOB }));
    expect(res.status).toBe(403);
    expect((await json(res)).reason).toBe("wrong_player");
  });

  it("refuses more rounds than the attempt was issued", async () => {
    const res = await postProgress(
      postReq("progress", { ...base(), turns: 31, cumulativeDamage: 10 }),
    );
    expect(res.status).toBe(400);
    expect((await json(res)).reason).toBe("over_turn_limit");
  });

  it("refuses a trace that disagrees with the round count", async () => {
    const res = await postProgress(
      postReq("progress", { ...base(), turns: 3, trace: "aa" }),
    );
    expect(res.status).toBe(400);
    expect((await json(res)).reason).toBe("trace_mismatch");
  });

  it("refuses a trace with characters that are not actions", async () => {
    const res = await postProgress(
      postReq("progress", { ...base(), turns: 2, trace: "ax" }),
    );
    expect(res.status).toBe(400);
    expect((await json(res)).reason).toBe("invalid");
  });

  it("applies the delta and moves the pool", async () => {
    const first = await json(
      await postProgress(
        postReq("progress", {
          ...base(),
          cumulativeDamage: 120,
          turns: 10,
          trace: "aaaaaaaaaa",
        }),
      ),
    );
    expect(first.applied).toBe(120);
    expect(first.boss).toMatchObject({ currentHp: 880, felled: false });

    // Cumulative, not incremental: 300 total means 180 more.
    const second = await json(
      await postProgress(
        postReq("progress", {
          ...base(),
          cumulativeDamage: 300,
          turns: 20,
          trace: "aaaaaaaaaasssssssss" + "a",
        }),
      ),
    );
    expect(second.applied).toBe(180);
    expect(second.boss).toMatchObject({ currentHp: 700 });
  });

  it("applies nothing for a replayed total", async () => {
    const res = await json(
      await postProgress(
        postReq("progress", { ...base(), cumulativeDamage: 300, turns: 20 }),
      ),
    );
    expect(res.applied).toBe(0);
    expect(res.boss).toMatchObject({ currentHp: 700 });
  });

  it("keeps the longest trace rather than a stale shorter one", async () => {
    await postProgress(
      postReq("progress", { ...base(), cumulativeDamage: 300, turns: 5, trace: "aaaaa" }),
    );
    expect(raid.raidContribution(attemptId as `0x${string}`)?.trace).toHaveLength(20);
  });

  it("reports the kill, then refuses further reports against the dead pool", async () => {
    const kill = await json(
      await postProgress(
        postReq("progress", { ...base(), cumulativeDamage: 9_999, turns: 30 }),
      ),
    );
    expect(kill.felled).toBe(true);
    expect(kill.boss).toMatchObject({ currentHp: 0, felled: true });

    // A felled pool gets its own reason, because "he is down, edition 2
    // opens later" is a different thing to tell a player than "something
    // went wrong" — and their grant is still unspent either way.
    earn(200n);
    const res = await postAttempt(postReq("attempt", { player: ALICE }));
    expect((await json(res)).reason).toBe("already_felled");
    expect(
      (await json(await getState(stateReq(ALICE)))).attemptsAvailable,
    ).toBe(1);
  });

  it("surfaces the kill and contributors through the state route", async () => {
    const body = await json(await getState(stateReq(ALICE)));
    expect(body.boss).toMatchObject({ currentHp: 0, felled: true });
    const contributors = body.contributors as { player: string; killingBlow: boolean }[];
    expect(contributors.some((c) => c.killingBlow)).toBe(true);
    expect(contributors[0]!.player).toBe(ALICE);
  });
});
