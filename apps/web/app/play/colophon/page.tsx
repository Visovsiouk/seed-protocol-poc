"use client";

/**
 * `/play/colophon` — the shared-pool boss.
 *
 * Structurally unlike `/play/[preset]`, which is why it does not reuse
 * `EncounterFrame`: that component owns escrow, extraction, loot rolls and
 * the realm interstitials, and the raid has none of them. One room, no
 * descent, no loot, nothing to bank. What it has instead is a pool shared
 * with everyone else and a server that wants to hear about damage as it
 * happens.
 *
 * **Leaf pieces, not a different game.** Skipping `EncounterFrame` is a
 * statement about escrow and loot, not about presentation. Everything below
 * it is shared with the other two play routes and composed in the same
 * order — `EncounterStage` in a fixed-height focal slot, `CombatLog`,
 * `PlayerBar` hosting `ActionChoices` — plus the same `useRealmTheme` /
 * `useRealmMusic` pair every play route calls, the same `useEquippedHydration`
 * both of the others read their loadout through, and the same combat audio
 * and phase-turn toast `EncounterFrame` fires. An earlier revision hand-rolled
 * each of those, and the result was the one fight in the game with no palette,
 * no music, no sound, no loadout on screen and an invisible enemy — which read
 * as the raid being a different kind of thing. It is not.
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

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";

import type {
  ActionChoice,
  CombatState,
  NarrationLine,
  RunState,
} from "@/lib/engine/types";
import { startRun, step } from "@/lib/engine";
import { CANONICAL_SCHEMAS, makeStarterGear } from "@/lib/engine/runtime";
import { ZERO_ADDRESS } from "@/lib/contracts/realm-picker";
import { colophonBoss } from "@/lib/raid/colophon";
import { useEquippedHydration } from "@/lib/persistence/use-equipped-hydration";
import { useRealmTheme } from "@/lib/ui/useRealmTheme";
import { useRealmMusic } from "@/lib/audio/useRealmMusic";
import { useAudio } from "@/lib/audio/AudioProvider";
import { playBeats, sfxForEvent } from "@/lib/audio/gameplay";
import { shortAddress } from "@/lib/utils";
import { ActionChoices } from "@/components/game/ActionChoices";
import { ChoiceRow } from "@/components/game/ChoiceRow";
import { CombatLog } from "@/components/game/CombatLog";
import { EncounterStage } from "@/components/game/EncounterStage";
import { PlayerBar } from "@/components/game/PlayerBar";
import {
  AppShell,
  Footnote,
  Meter,
  Panel,
  Stamp,
  useNotify,
} from "@/components/ui";

/**
 * The raid's genre. He stands at the end of the fantasy page, so the route
 * wears that palette, plays that track and speaks that element vocabulary —
 * the same three things `/play/[preset]` derives from its route param.
 */
const PRESET = "fantasy" as const;

/**
 * The raid belongs to no realm, so the run boots against the zero address.
 * That is load-bearing rather than a placeholder: `presetForRealm` returns
 * null for it, which makes every gear translation in `useEquippedHydration`
 * and `PlayerBar` a synchronous no-op. Carried gear keeps its native numbers,
 * which is right — there is no realm here to restate them in.
 */
const RAID_REALM = ZERO_ADDRESS;

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
  receipts: {
    player: string;
    damage: number;
    shareBps: number;
    attempts: number;
    killingBlow: boolean;
    minted: boolean;
  }[];
  editions: {
    edition: number;
    totalHp: number;
    currentHp: number;
    felledAt: number | null;
    openedAt: number;
  }[];
  recordEdition: number | null;
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
function useRaidState(player?: `0x${string}`, edition?: number | null) {
  return useQuery<RaidState>({
    queryKey: ["raid", "state", player ?? null, edition ?? null],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (player) params.set("player", player);
      if (edition != null) params.set("edition", String(edition));
      const qs = params.size > 0 ? `?${params}` : "";
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

// ─── the record, as three ledgers ───────────────────────────────────────────
// Contributors, receipts and editions are the same two-column line — who on
// the left, the number on the right — so they are one row and one list here
// rather than three near-identical copies of the markup. `Row` is a `<span>`
// so the edition list can wrap it in the button that selects that edition
// without nesting a block element inside it.

function Ledger({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Stamp tone="muted">{title}</Stamp>
      <ul className="flex flex-col gap-1">{children}</ul>
    </div>
  );
}

function Row({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <span className="flex justify-between gap-4 font-mono text-xs">
      <span>{left}</span>
      <span className="tabular-nums opacity-70">{right}</span>
    </span>
  );
}

/**
 * The shared pool, with the number visible — not "the spine creaks".
 *
 * Uses the kit's `Meter` rather than a third hand-rolled bar. The two in the
 * combat HUD (`EncounterStage`, `PlayerBar`) are bespoke because they animate
 * hits — shake, floating damage numbers; this one is a passive readout that
 * ticks on a five-second poll, which is exactly what `Meter` is for, and its
 * tokens re-theme with the preset where the old inline `bg-amber-400/80` did
 * not. `Meter` is decorative, so the role and the value live on the wrapper.
 */
function PoolBar({ boss }: { boss: NonNullable<RaidState["boss"]> }) {
  const turned = boss.phase === 2 && !boss.felled;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <Stamp tone="accent">Edition {boss.edition}</Stamp>
        <span className="font-mono tabular-nums">
          {boss.currentHp.toLocaleString()} / {boss.totalHp.toLocaleString()}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={boss.currentHp}
        aria-valuemin={0}
        aria-valuemax={boss.totalHp}
        aria-label="The Colophon's remaining weight"
      >
        <Meter
          value={boss.currentHp}
          max={boss.totalHp}
          size="lg"
          color={turned ? "var(--color-danger)" : "var(--color-preset-accent)"}
        />
      </div>
      {turned && <Footnote>He has stopped holding back</Footnote>}
    </div>
  );
}

function Contributors({ rows }: { rows: RaidState["contributors"] }) {
  if (rows.length === 0) return null;
  return (
    <Ledger title="Who has leaned on him">
      {rows.map((r) => (
        <li key={r.player}>
          <Row
            left={`${shortAddress(r.player)}${r.killingBlow ? " ✦" : ""}`}
            right={`${r.damage.toLocaleString()} over ${r.attempts}`}
          />
        </li>
      ))}
    </Ledger>
  );
}

/**
 * The kill's payout record.
 *
 * Shows owed receipts as owed rather than hiding them until they mint. A
 * surface that only listed minted ones would imply nobody was credited
 * during the window between the fall and the last transaction confirming —
 * which is exactly when people will be looking.
 */
function Receipts({ rows }: { rows: RaidState["receipts"] }) {
  if (rows.length === 0) return null;
  const owed = rows.filter((r) => !r.minted).length;
  return (
    <Ledger title={`Receipts${owed > 0 ? ` — ${owed} still being written` : ""}`}>
      {rows.map((r) => (
        <li key={r.player}>
          <Row
            left={`${shortAddress(r.player)}${r.killingBlow ? " ✦" : ""}`}
            right={`${(r.shareBps / 100).toFixed(2)}%${r.minted ? "" : " · pending"}`}
          />
        </li>
      ))}
    </Ledger>
  );
}

/**
 * Every edition, felled or standing.
 *
 * This is why editions exist rather than one permanent kill: each fall stays
 * on the record, dated, instead of being replaced by the next boss. A
 * one-shot boss falls once on a demo server and every later visitor arrives
 * at a plaque — this way they arrive at a plaque *and* a fight.
 */
function Editions({
  rows,
  showing,
  onShow,
}: {
  rows: RaidState["editions"];
  showing: number | null;
  onShow: (edition: number) => void;
}) {
  const felled = rows.filter((e) => e.felledAt !== null);
  if (felled.length === 0) return null;
  return (
    <Ledger title="Felled">
      {felled.map((e) => (
        <li key={e.edition}>
          <button
            type="button"
            onClick={() => onShow(e.edition)}
            aria-current={showing === e.edition}
            className={`w-full transition-opacity hover:opacity-100 ${
              showing === e.edition ? "opacity-100" : "opacity-70"
            }`}
          >
            <Row
              left={`Edition ${e.edition}${
                showing === e.edition ? " — shown below" : ""
              }`}
              right={`${e.totalHp.toLocaleString()} · ${new Date(
                e.felledAt! * 1000,
              )
                .toISOString()
                .slice(0, 10)}`}
            />
          </button>
        </li>
      ))}
    </Ledger>
  );
}

/**
 * The attempt, over.
 *
 * Fills the focal slot where he was standing, the way `RunOverPanel` and
 * `ExtractedPanel` do at the end of a delve — the outcome replaces the enemy
 * instead of being inserted below the log and shoving the HUD down.
 *
 * Deliberately *not* `DefeatOverlay`, which every other death in the game
 * shows: that overlay is about permadeath and the escrow it forfeits, and a
 * lost attempt here costs neither. The damage already landed, and you keep
 * the attempts you have left.
 */
function AttemptOverPanel({
  run,
  dealt,
  rounds,
  onStepBack,
}: {
  run: RunState;
  dealt: number;
  rounds: number;
  onStepBack: () => void;
}) {
  const felled = run.bossCleared;
  return (
    <Panel
      as="section"
      tone={felled ? "ok" : "glass-2"}
      aria-label="Attempt over"
      className="flex flex-col gap-3 p-5"
    >
      <h2
        className="text-base font-semibold"
        style={felled ? { color: "var(--color-ok)" } : undefined}
      >
        {felled
          ? "He goes down. You were the one holding the pen."
          : run.defeated
            ? "You fall — and the weight you took off him stays off."
            : "Your rounds are spent. What you took off him stays off."}
      </h2>
      <p className="font-mono text-xs tabular-nums opacity-70">
        {dealt.toLocaleString()} taken off the pool over {rounds} round
        {rounds === 1 ? "" : "s"}.
      </p>
      <ChoiceRow
        ariaLabel="Step back from the binding"
        showHint={false}
        choices={[
          {
            key: "step-back",
            label: "Step back",
            variant: "primary",
            onClick: onStepBack,
          },
        ]}
      />
    </Panel>
  );
}

export default function ColophonPage() {
  const { address } = useAccount();
  /**
   * Which edition's record is on screen. `null` means "whatever is current",
   * so the page follows the live pool until someone deliberately looks back
   * at a past kill.
   */
  const [viewing, setViewing] = useState<number | null>(null);
  const { data, error, refetch } = useRaidState(address, viewing);

  const [issued, setIssued] = useState<Issued | null>(null);
  const [run, setRun] = useState<RunState | null>(null);
  const [intro, setIntro] = useState("");
  const [feed, setFeed] = useState<readonly NarrationLine[]>([]);
  const [trace, setTrace] = useState("");
  const [opening, setOpening] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // The same palette, skin and track the other two play routes set. Both
  // restore on unmount, so leaving the raid hands the chrome and the music
  // back exactly as leaving a delve does.
  useRealmTheme(PRESET, null, "crt");
  useRealmMusic(PRESET);
  const { play } = useAudio();
  const notify = useNotify();

  /**
   * Cumulative damage already reported. Held in a ref rather than state
   * because the next report must read the latest value synchronously —
   * going through a render would let two rounds in quick succession both
   * read the same stale total.
   */
  const reported = useRef(0);

  // Starter gear is a floor, not a real raid loadout — S1 measured bare T5 at
  // 135 damage against 344 for an effected one. It keeps the page playable for
  // someone who has never equipped anything.
  const starterGear = useMemo(
    () => makeStarterGear(PRESET, RAID_REALM, "The Colophon"),
    [],
  );

  /**
   * The staged loadout, read the way both delve routes read it.
   *
   * This replaces a `useMemo(() => loadEquipped() ?? starter, [])`, which was
   * a hydration mismatch waiting to happen: `loadEquipped` returns null on the
   * server and the snapshot on the client, so the two renders disagreed about
   * what you were holding. The hook reads it in an effect instead, and applies
   * the same rule the delve routes do — a *starter* from another realm is
   * discarded for this one's, while real on-chain gear travels.
   */
  const { runStartEquipped } = useEquippedHydration({
    realm: RAID_REALM,
    starterGear,
  });

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
    if (!address || !runStartEquipped) return;
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
        preset: PRESET,
        realm: RAID_REALM,
        rngSeed: at.rngSeed,
        equipped: runStartEquipped,
        bossId: "the_colophon",
        schemas: CANONICAL_SCHEMAS[PRESET],
        bossDepth: 1,
        raidBoss: { boss: colophonBoss(at.editionHp), startHp: at.startHp },
      });
      reported.current = 0;
      setIssued(at);
      setTrace("");
      // Same split `EncounterFrame` makes: the first line is the room's
      // scene-setting and belongs on the stage, the rest start the log. The
      // page used to hand line 0 to both, so it was printed twice.
      const [first, ...rest] = opened.lines;
      setIntro(first?.text ?? "");
      setFeed(rest);
      setRun(opened.state);
      void refetch();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setOpening(false);
    }
  }, [address, runStartEquipped, refetch]);

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

      // Swing sounds first — they're the response to the click — then the
      // event stings, matching the order the fiction resolves in and the
      // order `EncounterFrame` plays them in.
      playBeats(res.beats, play);
      for (const ev of res.events) {
        const sfx = sfxForEvent(ev);
        if (sfx) play(sfx);
      }
      // The turn, announced the way every other boss announces it: a danger
      // toast in the global stack, floating clear of the stage. The pool bar
      // says the same thing for anyone watching without an attempt open.
      if (combat?.bossPhase === 1 && nextCombat?.bossPhase === 2) {
        notify({
          tone: "danger",
          title: "Phase 2",
          description: `${combat.monster.name} stops holding back — whatever keeps it is done pretending.`,
        });
      }

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
    [run, issued, trace, report, combat, notify, play],
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
    <AppShell back={{ href: "/", label: "← Realms" }} title="The Colophon">
      <section className="mx-auto flex max-w-4xl flex-col gap-4">
        {error ? (
          <Panel as="aside" tone="warn" aria-label="Raid unreadable" className="p-3 text-sm">
            The raid could not be read: {error.message}
          </Panel>
        ) : null}

        {gate && !gate.unlocked ? (
          <Panel as="section" tone="glass-2" aria-label="Sealed" className="flex flex-col gap-2 p-4">
            <h2 className="text-base font-semibold">Sealed</h2>
            <p className="text-sm leading-relaxed opacity-80">
              He is not met until the shelf is deep enough to hold him.{" "}
              <span className="font-mono tabular-nums">
                {gate.t5Clears} / {gate.required}
              </span>{" "}
              clears of fifth-tier realms counted — {gate.remaining} to go.
            </p>
            <Footnote>
              Every fifth-tier clear moves this, and earns its clearer an attempt
            </Footnote>
          </Panel>
        ) : null}

        {boss ? (
          <Panel as="section" tone="glass-2" aria-label="The shared pool" className="flex flex-col gap-4 p-4">
            <PoolBar boss={boss} />
            {boss.felled ? (
              <p className="text-sm">
                Edition {boss.edition} has fallen. The record below is permanent.
              </p>
            ) : null}
            {data?.recordEdition != null && data.recordEdition !== boss.edition ? (
              <p className="text-xs opacity-60">
                Showing edition {data.recordEdition}&apos;s record.{" "}
                <button
                  type="button"
                  onClick={() => setViewing(null)}
                  className="underline"
                >
                  Back to the one standing
                </button>
              </p>
            ) : null}
            <Contributors rows={data?.contributors ?? []} />
            <Receipts rows={data?.receipts ?? []} />
            <Editions
              rows={data?.editions ?? []}
              showing={data?.recordEdition ?? null}
              onShow={setViewing}
            />
          </Panel>
        ) : gate?.unlocked ? (
          <Panel as="section" tone="glass-2" aria-label="No edition open" className="p-4">
            <p className="text-sm opacity-80">
              The way is open but no edition stands. An operator opens the next
              one.
            </p>
          </Panel>
        ) : null}

        {gate?.unlocked && boss && !boss.felled ? (
          !address ? (
            <Panel as="section" tone="glass-2" aria-label="Wallet required" className="p-4">
              <p className="text-sm opacity-80">
                Connect a wallet to see what you have earned.
              </p>
            </Panel>
          ) : run === null ? (
            <Panel as="section" tone="glass-2" aria-label="Your attempts" className="flex flex-col gap-3 p-4">
              <p className="text-sm">
                You hold <span className="font-mono tabular-nums">{attempts}</span>{" "}
                attempt{attempts === 1 ? "" : "s"}.
              </p>
              {attempts > 0 ? (
                <ChoiceRow
                  ariaLabel="Open an attempt"
                  showHint={false}
                  choices={[
                    {
                      key: "begin",
                      label: opening ? "Opening the binding…" : "Lean on him",
                      variant: "primary",
                      // Held until the loadout has hydrated — the same gate
                      // `/play/[preset]` puts in front of `startRun`, so the
                      // fight can never open against half-equipped stats.
                      disabled: opening || !runStartEquipped,
                      onClick: () => void begin(),
                    },
                  ]}
                />
              ) : (
                <p className="text-sm opacity-70">
                  Clear a fifth-tier realm to earn one.
                </p>
              )}
              {problem ? <p className="text-sm text-[var(--color-danger)]">{problem}</p> : null}
            </Panel>
          ) : (
            /*
              The same three panes as a delve, in the same order:
              Main · Log · Player. The focal slot is locked to the same fixed
              height `EncounterFrame` uses, so the log and the HUD never move
              when the stage gives way to the outcome; it relaxes to `min-h`
              once the attempt is over, because there is no combat below left
              to protect.

              No `bookmark` and no `ghostReveal`: both name or surface the
              filed borrower inside a boss, and the Colophon is the one boss
              who filed everybody else. There is nobody in him to surface.
            */
            <div className="flex flex-col gap-4">
              <div className={over ? "min-h-[22rem]" : "h-[22rem]"}>
                {over ? (
                  <AttemptOverPanel
                    run={run}
                    dealt={reported.current}
                    rounds={trace.length}
                    onStepBack={() => {
                      setRun(null);
                      setIssued(null);
                      void refetch();
                    }}
                  />
                ) : (
                  <EncounterStage
                    encounter={run.encounter}
                    intro={intro}
                    activePreset={PRESET}
                    equippedWeapon={run.equipped.weapon}
                  />
                )}
              </div>
              <CombatLog lines={feed} />
              {!over && (
                <Footnote>
                  {Math.max(0, roundsLeft)} round{roundsLeft === 1 ? "" : "s"} left
                </Footnote>
              )}
              <PlayerBar
                run={run}
                combat={combat ?? undefined}
                actions={
                  over || !run.encounter ? null : (
                    <ActionChoices
                      encounter={run.encounter}
                      equipped={run.equipped}
                      onChoose={choose}
                    />
                  )
                }
              />
            </div>
          )
        ) : null}
      </section>
    </AppShell>
  );
}
