/**
 * Inspect the kill receipts owed for felled editions.
 *
 * A script rather than a hook on the killing blow, for the same reason the
 * queue exists at all: minting N receipts is slow and partially
 * failure-prone, and the request that lands the final blow should not be
 * holding a connection open through it. Enqueueing happens synchronously on
 * the kill (see `advanceAttemptProgress`); this is the half that spends gas.
 *
 * Safe to run repeatedly and safe to interrupt. Every receipt already minted
 * is skipped, every one still owed is retried, and a crash mid-run leaves
 * the remainder pending — see `lib/raid/receipt-queue.ts` for the three
 * guards that make that true.
 *
 *   pnpm raid:receipts --dry             → list what is owed
 *   pnpm raid:receipts --dry --edition 1 → just that one
 *
 * **Inspection only — this does not mint.** `withSignerLock` is an
 * in-process mutex, and kill receipts are signed by the same owner key the
 * running server uses for starter-realm clear receipts. A second process
 * holding that key would collide on the nonce with nothing to serialise
 * them, and the symptom would be a silently dropped transaction. So the
 * server drains in-process when an edition falls (`drainKillReceipts` in
 * `lib/server/raid-db.ts`), and this stays a read-only window onto the
 * queue — which is the thing an operator actually needs at 2am.
 */

import {
  editionsWithPendingReceipts,
  listReceipts,
  migrateRaidTables,
} from "../lib/server/raid-store";
import { closeRealmsDb, defaultDbPath, openRealmsDb } from "../lib/server/sqlite";

function intFlag(argv: string[], flag: string): number | undefined {
  const i = argv.indexOf(flag);
  if (i < 0) return undefined;
  const parsed = Number(argv[i + 1]);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} requires a positive integer, got ${argv[i + 1]}`);
  }
  return parsed;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const only = intFlag(argv, "--edition");
  const dry = argv.includes("--dry");

  const db = openRealmsDb();
  migrateRaidTables(db);
  console.log(`db: ${defaultDbPath()}\n`);

  const editions = only ? [only] : editionsWithPendingReceipts(db);
  if (editions.length === 0) {
    console.log("Nothing owed. Every felled edition's receipts are minted.");
    return;
  }

  if (dry) {
    for (const edition of editions) {
      const all = listReceipts(db, edition);
      const owed = all.filter((r) => r.txHash === null);
      console.log(
        `edition ${edition}: ${owed.length} owed of ${all.length} total`,
      );
      for (const r of all) {
        console.log(
          `  ${r.player} ${(r.shareBps / 100).toFixed(2).padStart(6)}%` +
            `${r.killingBlow ? " ✦" : "  "} ${r.txHash === null ? "OWED" : "minted"}`,
        );
      }
    }
    return;
  }

  console.log(
    [
      "Minting does not run here. `withSignerLock` is an in-process mutex, and",
      "these receipts are signed by the same owner key the running server uses",
      "for clear receipts — a second process holding that key would collide on",
      "the nonce with nothing to serialise them. The server drains in-process",
      "when an edition falls; see `drainKillReceipts` in lib/server/raid-db.ts.",
      "",
      "Re-run with --dry to inspect what is owed.",
    ].join("\n"),
  );
}

main()
  .catch((err) => {
    console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(() => {
    closeRealmsDb();
  });
