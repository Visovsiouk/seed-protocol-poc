"use client";

/**
 * Centerpiece of `/play/[preset]`.
 * Holds the live `RunState` and drives the engine in response to player
 * input:
 *
 *   step(state, choice)         → consume player action
 *   advance(state, bossId)      → Descend: next room after a clear
 *   extract(state)              → Extract: end the run, bank the escrow
 *   commitExtraction(state)     → clear escrow once the batch mint settles
 *
 * The delve loop replaces the old per-room mint: loot found is carried in
 * `state.escrow` (unminted) and only banks on Extract or a boss clear.
 *
 * What lives here vs the children:
 *
 *   - `<RoomNarration/>` gets the room's intro paragraph (the first info
 *     line we received when the room was generated).
 *   - `<CombatLog/>` gets the rolling feed of every subsequent line from
 *     step()/phase-transitions/loot-drops.
 *   - `<HUD/>` reads HP/AC from the live `CombatState` when one is
 *     active, otherwise from the equipped armor baseline.
 *   - `<ActionChoices/>` only renders while an encounter is active.
 *   - `<EscrowTray/>` lists the carried (unminted) findings at the
 *     between-rooms decision point.
 *   - The Descend / Extract decision row shows once a room is cleared and
 *     no encounter is active (Extract only when `extractable` and the
 *     escrow is non-empty).
 *
 * Boss phase 1→2 transition is detected by diffing the previous and next
 * `combat.bossPhase` after each `step()`, and surfaced via
 * `<BossPhaseBanner/>` for ~4 seconds.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ActionChoice,
  AssetCard,
  EngineEvent,
  EscrowEntry,
  NarrationLine,
  Preset,
  RunState,
} from "@/lib/engine/types";
import {
  advance as engineAdvance,
  commitExtraction as engineCommitExtraction,
  extract as engineExtract,
  equipItem as engineEquipItem,
  step as engineStep,
} from "@/lib/engine";
import { ActionChoices } from "./ActionChoices";
import { ChoiceRow, type Choice } from "./ChoiceRow";
import { BossPhaseBanner } from "./BossPhaseBanner";
import { CombatLog } from "./CombatLog";
import { EscrowTray } from "./EscrowTray";
import { HUD } from "./HUD";
import { RoomNarration } from "./RoomNarration";
import { Panel } from "@/components/ui";

/** Status of the batched escrow mint at extraction / boss clear. */
type BankStatus =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "done"; count: number }
  | { kind: "failed"; error: string };

type Props = {
  /** Initial state from `startRun()`. */
  initialState: RunState;
  /** Initial narration lines from `startRun()` — first one becomes the room intro. */
  initialLines: readonly NarrationLine[];
  /** Boss id required by `advance()` once the run reaches BOSS_DEPTH. */
  bossId: string;
  /**
   * Controlled equipped slots. Parent (the play page) owns this so the
   * `<InventoryDrawer/>` can update it; we mirror it into the engine
   * `RunState` via `equipItem` on every change. Per the
   * active combat stats stay frozen — the new gear takes effect on the
   * next room.
   */
  equipped?: { weapon?: AssetCard; armor?: AssetCard };
  /** Optional hook so the parent can react to LootDropped/RoomCleared/BossCleared. */
  onEvent?: (event: EngineEvent) => void;
  /**
   * Status of the clearReceipt mint, surfaced in the run-over panel.
   * Driven by the parent (the play page) which handles BossCleared on
   * `onEvent` and dispatches the on-chain mint. Undefined while the
   * boss is still alive.
   */
  clearReceipt?:
    | { status: "pending" }
    | { status: "minted"; txHash: `0x${string}`; tokenId: bigint }
    | { status: "failed"; error: string }
    | { status: "skipped"; reason: string };
  /**
   * Fires once when the run banks its escrow — either the player pressed
   * Extract or the boss fell (an implicit extraction). The
   * handler receives every carried `EscrowEntry`; it should mint them in
   * one batch (or a looped sponsored op) and resolve once they've settled.
   * May be async — if it rejects, the engine-side `commitExtraction` is
   * skipped and the bank status surfaces a retry-able failure.
   *
   * Each entry carries its own `depth`/`isBoss` so the server validator
   * can bounds-check each drop against the difficulty band it rolled in
   * (the parent's `initialState.depth` is frozen at 1 from `startRun`).
   * Escrow items are NOT auto-equipped — the player descended with their
   * real gear and gambled only with findings.
   */
  onBankEscrow?: (
    escrow: readonly EscrowEntry[],
    ctx: { reason: "extract" | "boss" },
  ) => Promise<void> | void;
  /**
   * Optional narrative beat rendered inside the run-over panel once the
   * boss is down. Owned by the parent so it can supply post-clear
   * tutorial progress and the Seed claim handler.
   */
  interstitial?: React.ReactNode;
  /**
   * Preset of the realm this run is in. Used purely for element-label
   * vocabulary in the monster banner — e.g. a cyberpunk run renders
   * canonical `unholy` as `nano` via the on-chain adapter labels.
   * `null`/omitted falls back to canonical names.
   */
  activePreset?: Preset | null;
  /**
   * Human-readable realm name (e.g. "The Hollow Reach"). Used by the
   * escrow tray to build preview `AssetCard`s so carried findings render
   * with the same visual language as the inventory drawer.
   */
  realmName: string;
  /**
   * Restart the run from depth 1 with a fresh seed. Triggered by the
   * defeat panel after roguelike permadeath. The parent owns seed
   * regeneration (a fresh seed produces a fresh encounter chain — a
   * same-seed restart would deterministically replay the death) so it
   * also owns the callback. Omit to disable the restart CTA.
   */
  onRestart?: () => void;
};

/**
 * Split engine-emitted lines into the room intro paragraph + the remainder
 * that should be appended to the combat log.
 *
 * `from`:
 *   "head" — used for `startRun`/`advance` output, where the room intro
 *            is the first line (engine emits intro → encounter setup).
 *   "tail" — used for seed-mercy respawn output, where the engine pushes
 *            [death voice, …respawn voice, new room intro], so the intro
 *            is the *last* line and the death/respawn lines belong in
 *            the log.
 */
function splitIntro(
  lines: readonly NarrationLine[],
  from: "head" | "tail" = "head",
): {
  intro: string;
  rest: NarrationLine[];
} {
  if (lines.length === 0) return { intro: "", rest: [] };
  if (from === "tail") {
    const last = lines[lines.length - 1]!;
    return { intro: last.text, rest: lines.slice(0, -1) };
  }
  const [head, ...rest] = lines;
  return { intro: head!.text, rest };
}

/**
 * Renders the state of the batched escrow mint. Shared by
 * the extraction-success panel and the boss-clear run-over panel — both
 * bank the escrow, the only difference is the trigger.
 */
function BankStatusLine({
  status,
  onRetry,
}: {
  status: BankStatus;
  onRetry: () => void;
}) {
  if (status.kind === "idle") return null;
  if (status.kind === "pending") {
    return (
      <p className="text-sm opacity-80">Banking your findings on-chain…</p>
    );
  }
  if (status.kind === "done") {
    return (
      <p className="text-sm opacity-90">
        {status.count > 0
          ? `${status.count} finding${status.count === 1 ? "" : "s"} banked to your wallet.`
          : "Nothing carried — no findings to bank."}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-[var(--color-danger)]">
        Banking failed — your findings are safe.
      </p>
      <p className="opacity-60 text-[11px] break-all">{status.error}</p>
      <ChoiceRow
        ariaLabel="Retry bank"
        choices={
          [
            {
              key: "retry-bank",
              label: "Retry bank",
              variant: "primary",
              onClick: onRetry,
            },
          ] satisfies Choice[]
        }
      />
    </div>
  );
}

export function EncounterFrame({
  initialState,
  initialLines,
  bossId,
  equipped,
  onEvent,
  onBankEscrow,
  clearReceipt,
  interstitial,
  activePreset = null,
  realmName,
  onRestart,
}: Props) {
  const initialSplit = useMemo(() => splitIntro(initialLines), [initialLines]);

  const [state, setState] = useState<RunState>(initialState);
  const [intro, setIntro] = useState<string>(initialSplit.intro);
  const [feed, setFeed] = useState<readonly NarrationLine[]>(initialSplit.rest);
  const [busy, setBusy] = useState(false);
  const [bankStatus, setBankStatus] = useState<BankStatus>({ kind: "idle" });
  const [phaseBanner, setPhaseBanner] = useState(false);

  // Hold the bossName for the phase banner. Captured at the moment of
  // transition so the banner doesn't blink if the parent advances rooms
  // mid-fade.
  const phaseBannerNameRef = useRef<string>("");

  // Mirror controlled `equipped` prop into engine RunState. Per spec
  // active combat stats are frozen until the next room, so we just
  // swap `state.equipped` — `playerStartHp` will pick the new gear up
  // on the next `advance()` call. Comparing by reference is enough: the
  // page only allocates a fresh `equipped` object when a slot actually
  // changes (it goes through `setEquipped`).
  useEffect(() => {
    if (!equipped) return;
    setState((prev) => {
      let next = prev;
      if (equipped.weapon && equipped.weapon !== prev.equipped.weapon) {
        next = engineEquipItem(next, "weapon", equipped.weapon);
      }
      if (equipped.armor && equipped.armor !== prev.equipped.armor) {
        next = engineEquipItem(next, "armor", equipped.armor);
      }
      return next;
    });
  }, [equipped]);

  const combat =
    state.encounter?.kind === "combat" ? state.encounter.combat : undefined;

  const appendLines = useCallback((lines: readonly NarrationLine[]) => {
    if (lines.length === 0) return;
    setFeed((prev) => [...prev, ...lines]);
  }, []);

  const handleChoose = useCallback(
    (choice: ActionChoice) => {
      if (busy) return;
      setBusy(true);
      try {
        const prevPhase =
          state.encounter?.kind === "combat"
            ? state.encounter.combat.bossPhase
            : undefined;
        const result = engineStep(state, choice);
        // Seed-mercy respawn generates a fresh encounter inside the same
        // step() call (runAttempt increments, depth resets). When that
        // happens, `result.outcome` ends with the new room's intro line —
        // treat the whole batch like room-generation output: replace the
        // banner + clear the log, instead of appending to the prior fight.
        const respawned = result.state.runAttempt !== state.runAttempt;
        if (respawned) {
          // Engine pushed [death, …respawnVoice, newRoomIntro]; pull the
          // intro from the tail and route the death/respawn lines to the
          // log so the player still sees the death beat.
          const split = splitIntro(result.outcome, "tail");
          setIntro(split.intro);
          setFeed(split.rest);
          setPhaseBanner(false);
        } else {
          appendLines(result.outcome);
        }
        for (const ev of result.events) {
          onEvent?.(ev);
          if (ev.type === "BossCleared") {
            // Banner is implicitly retired by the run-over state.
            setPhaseBanner(false);
          }
        }
        const nextPhase =
          result.state.encounter?.kind === "combat"
            ? result.state.encounter.combat.bossPhase
            : undefined;
        if (prevPhase === 1 && nextPhase === 2 && combat) {
          phaseBannerNameRef.current = combat.monster.name;
          setPhaseBanner(true);
        }
        setState(result.state);
      } finally {
        setBusy(false);
      }
    },
    [appendLines, busy, combat, onEvent, state],
  );

  // Guards the batched escrow mint so it fires exactly once per run — both
  // the Extract button and the boss-clear auto-bank effect funnel through
  // `runBank`, and the effect can re-fire on every state change. Reset to
  // false on a mint failure so the player can retry.
  const bankRef = useRef(false);

  const runBank = useCallback(
    async (bankState: RunState, reason: "extract" | "boss") => {
      if (bankRef.current) return;
      bankRef.current = true;
      const entries = bankState.escrow;
      if (entries.length === 0) {
        // Extracted empty-handed (or a boss room with nothing carried) —
        // nothing to mint, but the run still resolved successfully.
        setBankStatus({ kind: "done", count: 0 });
        return;
      }
      setBankStatus({ kind: "pending" });
      try {
        await onBankEscrow?.(entries, { reason });
        // Clear the escrow only after the batch mint settles.
        setState((prev) => engineCommitExtraction(prev));
        setBankStatus({ kind: "done", count: entries.length });
      } catch (err) {
        // Leave the escrow intact and re-open the gate so the player can
        // retry the bank without losing the findings.
        bankRef.current = false;
        setBankStatus({
          kind: "failed",
          error: (err as Error).message ?? "unknown error",
        });
      }
    },
    [onBankEscrow],
  );

  const handleExtract = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      // `extract` only throws with an active encounter or in the boss room;
      // the Extract control never renders in either case, so this is safe.
      const result = engineExtract(state);
      appendLines(result.lines);
      for (const ev of result.events) onEvent?.(ev);
      setState(result.state);
      await runBank(result.state, "extract");
    } finally {
      setBusy(false);
    }
  }, [appendLines, busy, onEvent, runBank, state]);

  // Boss clear is an implicit extraction: the engine already
  // banked the boss drop into the escrow and flagged `bossCleared`. Mint the
  // whole escrow once, the moment the boss falls.
  useEffect(() => {
    if (
      state.bossCleared &&
      !state.encounter &&
      bankStatus.kind === "idle" &&
      state.escrow.length > 0
    ) {
      void runBank(state, "boss");
    }
  }, [state, bankStatus.kind, runBank]);

  const handleAdvance = useCallback(() => {
    if (busy) return;
    setBusy(true);
    try {
      const result = engineAdvance(state, bossId);
      const split = splitIntro(result.lines);
      setIntro(split.intro);
      // Reset the combat log on a fresh room so the player isn't reading
      // last room's narration over the new monster's HP bar.
      setFeed(split.rest);
      setPhaseBanner(false);
      setState(result.state);
    } finally {
      setBusy(false);
    }
  }, [bossId, busy, state]);

  const runOver = state.bossCleared && !state.encounter;
  const runDefeated = state.defeated;
  // Between-rooms decision point: a room is cleared, no encounter is live,
  // and the run hasn't terminated. Extract is offered only when the engine
  // says the run is extractable (not the boss room) and there is something
  // carried to bank.
  const atDecision =
    !runDefeated && !runOver && !state.extracted && !state.encounter;
  const canExtract =
    atDecision && state.extractable && state.escrow.length > 0;

  const handleRetryBank = useCallback(() => {
    void runBank(state, state.bossCleared ? "boss" : "extract");
  }, [runBank, state]);

  return (
    <div className="flex flex-col gap-4">
      <HUD run={state} combat={combat} />

      {phaseBanner && (
        <BossPhaseBanner
          show={phaseBanner}
          bossName={phaseBannerNameRef.current}
        />
      )}

      <RoomNarration
        encounter={state.encounter}
        intro={intro}
        activePreset={activePreset}
      />

      <CombatLog lines={feed} encounter={state.encounter} />

      {runDefeated ? (
        <section
          aria-label="Run ended in defeat"
          className="flex flex-col gap-3"
        >
          <div
            className="flex flex-col gap-3 p-5 rounded-lg border"
            style={{
              background:
                "color-mix(in oklab, var(--color-danger) 8%, transparent)",
              borderColor:
                "color-mix(in oklab, var(--color-danger) 35%, transparent)",
            }}
          >
            <header className="flex items-baseline justify-between gap-2">
              <h2
                className="text-base font-semibold"
                style={{ color: "var(--color-danger)" }}
              >
                The realm keeps you
              </h2>
              {state.defeatedAtDepth !== undefined && (
                <span className="text-[11px] uppercase tracking-widest opacity-70">
                  Fell at depth {state.defeatedAtDepth}
                  {state.defeatedTurn !== undefined
                    ? ` · turn ${state.defeatedTurn}`
                    : ""}
                </span>
              )}
            </header>
            <p className="text-sm opacity-90 leading-relaxed">
              The run is over. No clear receipt is minted, and the realm chain
              stays unchanged — your owned, equipped gear is untouched, but
              {state.escrow.length > 0 ? (
                <>
                  {" "}the{" "}
                  <strong>
                    {state.escrow.length} unminted finding
                    {state.escrow.length === 1 ? "" : "s"}
                  </strong>{" "}
                  of this delve are gone. Bank them next time.
                </>
              ) : (
                <> you carried nothing out to lose.</>
              )}{" "}
              Step back in when you&apos;re ready.
            </p>
            {onRestart && (
              <ChoiceRow
                ariaLabel="Restart run"
                choices={
                  [
                    {
                      key: "restart",
                      label: "Step back in →",
                      variant: "primary",
                      onClick: onRestart,
                    },
                  ] satisfies Choice[]
                }
              />
            )}
          </div>
        </section>
      ) : state.encounter ? (
        <ActionChoices
          encounter={state.encounter}
          equipped={state.equipped}
          disabled={busy}
          onChoose={handleChoose}
        />
      ) : state.extracted ? (
        <section
          aria-label="Extracted from the delve"
          className="flex flex-col gap-3 p-5 rounded-lg border"
          style={{
            background:
              "color-mix(in oklab, var(--color-ok) 8%, transparent)",
            borderColor:
              "color-mix(in oklab, var(--color-ok) 35%, transparent)",
          }}
        >
          <h2
            className="text-base font-semibold"
            style={{ color: "var(--color-ok)" }}
          >
            You surface, findings in hand
          </h2>
          <p className="text-sm opacity-90 leading-relaxed">
            You pulled out before the realm could take you. Everything you
            carried is banked to your wallet under{" "}
            <span className="opacity-100 font-medium">{realmName}</span>.
          </p>
          <BankStatusLine status={bankStatus} onRetry={handleRetryBank} />
          {onRestart && bankStatus.kind !== "pending" && (
            <ChoiceRow
              ariaLabel="Delve again"
              choices={
                [
                  {
                    key: "restart",
                    label: "Delve again →",
                    variant: "primary",
                    onClick: onRestart,
                  },
                ] satisfies Choice[]
              }
            />
          )}
        </section>
      ) : runOver ? (
        <section
          aria-label="Run complete"
          className="flex flex-col gap-3"
        >
          {interstitial}
          <Panel tone="glass-2" className="flex flex-col gap-2 p-4">
            {state.bossClearedTurns !== undefined && (
              <p className="text-xs opacity-60 tabular-nums uppercase tracking-widest">
                Cleared in {state.bossClearedTurns} turn
                {state.bossClearedTurns === 1 ? "" : "s"}
              </p>
            )}
          {/* Boss clear is an implicit extraction — bank the full escrow. */}
          <BankStatusLine status={bankStatus} onRetry={handleRetryBank} />
          {!clearReceipt && (
            <p className="text-sm opacity-60">
              Clear receipt: queued…
            </p>
          )}
          {clearReceipt?.status === "pending" && (
            <p className="text-sm opacity-80">
              Minting clear receipt on-chain…
            </p>
          )}
          {clearReceipt?.status === "minted" && (
            <div className="flex flex-col gap-1 text-sm">
              <p className="opacity-90">
                Clear receipt minted.
              </p>
              <p className="opacity-60 font-mono break-all text-[11px]">
                tokenId 0x{clearReceipt.tokenId.toString(16).slice(0, 16)}… · tx{" "}
                {clearReceipt.txHash.slice(0, 10)}…
              </p>
            </div>
          )}
          {clearReceipt?.status === "failed" && (
            <div className="flex flex-col gap-1 text-sm">
              <p className="text-[var(--color-danger)]">Mint failed.</p>
              <p className="opacity-60 text-[11px] break-all">
                {clearReceipt.error}
              </p>
            </div>
          )}
          {clearReceipt?.status === "skipped" && (
            <p className="text-sm opacity-60">{clearReceipt.reason}</p>
          )}
          </Panel>
        </section>
      ) : (
        // Between-rooms decision: show the carried findings + Descend/Extract.
        <div className="flex flex-col gap-4">
          <EscrowTray
            escrow={state.escrow}
            preset={activePreset ?? state.preset}
            realm={state.realm}
            realmName={realmName}
            atRisk={state.defeatMode === "permadeath"}
          />
          <ChoiceRow
            ariaLabel="Descend or extract"
            disabled={busy}
            choices={
              [
                ...(canExtract
                  ? [
                      {
                        key: "extract",
                        label: busy ? "Extracting…" : "Extract & bank",
                        onClick: handleExtract,
                      } as Choice,
                    ]
                  : []),
                {
                  key: "advance",
                  label: busy ? "Descending…" : "Descend",
                  variant: "primary",
                  onClick: handleAdvance,
                } as Choice,
              ] satisfies Choice[]
            }
          />
        </div>
      )}
    </div>
  );
}
