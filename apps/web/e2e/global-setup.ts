import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { migrateRaidTables } from "@/lib/server/raid-store";
import { closeRealmsDb, openRealmsDb } from "@/lib/server/sqlite";

import { E2E_DB } from "./paths";

/**
 * Reset the e2e raid state once per run.
 *
 * **Clears rows rather than deleting the file.** Playwright starts the
 * `webServer` before `globalSetup`, so by the time this runs the dev server
 * already holds the database open — and Windows refuses to unlink an open
 * file, which is an EPERM that looks nothing like the real cause. Deleting
 * the contents works regardless of who has it open, and on any platform.
 *
 * The reset matters: the first spec asserts the raid has no edition yet, and
 * state left by a previous run would fail it in a way that reads as a
 * product bug rather than stale fixtures.
 *
 * Only the raid tables — `player_realms` is not ours to clear, and a shared
 * database is exactly the arrangement where a test tidying up too broadly
 * does damage.
 */
export default function globalSetup(): void {
  mkdirSync(dirname(E2E_DB), { recursive: true });
  const db = openRealmsDb(E2E_DB);
  migrateRaidTables(db);
  // Children before parents: `raid_contribution` and `raid_receipt` both
  // reference `raid_boss(edition)`.
  db.exec(`
    DELETE FROM raid_receipt;
    DELETE FROM raid_contribution;
    DELETE FROM raid_attempt_grant;
    DELETE FROM raid_boss;
    DELETE FROM raid_unlock;
  `);
  // The server has its own connection; this one has done its job.
  closeRealmsDb(E2E_DB);
}
