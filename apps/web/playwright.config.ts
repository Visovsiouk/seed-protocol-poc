import { defineConfig } from "@playwright/test";

import { E2E_DB, E2E_PORT } from "./e2e/paths";

/**
 * Playwright's first use in this repo.
 *
 * `@playwright/test` has been in devDependencies with no config and no spec
 * since before the raid existed. The justification for wiring it here rather
 * than anywhere else is specific: the Colophon is the first thing in the app
 * whose state **cannot be re-created by clicking again**. A felled edition
 * stays felled, so manually re-verifying the kill costs a chain reset every
 * time — which is exactly the cost an automated spec removes.
 *
 * ## Why its own port and its own database
 *
 * Port 3400 and a fresh temp `realms.db`, so a run cannot touch a dev server
 * or a database anybody is using. The spec deliberately fells editions; doing
 * that to a developer's local state would be rude, and doing it to the demo
 * server would be worse.
 *
 * `RAID_UNLOCK_OVERRIDE` is on because the gate otherwise needs a realm with
 * fifty distinct clearers, which no test chain has — the same reason the
 * override exists at all.
 *
 * No chain is started, and the specs do not depend on one either way. The
 * gate, the pool, the decrement and the felled record are all server-side.
 * The receipt *mint* is the only part that needs a node: the server drains
 * in-process when an edition falls, so it happens when an anvil is listening
 * and does not when one is not. Nothing here asserts which — that would pass
 * on a developer's machine and fail in CI, or the reverse. The mint is
 * covered against a real chain by hand and against a fake in
 * `lib/raid/receipt-queue.test.ts`.
 */

export default defineConfig({
  testDir: "./e2e",
  // The database wipe lives here, not at module scope: this config is
  // re-imported by every worker and by the webServer bootstrap, so a wipe
  // inline fired again after the server had the file open.
  globalSetup: "./e2e/global-setup.ts",
  // `paths.ts` and `global-setup.ts` are helpers, not specs.
  testMatch: /.*\.spec\.ts$/,
  // Serial: the specs share one pool and fell it. Parallel workers would
  // race each other to the killing blow and the assertions would be
  // meaningless.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: `http://127.0.0.1:${E2E_PORT}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `pnpm exec next dev -p ${E2E_PORT}`,
    url: `http://127.0.0.1:${E2E_PORT}/api/raid/state`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      REALMS_DB_PATH: E2E_DB,
      RAID_UNLOCK_OVERRIDE: "true",
      RAID_TURN_LIMIT: "30",
      NEXT_PUBLIC_CHAIN: "anvil",
      NEXT_PUBLIC_RPC_URL: "http://127.0.0.1:8545",
      NEXT_PUBLIC_DEMO_MODE: "true",
      NEXT_PUBLIC_DEMO_ADDRESS: "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720",
    },
  },
});
