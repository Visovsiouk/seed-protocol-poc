/**
 * Smoke tests for `realm-db.ts` — its first, written because the S4 refactor
 * moved its connection into `sqlite.ts`.
 *
 * These were previously impossible, and the reason is worth recording: the
 * module cached a `Database` opened against a hardcoded
 * `resolve(process.cwd(), "data", "realms.db")`, so importing it in a test
 * meant writing to the developer's real db or not testing it at all. Routing
 * the connection through `sqlite.ts` — which honours `REALMS_DB_PATH` —
 * removed that, so the refactor gets to prove itself rather than being taken
 * on trust.
 *
 * Deliberately shallow: enough to show the schema is created, a realm
 * round-trips, and the two write paths behave. The point is coverage of the
 * connection change, not of `/create`.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let dir: string;
let realm: typeof import("./realm-db");

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "realm-db-test-"));
  process.env.REALMS_DB_PATH = join(dir, "realms.db");
  realm = await import("./realm-db");
});

afterAll(async () => {
  const { closeRealmsDb } = await import("./sqlite");
  closeRealmsDb();
  delete process.env.REALMS_DB_PATH;
  rmSync(dir, { recursive: true, force: true });
});

const ADDR = "0x00000000000000000000000000000000000000c3" as `0x${string}`;
const OWNER = "0x00000000000000000000000000000000000000d4" as `0x${string}`;

describe("realm-db", () => {
  it("creates its schema on first use and starts empty", () => {
    expect(realm.listPlayerRealms()).toEqual([]);
    expect(realm.getNextSignerIndex()).toBe(
      realm.PLAYER_REALM_SIGNER_INDEX_START,
    );
  });

  it("round-trips a realm, lower-casing the addresses", () => {
    const row = realm.insertPlayerRealm({
      address: ("0x" + ADDR.slice(2).toUpperCase()) as `0x${string}`,
      owner: OWNER,
      preset: "fantasy",
      bossId: "lich",
      name: "Test Realm",
      signerIndex: realm.getNextSignerIndex(),
    });
    expect(row.address).toBe(ADDR);

    const read = realm.getPlayerRealm(ADDR)!;
    expect(read).toMatchObject({
      address: ADDR,
      owner: OWNER,
      preset: "fantasy",
      bossId: "lich",
      name: "Test Realm",
      lore: null,
    });
    expect(realm.listPlayerRealms()).toHaveLength(1);
  });

  it("advances the signer index past a claimed slot", () => {
    expect(realm.getNextSignerIndex()).toBe(
      realm.PLAYER_REALM_SIGNER_INDEX_START + 1,
    );
  });

  it("writes lore once, and the second caller loses", () => {
    const lore = {
      pageText: "A room that remembers.",
      bookmarkName: "The Margin",
      bookmarkLine: "Someone wrote here before you.",
    };
    expect(realm.setRealmLore(ADDR, lore)).toBe(true);
    expect(realm.setRealmLore(ADDR, { ...lore, pageText: "Different." })).toBe(
      false,
    );
    expect(realm.getPlayerRealm(ADDR)!.lore).toEqual({
      ...lore,
      source: "model",
    });
  });

  it("is undefined for an unknown address", () => {
    expect(
      realm.getPlayerRealm("0x000000000000000000000000000000000000dead"),
    ).toBeUndefined();
  });
});
