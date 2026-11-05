"use client";

/**
 * `/play/colophon` — the shared-pool boss.
 *
 * Structurally unlike `/play/[preset]`, which is why it does not reuse
 * `EncounterFrame`: that component owns escrow, extraction, loot rolls and
 * the realm interstitials, and the raid has none of them. One room, no
 * descent, no loot, nothing to bank. What it has instead is a pool shared
 * with everyone else and a server that wants to hear about damage as it
 * happens. So this composes the leaf pieces — `CombatLog`, `ActionChoices`,
 * `PlayerBar` — around its own loop rather than bending a 600-line component
 * that drives the main game.
 *
 * ## Three states, and "sealed" is one of them
 *
 * The page renders before the raid is reachable, on purpose. A sealed door
 * that tells you how far off it is beats a 404, so the gate's progress is a
 * surface rather than an absence. After he falls, the contributor list is
 * the record and stays on screen — it is the whole point of the edition
 * having happened.
 *
 * ## The fight runs here, and the server is told
 *
 * `startRun({ bossDepth: 1, raidBoss })` with the **server-issued** seed, so
 * the client cannot pick its luck. Each round posts the attempt's cumulative
 * damage, which is what makes "dying contributes" true for an abandoned
 * attempt as well as a lost one: the damage has already landed, so closing
 * the tab forfeits at most the current round rather than the whole fight.
 *
 * Progress posts are deliberately *not* awaited before the next round is
 * playable. A round-trip between every swing would make the fight feel like
 * a form submission, and the report is cumulative — so a dropped or
 * out-of-order post is corrected by the next one rather than losing damage.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";

import type {
  ActionChoice,
  AssetCard,
  CombatState,
  NarrationLine,
  RunState,
} from "@/lib/engine/types";
import { startRun, step } from "@/lib/engine";
import { CANONICAL_SCHEMAS, makeStarterGear } from "@/lib/engine/runtime";
import { colophonBoss } from "@/lib/raid/colophon";
import { loadEquipped } from "@/lib/persistence/equipped";
import { CombatLog } from "@/components/game/CombatLog";
import { ActionChoices } from "@/components/game/ActionChoices";
import { AppShell, Panel } from "@/components/ui";

/** Shape of `GET /api/raid/state`. */
type RaidState = {
  ok: true;
  gate: {
    unlocked: boolean;
    t5Clears: number;
    required: number;
    remaining: number;
    overridden: boolean;
  };
  boss: {
    edition: number;
    totalHp: number;
    currentHp: number;
    phase: 1 | 2;
    felled: boolean;
  } | null;
  contributors: {
    player: string;
    damage: number;
    attempts: number;
    killingBlow: boolean;
  }[];
  attemptsAvailable: number | null;
};

type Issued = {
  attemptId: `0x${string}`;
  rngSeed: `0x${string}`;
  edition: number;
  turnLimit: number;
  startHp: number;
  editionHp: number;
};

/**
 * The pool, polled.
 *
 * `refetchInterval` is the first in the app — every existing read hook uses
 * `staleTime: 15_000` with no polling, because every other number here only
 * changes when you change it. This one moves because *other people* are
 * fighting, and a bar that updates on focus would miss the thing it exists
 * to show. The server answers from an in-memory value invalidated on write
 * (see `raid-db.ts`), so a poll costs no database read.
 */
function useRaidState(player?: `0x${string}`) {
  return useQuery<RaidState>({
    queryKey: ["raid", "state", player ?? null],
    queryFn: async () => {
      const qs = player ? `?player=${player}` : "";
      const res = await fetch(`/api/raid/state${qs}`);
      const body = (await res.json()) as RaidState | { ok: false; message: string };
      if (!("ok" in body) || !body.ok) {
        throw new Error("message" in body ? body.message : "raid state failed");
      }
      return body;
    },
    refetchInterval: 5_000,
    staleTime: 0,
  });
}

function pct(current: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (current / total) * 100));
}

function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** The shared pool, with the number visible — not "the spine creaks". */
function PoolBar({ boss }: { boss: NonNullable<RaidState["boss"]> }) {
  const remaining = pct(boss.currentHp, boss.totalHp);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="opacity-70">
          Edition {boss.edition}
          {boss.phase === 2 && !boss.felled ? " · he has stopped holding back" : ""}
        </span>
        <span className="font-mono">
          {boss.currentHp.toLocaleString()} / {boss.totalHp.toLocaleString()}
        </span>
      </div>
      <div
        className="h-3 w-full overflow-hidden rounded-full bg-black/30"
        role="progressbar"
        aria-valuenow={boss.currentHp}
        aria-valuemin={0}
        aria-valuemax={boss.totalHp}
        aria-label="The Colophon's remaining weight"
      >
        <div
          className={`h-full transition-[width] duration-700 ${
            boss.phase === 2 ? "bg-rose-500/80" : "bg-amber-400/80"
          }`}
          style={{ width: `${remaining}%` }}
        />
      </div>
    </div>
  );
}

function Contributors({ rows }: { rows: RaidState["contributors"] }) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-1 text-sm">
      <h3 className="opacity-70">Who has leaned on him</h3>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.player} className="flex justify-between font-mono text-xs">
            <span>
              {short(r.player)}
              {r.killingBlow ? " ✦" : ""}
            </span>
            <span className="opacity-70">
              {r.damage.toLocaleString()} over {r.attempts}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ColophonPage() {
  const { address } = useAccount();
  const { data, error, refetch } = useRaidState(address);

  const [issued, setIssued] = useState<Issued | null>(null);
  const [run, setRun] = useState<RunState | null>(null);
  const [feed, setFeed] = useState<readonly NarrationLine[]>([]);
  const [trace, setTrace] = useState("");
  const [opening, setOpening] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  /**
   * Cumulative damage already reported. Held in a ref rather than state
   * because the next report must read the latest value synchronously —
   * going through a render would let two rounds in quick succession both
   * read the same stale total.
   */
  const reported = useRef(0);

  const equipped = useMemo<{ weapon?: AssetCard; armor?: AssetCard }>(() => {
    const saved = loadEquipped();
    if (saved?.weapon || saved?.armor) return saved;
    // Starter gear is a floor, not a real raid loadout — S1 measured bare
    // T5 at 135 damage against 344 for an effected one. It keeps the page
    // playable for someone who has never equipped anything.
    return makeStarterGear(
      "fantasy",
      "0x0000000000000000000000000000000000000000",
      "The Colophon",
    );
  }, []);

  const combat: CombatState | null =
    run?.encounter?.kind === "combat" ? run.encounter.combat : null;

  const report = useCallback(
    (at: Issued, state: RunState, nextTrace: string, dealt: number) => {
      const body = {
        attemptId: at.attemptId,
        player: address,
        cumulativeDamage: dealt,
        turns: nextTrace.length,
        survived: !state.defeated,
        trace: nextTrace,
      };
      // Fire-and-forget: the report is cumulative, so a dropped or
      // out-of-order post is corrected by the next one. Awaiting it would
      // put a round-trip between every swing.
      void fetch("/api/raid/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
        .then(() => refetch())
        .catch(() => {
          /* The next round re-reports the same cumulative total. */
        });
    },
    [address, refetch],
  );

  const begin = useCallback(async () => {
    if (!address) return;
    setProblem(null);
    setOpening(true);
    try {
      const res = await fetch("/api/raid/attempt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ player: address }),
      });
      const body = (await res.json()) as
        | Issued
        | { ok: false; reason: string; message: string };
      if ("ok" in body && body.ok === false) {
        setProblem(body.message);
        return;
      }
      const at = body as Issued;
      const opened = startRun({
        preset: "fantasy",
        realm: "0x0000000000000000000000000000000000000000",
        rngSeed: at.rngSeed,
        equipped,
        bossId: "the_colophon",
        schemas: CANONICAL_SCHEMAS.fantasy,
        bossDepth: 1,
        raidBoss: { boss: colophonBoss(at.editionHp), startHp: at.startHp },
      });
      reported.current = 0;
      setIssued(at);
      setTrace("");
      setFeed(opened.lines);
      setRun(opened.state);
      void refetch();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setOpening(false);
    }
  }, [address, equipped, refetch]);

  const choose = useCallback(
    (choice: ActionChoice) => {
      if (!run || !issued) return;
      const res = step(run, choice);
      const nextTrace = trace + (choice.kind === "attack" ? "a" : "s");
      const nextCombat =
        res.state.encounter?.kind === "combat" ? res.state.encounter.combat : null;
      // Damage is the pool delta from where this attempt opened. Clamped at
      // 0 because the boss's regen can push the pool back above the opening
      // value, and an attempt never contributes negative damage.
      const dealt = Math.max(0, issued.startHp - (nextCombat?.monsterHp ?? issued.startHp));

      setRun(res.state);
      setTrace(nextTrace);
      setFeed((prev) => [...prev, ...res.outcome]);

      // The last round always reports, even if it dealt nothing, because
      // `survived` is only correct once the fight has actually ended — and
      // it is the round where that matters most. Mid-fight, a round that
      // changed nothing needs no post.
      const ended =
        res.state.defeated ||
        res.state.bossCleared ||
        nextTrace.length >= issued.turnLimit;
      if (dealt !== reported.current || ended) {
        reported.current = dealt;
        report(issued, res.state, nextTrace, dealt);
      }
    },
    [run, issued, trace, report],
  );

  // The turn limit is the attempt's, fixed when it was issued.
  const roundsLeft = issued ? issued.turnLimit - trace.length : 0;
  const over =
    run !== null &&
    (run.defeated || run.bossCleared || roundsLeft <= 0 || combat === null);

  const gate = data?.gate;
  const boss = data?.boss ?? null;
  const attempts = data?.attemptsAvailable ?? 0;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-2xl space-y-6 p-4">
        <header className="space-y-1">
          <h1 className="text-2xl">The Colophon</h1>
          <p className="text-sm opacity-70">
            Two hundred years of other people&apos;s margins, bound and
            standing. One pool, everyone&apos;s blows, and it never heals.
          </p>
        </header>

        {error ? (
          <Panel>
            <p className="text-sm">The raid could not be read: {error.message}</p>
          </Panel>
        ) : null}

        {gate && !gate.unlocked ? (
          <Panel>
            <div className="space-y-2">
              <h2 className="text-lg">Sealed</h2>
              <p className="text-sm opacity-80">
                He is not met until the shelf is deep enough to hold him.
                {" "}
                <span className="font-mono">
                  {gate.t5Clears} / {gate.required}
                </span>{" "}
                clears of fifth-tier realms counted — {gate.remaining} to go.
              </p>
              <p className="text-xs opacity-60">
                Every realm cleared at the fifth tier moves this, and earns the
                clearer an attempt when it opens.
              </p>
            </div>
          </Panel>
        ) : null}

        {boss ? (
          <Panel>
            <div className="space-y-4">
              <PoolBar boss={boss} />
              {boss.felled ? (
                <p className="text-sm">
                  Edition {boss.edition} has fallen. The record below is
                  permanent.
                </p>
              ) : null}
              <Contributors rows={data?.contributors ?? []} />
            </div>
          </Panel>
        ) : gate?.unlocked ? (
          <Panel>
            <p className="text-sm opacity-80">
              The way is open but no edition stands. An operator opens the next
              one.
            </p>
          </Panel>
        ) : null}

        {gate?.unlocked && boss && !boss.felled ? (
          <Panel>
            {!address ? (
              <p className="text-sm opacity-80">
                Connect a wallet to see what you have earned.
              </p>
            ) : run === null ? (
              <div className="space-y-3">
                <p className="text-sm">
                  You hold{" "}
                  <span className="font-mono">{attempts}</span> attempt
                  {attempts === 1 ? "" : "s"}.
                </p>
                {attempts > 0 ? (
                  <button
                    type="button"
                    onClick={begin}
                    disabled={opening}
                    className="rounded-lg border border-white/20 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
                  >
                    {opening ? "Opening the binding…" : "Lean on him"}
                  </button>
                ) : (
                  <p className="text-sm opacity-70">
                    Clear a fifth-tier realm to earn one.
                  </p>
                )}
                {problem ? (
                  <p className="text-sm text-rose-300">{problem}</p>
                ) : null}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between text-xs opacity-70">
                  <span>
                    You: {combat?.playerHp ?? 0} / {combat?.playerMaxHp ?? 0} HP
                  </span>
                  <span className="font-mono">
                    {Math.max(0, roundsLeft)} round
                    {roundsLeft === 1 ? "" : "s"} left
                  </span>
                </div>
                <CombatLog lines={feed} />
                {over ? (
                  <div className="space-y-3">
                    <p className="text-sm">
                      {run.bossCleared
                        ? "He goes down. You were the one holding the pen."
                        : run.defeated
                          ? "You fall — and the weight you took off him stays off."
                          : "Your rounds are spent. What you took off him stays off."}
                    </p>
                    <p className="text-xs opacity-60 font-mono">
                      {reported.current.toLocaleString()} taken off the pool
                      over {trace.length} round{trace.length === 1 ? "" : "s"}.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setRun(null);
                        setIssued(null);
                        void refetch();
                      }}
                      className="rounded-lg border border-white/20 px-4 py-2 text-sm hover:bg-white/10"
                    >
                      Step back
                    </button>
                  </div>
                ) : run.encounter ? (
                  <ActionChoices
                    encounter={run.encounter}
                    equipped={equipped}
                    onChoose={choose}
                  />
                ) : null}
              </div>
            )}
          </Panel>
        ) : null}

        <p className="text-xs opacity-50">
          <Link href="/" className="underline">
            Back to the base
          </Link>
        </p>
      </div>
    </AppShell>
  );
}
