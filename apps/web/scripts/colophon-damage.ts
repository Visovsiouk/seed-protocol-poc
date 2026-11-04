/**
 * Colophon raid damage report — the CLI over `lib/raid-damage.ts`.
 *
 * Replays a fixed T5 loadout across N run seeds and prints the damage
 * distribution, then converts it into the two numbers S4 and S6 actually
 * need: a **turn limit** and an **edition HP total**. Sits alongside
 * `balance-sweep.ts` for the same reason — a tuning instrument, not
 * runtime code. No chain reads, no I/O beyond stdout.
 *
 * Read the output in this order:
 *
 *   1. `rounds survived` on the headline cell → pick the turn limit. At or
 *      above the median, death is the usual ending; well below it, the
 *      limit is the only ending and nobody ever dies.
 *   2. `median` at that turn limit → damage per attempt.
 *   3. The edition-sizing table → HP total for the attempt count you want,
 *      with the percentage the bar moves per attempt next to it.
 *
 * The sensitivity matrix is there to show how much of (2) survives not yet
 * knowing the Colophon's stat block. Short answer: at a turn limit near
 * median survival, most of it.
 *
 *   pnpm exec tsx scripts/colophon-damage.ts
 *     → headline cell at 100k seeds + sensitivity matrix at 10k.
 *
 *   pnpm exec tsx scripts/colophon-damage.ts --seeds 2000
 *     → same shape, fewer seeds. Use while iterating; the tail figures
 *       (p99.99, max) are meaningless below ~10k.
 *
 *   pnpm exec tsx scripts/colophon-damage.ts --matrix-seeds 50000
 *     → widen the sensitivity sweep too (slow: 18 cells).
 *
 *   pnpm exec tsx scripts/colophon-damage.ts --headline-only
 *     → skip the matrix.
 *
 * Once the stat block and turn limit are settled, run it backwards instead —
 * this is the mode to use at the end of S6, when the only thing left is the
 * integer `open-edition` needs:
 *
 *   pnpm exec tsx scripts/colophon-damage.ts --target-attempts 30 \
 *     --profile stonewall --turn-limit 30
 *     → one `total_hp` figure, with both phase medians shown so it is
 *       auditable. Accepts --loadout and --strategy too; defaults are the
 *       headline cell. Unlike the sizing table in the full report, this
 *       prices the two halves of the edition separately.
 *
 * Re-run this after any change to `lib/engine/combat.ts`, `catalog.ts`,
 * `tier.ts`, or `boss.ts`. The companion test
 * (`scripts/lib/raid-damage.test.ts`) fails on drift at a small sample
 * size; this script is how you find out what the new numbers are.
 */

import {
  bestOf,
  COLOPHON_PROFILES,
  grindSeeds,
  HARD_TURN_CAP,
  INERT_BOSS_EFFECTS,
  LIVE_BOSS_EFFECTS,
  measureCell,
  sizeEdition,
  STRATEGIES,
  T5_LOADOUTS,
  tailGrowth,
  TURN_CHECKPOINTS,
  type Cell,
  type Distribution,
  type LoadoutName,
  type ProfileName,
  type StrategyName,
} from "./lib/raid-damage";

/**
 * The identity the seed sweep is anchored to. `deriveRunSeed` mixes these
 * two with a per-run nonce; holding them fixed and varying only the nonce
 * is what production does, so the values are arbitrary — but they must not
 * vary within a report, or cells stop being comparable.
 */
const PLAYER = "0x00000000000000000000000000000000000000a1" as `0x${string}`;
const BLOCKHASH =
  "0x00000000000000000000000000000000000000000000000000000000000000b1" as `0x${string}`;

/**
 * The edition pool the attempts are measured against. Large enough that no
 * attempt comes close to exhausting it (so no attempt is cut short by the
 * boss dying) and large enough that `floor(editionHp / 2)` is far above
 * where a phase-1 attempt can reach.
 */
const EDITION_HP = 1_000_000;

/** Headline cell: the profile and loadout the HP recommendation is read off. */
const HEADLINE_PROFILE: ProfileName = "lethal";
const HEADLINE_LOADOUT: LoadoutName = "offense";

/**
 * Attempt counts the edition-sizing table is quoted at. Deliberately in
 * the tens: an edition sized for hundreds of attempts moves the bar a
 * fraction of a percent per fight and will not fall on a demo server, so
 * the kill, the contributor list and the felled-editions record — the
 * expensive, least-rehearsed parts of the feature — never get exercised.
 * Editions exist so that sizing low first is the safe mistake.
 */
const ATTEMPT_COUNTS = [10, 30, 50, 100] as const;

function n(x: number, width = 7): string {
  return (Number.isFinite(x) ? x.toFixed(x >= 100 ? 0 : 1) : "∞").padStart(
    width,
  );
}

function distHeader(label: string): string {
  return [
    label.padEnd(12),
    "    min",
    " median",
    "   mean",
    "    p90",
    "    p99",
    "  p99.9",
    " p99.99",
    "    max",
    "   spread",
  ].join("");
}

function distRow(label: string, d: Distribution): string {
  return (
    label.padEnd(12) +
    [d.min, d.median, d.mean, d.p90, d.p99, d.p999, d.p9999, d.max]
      .map((v) => n(v))
      .join("") +
    n(d.spread, 10)
  );
}

function outcomeLine(cell: Cell): string {
  const total = cell.perSeedDamage.length;
  const pct = (k: number) => ((k / total) * 100).toFixed(1) + "%";
  return (
    `  outcomes: died ${pct(cell.outcomes.died)} · ` +
    `hit ${HARD_TURN_CAP}-round guard ${pct(cell.outcomes.capped)} · ` +
    `felled pool ${pct(cell.outcomes.felled)}` +
    `   |   rounds survived: median ${cell.turnsSurvived.median}, ` +
    `p99 ${cell.turnsSurvived.p99}, max ${cell.turnsSurvived.max}`
  );
}

function reportCell(cell: Cell): void {
  console.log(
    `\n### ${cell.profile} / ${cell.loadout} / ${cell.strategy} ` +
      `(Secondary = ${cell.secondary})`,
  );
  console.log(outcomeLine(cell));
  console.log("");
  console.log(distHeader("turn limit"));
  cell.checkpoints.forEach((cp, i) => {
    const label = cp === HARD_TURN_CAP ? `≤${cp} (none)` : `${cp} rounds`;
    console.log(distRow(label, cell.byCheckpoint[i]!));
  });
}

function parseIntFlag(argv: string[], flag: string, fallback: number): number {
  const i = argv.indexOf(flag);
  if (i < 0) return fallback;
  const raw = argv[i + 1];
  const parsed = raw === undefined ? NaN : Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} requires a positive integer, got ${raw}`);
  }
  return parsed;
}

function parseChoiceFlag<T extends string>(
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

/**
 * `--target-attempts` mode: the report run backwards.
 *
 * The report is for deciding; this is for executing a decision. Once S6 has
 * fixed the stat block and the turn limit, the only thing left to produce is
 * the single integer `open-edition` wants, and reading it out of a table and
 * multiplying by hand is a step that can go wrong silently. Prints both
 * phase medians alongside it so the number is auditable rather than magic.
 */
function runTargetSizing(args: {
  seedCount: number;
  profileName: ProfileName;
  loadoutName: LoadoutName;
  strategy: StrategyName;
  turnLimit: number;
  attempts: number;
}): void {
  const seeds = grindSeeds({
    player: PLAYER,
    blockhash: BLOCKHASH,
    count: args.seedCount,
  });
  const profile = COLOPHON_PROFILES[args.profileName];
  const loadout = T5_LOADOUTS[args.loadoutName];
  const sizing = sizeEdition({
    profile,
    loadout,
    strategy: args.strategy,
    seeds,
    turnLimit: args.turnLimit,
    attempts: args.attempts,
    poolHp: EDITION_HP,
  });

  console.log(
    `\n## Edition sizing — ${args.attempts} attempts at a ${args.turnLimit}-round limit`,
  );
  console.log(
    `Block    ${profile.name} (ac ${profile.boss.ac}, d${profile.boss.attackDie}→d${profile.boss.phase2AttackDie}, ` +
      `${profile.boss.bakedEffects.join(" + ")})`,
  );
  console.log(
    `Loadout  ${loadout.name} / ${args.strategy}   ` +
      `(${args.seedCount.toLocaleString("en-US")} seeds)`,
  );
  console.log(
    `\n  median damage per attempt   ${sizing.phase1Median} (phase 1) · ` +
      `${sizing.phase2Median} (phase 2)`,
  );
  console.log(
    `  attempt budget splits       ${sizing.phase1Attempts.toFixed(1)} + ` +
      `${sizing.phase2Attempts.toFixed(1)}`,
  );
  console.log(
    `  one attempt moves the bar   ${sizing.pctPerAttempt.toFixed(1)}%`,
  );
  console.log(
    `\n  →  total_hp = ${sizing.totalHp.toLocaleString("en-US")}  (${sizing.totalHp})\n`,
  );
  console.log(
    "Sized as (total/2)/phase1 + (total/2)/phase2 = attempts, not median×attempts:\n" +
      "the halves are different fights, and a flat multiply prices the whole pool at\n" +
      "the phase-1 rate. Re-run this after any combat change before opening an edition.",
  );
}

function runHeadline(seedCount: number): void {
  const seeds = grindSeeds({
    player: PLAYER,
    blockhash: BLOCKHASH,
    count: seedCount,
  });
  const profile = COLOPHON_PROFILES[HEADLINE_PROFILE];
  const loadout = T5_LOADOUTS[HEADLINE_LOADOUT];

  console.log(
    `\n## Headline — ${seedCount.toLocaleString("en-US")} seeds`,
  );
  console.log(`Profile  ${profile.name}: ${profile.rationale}`);
  console.log(`Loadout  ${loadout.name}: ${loadout.rationale}`);

  const cells = STRATEGIES.map((strategy) =>
    measureCell({
      profile,
      loadout,
      strategy,
      seeds,
      editionHp: EDITION_HP,
      // Opens well above the half-pool threshold → phase 1 throughout,
      // which is where every attempt in a fresh edition lives.
      startHp: EDITION_HP,
    }),
  );
  for (const cell of cells) reportCell(cell);

  // Does skilled play move the budget? Compare this against the better of
  // the two cells above: if it barely improves on it, strategy is not a
  // dial and one strategy is enough to size an edition from.
  const best = bestOf(cells);
  console.log(
    `\n### optimal play — per-seed best of {${STRATEGIES.join(", ")}}`,
  );
  console.log(distHeader("turn limit"));
  cells[0]!.checkpoints.forEach((cp, i) => {
    const label = cp === HARD_TURN_CAP ? `≤${cp} (none)` : `${cp} rounds`;
    console.log(distRow(label, best.byCheckpoint[i]!));
  });

  // Convergence check on `max` / `p99.99`: once the per-decade gain is a
  // few percent those figures are quotable, and the last column also
  // bounds what a client brute-forcing nonces offline could gain.
  console.log(
    "\n### sample convergence — best attempt found vs. seeds tried (strategy = attack, no turn limit)",
  );
  console.log(
    `${"seeds".padStart(10)}${"median".padStart(10)}${"max".padStart(10)}${"spread".padStart(10)}${"Δmax".padStart(10)}`,
  );
  const sizes = [100, 1_000, 10_000, 100_000, 1_000_000].filter(
    (s) => s <= seedCount,
  );
  let prevMax: number | null = null;
  for (const g of tailGrowth(cells[0]!.perSeedDamage, sizes)) {
    const delta =
      prevMax === null
        ? "—"
        : `+${(((g.max - prevMax) / prevMax) * 100).toFixed(1)}%`;
    console.log(
      g.size.toLocaleString("en-US").padStart(10) +
        g.median.toFixed(0).padStart(10) +
        g.max.toFixed(0).padStart(10) +
        g.spread.toFixed(2).padStart(10) +
        delta.padStart(10),
    );
    prevMax = g.max;
  }

  // Phase 2 — the back half of every edition. The player gains a permanent
  // +2 to-hit; the boss's attack die steps up. Worth knowing because the
  // HP budget spends its second half here.
  const phase2 = measureCell({
    profile,
    loadout,
    strategy: "attack",
    seeds,
    editionHp: EDITION_HP,
    // At the threshold exactly → phase 2 from round one.
    startHp: Math.floor(EDITION_HP / 2),
  });
  console.log(`\n### phase 2 (same cell, opened at floor(editionHp / 2))`);
  console.log(outcomeLine(phase2));
  console.log("");
  console.log(distHeader("turn limit"));
  phase2.checkpoints.forEach((cp, i) => {
    const label = cp === HARD_TURN_CAP ? `≤${cp} (none)` : `${cp} rounds`;
    console.log(distRow(label, phase2.byCheckpoint[i]!));
  });
}

function runMatrix(seedCount: number): void {
  const seeds = grindSeeds({
    player: PLAYER,
    blockhash: BLOCKHASH,
    count: seedCount,
  });
  console.log(
    `\n## Sensitivity matrix — ${seedCount.toLocaleString("en-US")} seeds per cell, phase 1`,
  );
  console.log(
    "The Colophon's stat block does not exist yet, so the headline number is conditional on one.",
  );
  console.log(
    "These are the shapes it could plausibly take. Read the @30r block: that is where\n" +
      "gear and profile stop mattering much. The unbounded block is where they matter\n" +
      "most — a DR+dodge tank against a low-die boss cannot lose and cannot finish, so\n" +
      "it rides the loop guard. A turn limit is what makes the budget exist at all.\n",
  );
  for (const profile of Object.values(COLOPHON_PROFILES)) {
    console.log(`  ${profile.name.padEnd(10)} ${profile.rationale}`);
  }

  const picked: readonly number[] = [10, 30, HARD_TURN_CAP];
  console.log(
    `\n${"profile/loadout/strategy".padEnd(34)}` +
      picked
        .map((cp) =>
          (cp === HARD_TURN_CAP ? "unbounded" : `@${cp}r`).padStart(22),
        )
        .join(""),
  );
  console.log(
    `${"".padEnd(34)}` +
      picked.map(() => "  median    max spread".padStart(22)).join(""),
  );

  for (const profile of Object.values(COLOPHON_PROFILES)) {
    for (const loadout of Object.values(T5_LOADOUTS)) {
      for (const strategy of STRATEGIES) {
        const cell = measureCell({
          profile,
          loadout,
          strategy,
          seeds,
          editionHp: EDITION_HP,
          startHp: EDITION_HP,
        });
        const cols = picked
          .map((cp) => {
            const i = cell.checkpoints.indexOf(cp);
            const d = cell.byCheckpoint[i]!;
            return n(d.median, 8) + n(d.max, 7) + n(d.spread, 7);
          })
          .join("");
        console.log(
          `${`${profile.name}/${loadout.name}/${strategy}`.padEnd(34)}${cols}`,
        );
      }
    }
  }
}

/**
 * Turn the distribution into the two numbers S4 and S6 need.
 *
 * Attempts-to-kill is the figure to choose; HP is that choice multiplied
 * out. So attempt count is the axis, and each cell carries the percentage
 * of the pool one median attempt removes — the sanity check on whether the
 * bar visibly moves. Below roughly 1% per attempt it does not, and the
 * edition will not fall on a demo server either.
 */
function editionSizing(seedCount: number): void {
  const seeds = grindSeeds({
    player: PLAYER,
    blockhash: BLOCKHASH,
    count: seedCount,
  });
  const profile = COLOPHON_PROFILES[HEADLINE_PROFILE];
  const loadout = T5_LOADOUTS[HEADLINE_LOADOUT];
  const cell = measureCell({
    profile,
    loadout,
    strategy: "attack",
    seeds,
    editionHp: EDITION_HP,
    startHp: EDITION_HP,
  });

  console.log(
    "\n## Edition sizing\n" +
      "Pick attempts-to-kill, not HP: HP is just the product, and it is the less\n" +
      "legible of the two. Attempts also fix how far the bar moves per fight, which\n" +
      "is the column header below and is the sanity check — at 1% it does not\n" +
      "visibly move, and an edition that size will not fall on a demo server, so the\n" +
      "kill, the contributor list and the felled-editions record never get\n" +
      "exercised. Editions exist so that sizing low first is the safe mistake.",
  );
  console.log(
    `\nFirst pick the turn limit off survival: median ${cell.turnsSurvived.median} rounds, ` +
      `p99 ${cell.turnsSurvived.p99}.\n` +
      "At or above the median, death is the usual ending and \"dying contributes\"\n" +
      "carries weight. Well below it, the limit is the only ending and nobody dies.",
  );

  console.log(
    `\n${"turn limit".padEnd(13)}${"med dmg".padStart(9)}` +
      ATTEMPT_COUNTS.map((a) => `${a} attempts`.padStart(14)).join(""),
  );
  console.log(
    `${"".padEnd(13)}${"".padStart(9)}` +
      ATTEMPT_COUNTS.map((a) =>
        `${(100 / a).toFixed(1)}%/fight`.padStart(14),
      ).join(""),
  );
  cell.checkpoints.forEach((cp, i) => {
    const med = cell.byCheckpoint[i]!.median;
    const label = cp === HARD_TURN_CAP ? "unbounded" : `${cp} rounds`;
    console.log(
      label.padEnd(13) +
        med.toFixed(0).padStart(9) +
        ATTEMPT_COUNTS.map((a) =>
          Math.round(med * a)
            .toLocaleString("en-US")
            .padStart(14),
        ).join(""),
    );
  });
}

function main(): void {
  const argv = process.argv.slice(2);
  const matrixSeeds = parseIntFlag(argv, "--matrix-seeds", 10_000);
  const headlineOnly = argv.includes("--headline-only");
  const targetAttempts = parseIntFlag(argv, "--target-attempts", 0);

  if (targetAttempts > 0) {
    // Medians converge orders of magnitude earlier than the tail figures the
    // full report quotes, so this mode does not need 100k — and it measures
    // two phases, so it would pay for them twice.
    const seedCount = argv.includes("--seeds")
      ? parseIntFlag(argv, "--seeds", 20_000)
      : 20_000;
    runTargetSizing({
      seedCount,
      profileName: parseChoiceFlag(
        argv,
        "--profile",
        Object.keys(COLOPHON_PROFILES) as ProfileName[],
        HEADLINE_PROFILE,
      ),
      loadoutName: parseChoiceFlag(
        argv,
        "--loadout",
        Object.keys(T5_LOADOUTS) as LoadoutName[],
        HEADLINE_LOADOUT,
      ),
      strategy: parseChoiceFlag(argv, "--strategy", STRATEGIES, "attack"),
      turnLimit: parseIntFlag(argv, "--turn-limit", 30),
      attempts: targetAttempts,
    });
    return;
  }

  const headlineSeeds = parseIntFlag(argv, "--seeds", 100_000);

  console.log("# Colophon raid damage distribution (S1)");
  console.log(
    "Output: a turn limit and an edition HP total, both read off a measured\n" +
      "distribution rather than inferred from d12+4.",
  );
  console.log(
    "\nMethod: sweep the `deriveRunSeed` nonce for production-shaped seeds, replay a\n" +
      "fixed T5 loadout against a bottomless pool through the real `resolveRound`, and\n" +
      "snapshot cumulative damage at each candidate turn limit. One attempt per seed;\n" +
      "every turn limit read off the same attempt.",
  );
  console.log(
    `Checkpoints: ${TURN_CHECKPOINTS.join(", ")} rounds. Edition pool: ${EDITION_HP.toLocaleString("en-US")}.`,
  );
  console.log(
    `\nBoss effects: ${LIVE_BOSS_EFFECTS.length} of 9 catalog names work on the monster side; ` +
      `${INERT_BOSS_EFFECTS.join("/")} is inert\n` +
      "by design (it needs a player-directed DoT counter). A boss baking it is tuned as\n" +
      "if it had one effect — the `roster` profile below is that case.",
  );

  runHeadline(headlineSeeds);
  editionSizing(headlineSeeds);
  if (!headlineOnly) runMatrix(matrixSeeds);
}

main();
