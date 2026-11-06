import { expect, test, type APIRequestContext } from "@playwright/test";

import {
  grantAttempt,
  migrateRaidTables,
  openNextEdition,
} from "@/lib/server/raid-store";
import { openRealmsDb } from "@/lib/server/sqlite";

import { E2E_DB } from "./paths";

/**
 * Seed the way the operator script does, from this process.
 *
 * The path is passed explicitly rather than through `REALMS_DB_PATH`:
 * static imports hoist, so an env assignment at the top of this file would
 * run *after* the module that reads it. Playwright's loader also rejects
 * top-level await, so the dynamic-import workaround is not available —
 * which is fine, because `openRealmsDb` taking a path was always the
 * cleaner door.
 *
 * This makes the spec a *second writer* on the server's database, which is
 * exactly the arrangement that broke the HP-bar cache once already — so it
 * doubles as live exercise of the `PRAGMA data_version` check that fixed
 * it. `raid-store.ts` is deliberately not `server-only`, which is what lets
 * a test process reach it at all; see `lib/server/sqlite.ts`.
 */
function seed(fn: (db: ReturnType<typeof openRealmsDb>) => void): void {
  const db = openRealmsDb(E2E_DB);
  migrateRaidTables(db);
  fn(db);
}

/**
 * The Colophon, end to end: sealed → open → the pool decrements across two
 * wallets → felled, with the record surviving the next edition.
 *
 * The plan asked for exactly this walkthrough, and the reason it is worth
 * automating is that a felled edition **cannot be un-felled**. Every manual
 * re-verification of the kill costs a chain reset; this costs 30 seconds and
 * a temp database.
 *
 * ## Two wallets, one scripted
 *
 * Browser burners live in localStorage, so "two wallets" in a browser means
 * two profiles. The second player is driven through the API instead — which
 * is not a shortcut: it proves the API is the real trust boundary rather
 * than the client, because wallet B never loads the page at all and its
 * damage still lands on the same pool wallet A is watching.
 */

const ALICE = "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720";
const BOB = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

type RaidState = {
  gate: { unlocked: boolean; remaining: number };
  boss: { edition: number; totalHp: number; currentHp: number; felled: boolean } | null;
  editions: { edition: number; felledAt: number | null }[];
  contributors: { player: string; damage: number; killingBlow: boolean }[];
  receipts: {
    player: string;
    shareBps: number;
    minted: boolean;
    killingBlow: boolean;
  }[];
  recordEdition: number | null;
  attemptsAvailable: number | null;
};

async function state(api: APIRequestContext, qs = ""): Promise<RaidState> {
  const res = await api.get(`/api/raid/state${qs}`);
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as RaidState;
}

/**
 * Drive one whole attempt for `player` through the API.
 *
 * Reports in two instalments rather than one, because cumulative reporting
 * is the thing most likely to break silently — a server that applied the
 * total instead of the delta would double-count and still look plausible.
 */
async function attempt(
  api: APIRequestContext,
  player: string,
  halfway: number,
  total: number,
) {
  const opened = await api.post("/api/raid/attempt", { data: { player } });
  expect(opened.ok(), await opened.text()).toBeTruthy();
  const { attemptId } = (await opened.json()) as { attemptId: string };

  for (const [cumulativeDamage, turns] of [
    [halfway, 10],
    [total, 20],
  ] as const) {
    const res = await api.post("/api/raid/progress", {
      data: { attemptId, player, cumulativeDamage, turns, survived: true },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
  }
  return attemptId;
}

test.describe.configure({ mode: "serial" });

test("the sealed door says how far off it is", async ({ page, request }) => {
  // No edition has been opened on this fresh database, so the page must
  // still render rather than 404 — "not yet" is a surface.
  await page.goto("/play/colophon");
  await expect(page.getByRole("heading", { name: "The Colophon" })).toBeVisible();
  await expect(
    page.getByText("no edition stands", { exact: false }),
  ).toBeVisible();

  const s = await state(request);
  expect(s.boss).toBeNull();
  expect(s.gate.unlocked).toBe(true); // forced by RAID_UNLOCK_OVERRIDE
});

test("the pool decrements across two wallets and falls", async ({
  page,
  request,
}) => {
  // Open a small edition and grant both players an attempt, the way the
  // operator script does.
  seed((db) => {
    openNextEdition(db, 500);
    for (const p of [ALICE, BOB] as `0x${string}`[]) {
      grantAttempt(db, { grantKey: `e2e-${p}`, player: p, realm: p });
    }
  });

  await page.goto("/play/colophon");
  await expect(page.getByText("500 / 500")).toBeVisible();

  // Wallet A fights. The delta, not the total, is what lands.
  await attempt(request, ALICE, 100, 200);
  let s = await state(request);
  expect(s.boss).toMatchObject({ currentHp: 300, felled: false });

  // The bar wallet A is looking at follows without a reload — it polls.
  await expect(page.getByText("300 / 500")).toBeVisible({ timeout: 15_000 });

  // Wallet B never loads the page. Its damage still lands on the same pool,
  // which is the point: the API is the trust boundary.
  await attempt(request, BOB, 150, 300);
  s = await state(request);
  expect(s.boss).toMatchObject({ currentHp: 0, felled: true });

  // Exactly one killing blow, and the contributions sum to the pool.
  const total = s.contributors.reduce((n, c) => n + c.damage, 0);
  expect(total).toBe(500);
  expect(s.contributors.filter((c) => c.killingBlow)).toHaveLength(1);

  await expect(page.getByText("has fallen", { exact: false })).toBeVisible({
    timeout: 15_000,
  });
});

test("receipts are owed to every contributor, summing to the pool", async ({
  request,
}) => {
  const s = await state(request);
  expect(s.receipts).toHaveLength(2);
  // Floored shares can sum slightly under 100% but never over.
  const bps = s.receipts.reduce((n, r) => n + r.shareBps, 0);
  expect(bps).toBeLessThanOrEqual(10_000);
  expect(bps).toBeGreaterThan(9_900);
  expect(s.receipts.filter((r) => r.killingBlow)).toHaveLength(1);

  // Deliberately NOT asserting whether they minted. The server drains
  // in-process when an edition falls, so the answer depends on whether an
  // anvil happens to be listening — true on a developer's machine mid-session,
  // false in CI. An earlier version of this asserted "still owed" and passed
  // only because no chain was up; it failed the moment one was. The mint path
  // is covered against a real chain by hand and against a fake in
  // `lib/raid/receipt-queue.test.ts`; what belongs here is that a receipt is
  // *owed to the right people for the right shares*, which is true either way.
});

test("the felled edition's record survives the next one opening", async ({
  page,
  request,
}) => {
  seed((db) => openNextEdition(db, 800));

  // The bar follows the standing edition...
  const current = await state(request);
  expect(current.boss).toMatchObject({ edition: 2, currentHp: 800 });
  expect(current.contributors).toHaveLength(0);

  // ...while edition 1's record is still addressable. This is the whole
  // reason editions exist over a single permanent kill.
  const past = await state(request, "?edition=1");
  expect(past.recordEdition).toBe(1);
  expect(past.contributors).toHaveLength(2);
  expect(past.receipts).toHaveLength(2);

  // And it is reachable from the page, not just the API.
  await page.goto("/play/colophon");
  await expect(page.getByText("800 / 800")).toBeVisible();
  await page.getByRole("button", { name: /Edition 1/ }).click();
  await expect(page.getByText("Showing edition 1", { exact: false })).toBeVisible();
});
