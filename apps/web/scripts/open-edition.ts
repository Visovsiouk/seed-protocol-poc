/**
 * The Colophon's operator path — open the next edition, inspect the pool,
 * and correct it when something has gone wrong.
 *
 * Sits alongside `seed:trader` because it is the same kind of thing: a
 * privileged action the running app deliberately does not expose.
 *
 * **Being honest about why it exists**, since it is three jobs wearing one
 * coat and only the first is routine:
 *
 *   1. **Succession.** A felled edition is how the next one opens. Nothing
 *      in the app does this on its own, on purpose — "the boss is dead and
 *      stays dead until someone decides otherwise" is a property worth
 *      having on a demo server.
 *   2. **Correction.** `--set-hp` is the only remedy for an
 *      over-subtraction bug once the pool has moved. The alternative is
 *      editing `realms.db` by hand over ssh, which is worse. It does not
 *      touch contribution rows, so using it leaves the contributor totals
 *      and the pool permanently disagreeing — that mismatch is the record
 *      that someone intervened, and is better than rewriting history so the
 *      books balance.
 *   3. **Rehearsal.** The kill, the contributor list and the felled-edition
 *      surface are the least-exercised parts of the feature and the ones
 *      that cannot be re-created by clicking again. `--hp 40` opens an
 *      edition that two attempts will fell, which is how you see them
 *      without a 30-fight grind.
 *
 * Usage (from `apps/web`):
 *
 *   pnpm raid:edition                      → show the current pool
 *   pnpm raid:edition --hp 2000            → open the next edition
 *   pnpm raid:edition --attempts 6         → measure, then open at that size
 *   pnpm raid:edition --hp 40              → a rehearsal edition
 *   pnpm raid:edition --set-hp 5000 --edition 1    → correction
 *   pnpm raid:edition --contributors       → the current edition's record
 *   pnpm raid:edition --grant 0xabc…       → hand a wallet an attempt (rehearsal)
 *
 * `--attempts` runs the S1 harness (`scripts/lib/raid-damage.ts`) to derive
 * the HP total rather than taking it on faith, and accepts `--profile`,
 * `--loadout`, `--strategy` and `--turn-limit` the same way
 * `colophon-damage.ts` does. It takes ~20s. `--hp` skips the measurement
 * when you already have the number.
 *
 * Writes to `apps/web/data/realms.db`, or `REALMS_DB_PATH` when set.
 */

import {
  attemptBalance,
  correctCurrentHp,
  grantAttempt,
  getCurrentEdition,
  getRaidUnlock,
  listContributors,
  listEditions,
  listReceipts,
  migrateRaidTables,
  openNextEdition,
  phaseFor,
  type RaidEdition,
} from "../lib/server/raid-store";
import { closeRealmsDb, defaultDbPath, openRealmsDb } from "../lib/server/sqlite";
import {
  COLOPHON_PROFILES,
  grindSeeds,
  sizeEdition,
  STRATEGIES,
  T5_LOADOUTS,
  type LoadoutName,
  type ProfileName,
  type StrategyName,
} from "./lib/raid-damage";

/** Fixed identity for the sizing sweep — see `colophon-damage.ts`. */
const PLAYER = "0x00000000000000000000000000000000000000a1" as `0x${string}`;
const BLOCKHASH =
  "0x00000000000000000000000000000000000000000000000000000000000000b1" as `0x${string}`;
const SIZING_SEEDS = 20_000;

function intFlag(argv: string[], flag: string): number | undefined {
  const i = argv.indexOf(flag);
  if (i < 0) return undefined;
  const raw = argv[i + 1];
  const parsed = raw === undefined ? NaN : Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flag} requires a non-negative integer, got ${raw}`);
  }
  return parsed;
}

function choiceFlag<T extends string>(
  argv: string[],
  flag: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const i = argv.indexOf(flag);
  if (i < 0) return fallback;
  const raw = argv[i + 1];
  if (raw === undefined || !allowed.includes(raw as T)) {
    throw new Error(`${flag} must be one of ${allowed.join("|")}, got ${raw}`);
  }
  return raw as T;
}

function bar(e: RaidEdition, width = 40): string {
  const filled = Math.round((e.currentHp / e.totalHp) * width);
  return `[${"#".repeat(filled)}${"·".repeat(width - filled)}]`;
}

function describeEdition(e: RaidEdition): string {
  const pct = ((e.currentHp / e.totalHp) * 100).toFixed(1);
  const state =
    e.felledAt === null
      ? `standing, phase ${e.phase}`
      : `FELLED ${new Date(e.felledAt * 1000).toISOString()}`;
  return (
    `edition ${e.edition}  ${bar(e)}  ` +
    `${e.currentHp.toLocaleString("en-US")} / ${e.totalHp.toLocaleString("en-US")} ` +
    `(${pct}%)  —  ${state}`
  );
}

function showStatus(db: ReturnType<typeof openRealmsDb>): void {
  const unlock = getRaidUnlock(db);
  console.log(
    `gate: ${unlock.t5Clears} T5 clear(s) counted` +
      (unlock.firstT5At === null
        ? " — no realm has reached T5 yet"
        : ` since ${new Date(unlock.firstT5At * 1000).toISOString()}`) +
      `\n      threshold is RAID_UNLOCK_T5_CLEARS; RAID_UNLOCK_OVERRIDE=true forces it open\n`,
  );

  const all = listEditions(db);
  if (all.length === 0) {
    console.log(
      "No editions yet. Open the first:\n" +
        "  pnpm raid:edition --attempts 6       (measures, then opens — a small first edition)\n" +
        "  pnpm raid:edition --hp 2000          (if you already have the number)\n" +
        "\nSize edition 1 low. Editions exist so that sizing low first is the safe\n" +
        "mistake: an edition that never falls means the kill, the contributor list\n" +
        "and the felled-editions record never get exercised.",
    );
    return;
  }
  for (const e of all) console.log(describeEdition(e));
  const current = getCurrentEdition(db)!;
  if (current.felledAt !== null) {
    console.log(
      `\nEdition ${current.edition} has fallen. ` +
        `\`--hp N\` or \`--attempts N\` opens edition ${current.edition + 1}.`,
    );
  }
}

function showContributors(db: ReturnType<typeof openRealmsDb>): void {
  const current = getCurrentEdition(db);
  if (!current) {
    console.log("No editions yet.");
    return;
  }
  const rows = listContributors(db, current.edition);
  console.log(describeEdition(current));

  if (rows.length === 0) {
    console.log("\nNo attempts recorded yet.");
  } else {
    console.log(
      `\n${"player".padEnd(44)}${"damage".padStart(10)}${"attempts".padStart(10)}  blow`,
    );
    for (const r of rows) {
      console.log(
        r.player.padEnd(44) +
          r.damage.toLocaleString("en-US").padStart(10) +
          String(r.attempts).padStart(10) +
          (r.killingBlow ? "   ✦" : ""),
      );
    }
  }

  // Checked even with no contributors: a corrected edition that has taken no
  // attempts still has a pool that disagrees with its record, and that is
  // exactly the state where a silent mismatch would be most misleading.
  const recorded = rows.reduce((s, r) => s + r.damage, 0);
  const takenOffPool = current.totalHp - current.currentHp;
  if (rows.length > 0) {
    console.log(
      `\n${rows.length} contributor(s), ${recorded.toLocaleString("en-US")} damage recorded.`,
    );
  }
  const receipts = listReceipts(db, current.edition);
  if (receipts.length > 0) {
    const paid = receipts.filter((r) => r.txHash !== null).length;
    console.log(
      `\nreceipts: ${paid} / ${receipts.length} minted` +
        (paid === receipts.length
          ? ""
          : " — the rest are still owed; a drain pass will send them"),
    );
  } else if (current.felledAt !== null) {
    console.log(
      "\nreceipts: none queued. Enqueueing is idempotent, so a drain pass" +
        " can rebuild them from the contribution rows.",
    );
  }

  if (recorded !== takenOffPool) {
    // Only reachable through `--set-hp`. Say so rather than letting the two
    // numbers quietly disagree.
    console.log(
      `\nNOTE: contributions total ${recorded.toLocaleString("en-US")} but the pool has lost ` +
        `${takenOffPool.toLocaleString("en-US")}.\n` +
        "That gap is the signature of a `--set-hp` correction having been applied.",
    );
  }
}

/**
 * Hand a wallet an attempt without making it clear a T5 realm.
 *
 * The rehearsal counterpart to `RAID_UNLOCK_OVERRIDE`, and needed for the
 * same reason: earning an attempt legitimately means clearing a realm with
 * fifty distinct clearers, which no local chain has. Keys the grant on a
 * timestamped manual id so it can never collide with a real clearReceipt
 * token id, and so the record shows plainly that it was issued by hand.
 */
function grantManually(
  db: ReturnType<typeof openRealmsDb>,
  player: `0x${string}`,
): void {
  const key = `manual:${Date.now()}`;
  const granted = grantAttempt(db, {
    grantKey: key,
    player,
    realm: "0x0000000000000000000000000000000000000000",
  });
  console.log(
    granted
      ? `Granted 1 attempt to ${player} (${key}).`
      : `Nothing granted — ${key} already exists.`,
  );
  console.log(`${player} now holds ${attemptBalance(db, player)} unspent attempt(s).`);
}

function sizeFromAttempts(argv: string[], attempts: number): number {
  const profileName = choiceFlag(
    argv,
    "--profile",
    Object.keys(COLOPHON_PROFILES) as ProfileName[],
    "stonewall",
  );
  const loadoutName = choiceFlag(
    argv,
    "--loadout",
    Object.keys(T5_LOADOUTS) as LoadoutName[],
    "offense",
  );
  const strategy = choiceFlag<StrategyName>(
    argv,
    "--strategy",
    STRATEGIES,
    "attack",
  );
  const turnLimit = intFlag(argv, "--turn-limit") ?? 30;

  console.log(
    `Measuring ${attempts} attempts at a ${turnLimit}-round limit ` +
      `against ${profileName}/${loadoutName}/${strategy} (${SIZING_SEEDS.toLocaleString("en-US")} seeds)…`,
  );
  const sizing = sizeEdition({
    profile: COLOPHON_PROFILES[profileName],
    loadout: T5_LOADOUTS[loadoutName],
    strategy,
    seeds: grindSeeds({ player: PLAYER, blockhash: BLOCKHASH, count: SIZING_SEEDS }),
    turnLimit,
    attempts,
  });
  console.log(
    `  median damage ${sizing.phase1Median} (phase 1) / ${sizing.phase2Median} (phase 2)` +
      `  →  ${sizing.totalHp.toLocaleString("en-US")} HP, ` +
      `${sizing.pctPerAttempt.toFixed(1)}% of the bar per attempt`,
  );
  return sizing.totalHp;
}

function main(): void {
  const argv = process.argv.slice(2);
  const db = openRealmsDb();
  migrateRaidTables(db);
  console.log(`db: ${defaultDbPath()}\n`);

  try {
    const setHp = intFlag(argv, "--set-hp");
    if (setHp !== undefined) {
      const edition = intFlag(argv, "--edition") ?? getCurrentEdition(db)?.edition;
      if (edition === undefined) throw new Error("no editions exist to correct");
      const before = listEditions(db).find((e) => e.edition === edition);
      if (!before) throw new Error(`no such edition: ${edition}`);
      console.log("CORRECTION — contribution rows are left untouched.");
      console.log(`  before  ${describeEdition(before)}`);
      const after = correctCurrentHp(db, edition, setHp);
      console.log(`  after   ${describeEdition(after)}`);
      if (phaseFor(after.totalHp, after.currentHp) !== before.phase) {
        console.log(`  phase moved ${before.phase} → ${after.phase}`);
      }
      return;
    }

    const grantTo = argv[argv.indexOf("--grant") + 1];
    if (argv.includes("--grant")) {
      if (!grantTo || !/^0x[0-9a-fA-F]{40}$/.test(grantTo)) {
        throw new Error(`--grant requires a 0x address, got ${grantTo}`);
      }
      grantManually(db, grantTo.toLowerCase() as `0x${string}`);
      return;
    }

    if (argv.includes("--contributors")) {
      showContributors(db);
      return;
    }

    const attempts = intFlag(argv, "--attempts");
    const hp = intFlag(argv, "--hp");
    if (attempts === undefined && hp === undefined) {
      showStatus(db);
      return;
    }
    if (attempts !== undefined && hp !== undefined) {
      throw new Error("pass --hp or --attempts, not both");
    }

    const totalHp = hp ?? sizeFromAttempts(argv, attempts!);
    const opened = openNextEdition(db, totalHp);
    console.log(`\nOpened ${describeEdition(opened)}`);
  } finally {
    // Checkpoint the WAL before the process exits, so the file a backup
    // picks up is the file this script just wrote.
    closeRealmsDb();
  }
}

try {
  main();
} catch (err) {
  // Every throw this script can produce is a refusal an operator needs to
  // read — "that edition still stands", "no such edition", a bad flag. A
  // stack trace buries the sentence that matters, so print the message and
  // exit non-zero.
  console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}
