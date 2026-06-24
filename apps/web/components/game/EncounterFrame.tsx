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
 *   - `<EncounterStage/>` is the centrepiece: the enemy rendered big with a
 *     draining/shaking HP bar (or the trial/room prompt between fights),
 *     fed the room's intro paragraph as scene-setting flavor.
 *   - `<CombatLog/>` gets the rolling feed of every subsequent line from
 *     step()/phase-transitions/loot-drops, as a compact fading ticker.
 *   - `<PlayerBar/>` is the footer life-bar: HP/AC/depth/at-risk + the
 *     equipped gear, reading HP/AC from the live `CombatState` when one is
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
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import type {
  ActionChoice,
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
  step as engineStep,
} from "@/lib/engine";
import { ActionChoices } from "./ActionChoices";
import { ChoiceRow, type Choice } from "./ChoiceRow";
import { BossPhaseBanner } from "./BossPhaseBanner";
import { CombatLog } from "./CombatLog";
import { EscrowTray } from "./EscrowTray";
import { ExtractSelection } from "./ExtractSelection";
import { PlayerBar } from "./PlayerBar";
import { EncounterStage } from "./EncounterStage";
import { Panel } from "@/components/ui";

/**
 * How long the run-over beat (clear narrative + bank/receipt status) dwells
 * after a boss clear settles before the player is routed back to the base.
 * Long enough to read the beat; short enough not to feel stuck.
 */
const BOSS_RETURN_DELAY_MS = 3500;

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
   * Whether the realm-name reveal beat has fired. The page owns this (it's
   * the same `currentDepth >= 2` signal that flips the header title from
   * "???" to the real name). When false, the escrow tray renders carried
   * findings under "???" so a drop can't spoil the reveal ahead of the title.
   */
  realmNameRevealed?: boolean;
  /**
   * Whether carried findings actually mint on-chain on extract/clear. True
   * only when a wallet is connected AND the realm is chain-ready (seeded /
   * registered). When false the run is session-only, so the extraction copy
   * must not promise a wallet bank that won't happen.
   */
  chainReady?: boolean;
  /**
   * Where to send the player after a boss clear settles. The run-over beat
   * dwells briefly, then this route is pushed automatically — no CTA. The
   * starter arc passes `/?station=altar` on the arc-completing clear to land
   * the player on the Seed chest; everything else returns to the base (`/`).
   */
  bossReturnHref?: string;
};

/**
 * Split engine-emitted lines into the room intro paragraph + the remainder
 * that should be appended to the combat log. The room intro is the first
 * line (engine emits intro → encounter setup) for both `startRun` and
 * `advance` output.
 */
function splitIntro(lines: readonly NarrationLine[]): {
  intro: string;
  rest: NarrationLine[];
} {
  if (lines.length === 0) return { intro: "", rest: [] };
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
      <p className="opacity-70 text-[11px] break-all">{status.error}</p>
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
  onEvent,
  onBankEscrow,
  clearReceipt,
  interstitial,
  activePreset = null,
  realmName,
  realmNameRevealed = false,
  chainReady = false,
  bossReturnHref = "/",
}: Props) {
  const router = useRouter();
  const initialSplit = useMemo(() => splitIntro(initialLines), [initialLines]);

  const [state, setState] = useState<RunState>(initialState);
  const [intro, setIntro] = useState<string>(initialSplit.intro);
  const [feed, setFeed] = useState<readonly NarrationLine[]>(initialSplit.rest);
  const [busy, setBusy] = useState(false);
  const [bankStatus, setBankStatus] = useState<BankStatus>({ kind: "idle" });
  const [phaseBanner, setPhaseBanner] = useState(false);
  // Open while the player is choosing which carried findings to bank vs
  // discard (the Extract & bank selection overlay). The actual extraction
  // only fires on confirm, with the kept indices.
  const [selecting, setSelecting] = useState(false);
  // Open while the player is choosing which findings to bank on a boss
  // clear. Same picker as Extract, but the boss room can't be fled — the
  // run is over either way, so the modal has no Back affordance.
  const [bossSelecting, setBossSelecting] = useState(false);

  // Hold the bossName for the phase banner. Captured at the moment of
  // transition so the banner doesn't blink if the parent advances rooms
  // mid-fade.
  const phaseBannerNameRef = useRef<string>("");

  // Gear is locked for the duration of a delve: the loadout is chosen in
  // the pocket-realm hub before descending and baked into `initialState`
  // by `startRun`. There is no in-run equip path, so the engine's
  // `state.equipped` never changes mid-run.

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
        appendLines(result.outcome);
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
    async (
      bankState: RunState,
      reason: "extract" | "boss",
    ): Promise<boolean> => {
      if (bankRef.current) return false;
      bankRef.current = true;
      const entries = bankState.escrow;
      if (entries.length === 0) {
        // Extracted empty-handed (or a boss room with nothing carried) —
        // nothing to mint, but the run still resolved successfully.
        setBankStatus({ kind: "done", count: 0 });
        return true;
      }
      setBankStatus({ kind: "pending" });
      try {
        await onBankEscrow?.(entries, { reason });
        // Clear the escrow only after the batch mint settles.
        setState((prev) => engineCommitExtraction(prev));
        setBankStatus({ kind: "done", count: entries.length });
        return true;
      } catch (err) {
        // Leave the escrow intact and re-open the gate so the player can
        // retry the bank without losing the findings.
        bankRef.current = false;
        setBankStatus({
          kind: "failed",
          error: (err as Error).message ?? "unknown error",
        });
        return false;
      }
    },
    [onBankEscrow],
  );

  // Confirm from the selection overlay: bank the kept findings, discard the
  // rest. `keep` is the set of escrow indices the player chose to mint.
  const handleConfirmExtract = useCallback(
    async (keep: number[]) => {
      if (busy) return;
      setBusy(true);
      try {
        // `extract` only throws with an active encounter or in the boss room;
        // the Extract control never renders in either case, so this is safe.
        const result = engineExtract(state, { keep });
        appendLines(result.lines);
        for (const ev of result.events) onEvent?.(ev);
        setState(result.state);
        setSelecting(false);
        // Surfacing ends the delve: once the chosen findings have banked,
        // the player returns to the hideout (the home base). On a bank
        // failure we stay put so the extracted panel can offer a retry.
        const banked = await runBank(result.state, "extract");
        if (banked) router.push("/");
      } finally {
        setBusy(false);
      }
    },
    [appendLines, busy, onEvent, router, runBank, state],
  );

  // Boss clear: the engine already banked the boss drop into
  // the escrow and flagged `bossCleared`. The player now *chooses* which
  // findings surface with them — open the selection overlay rather than
  // auto-minting the whole escrow. An empty escrow has nothing to choose,
  // so it banks straight through (resolving the run as a clean clear).
  useEffect(() => {
    if (
      !state.bossCleared ||
      state.encounter ||
      bankStatus.kind !== "idle" ||
      bossSelecting
    ) {
      return;
    }
    if (state.escrow.length > 0) {
      setBossSelecting(true);
    } else {
      void runBank(state, "boss");
    }
  }, [state, bankStatus.kind, bossSelecting, runBank]);

  // Boss clear → auto-return to the base. Once the loot has banked
  // (`bankStatus` done) and the clear receipt has *settled* (minted, or
  // definitively skipped/failed — never while still pending), dwell on the
  // run-over beat for a beat, then route home. No "next realm" CTA: the base
  // surfaces the freshly-unsealed realm for the player to pick. Scheduled at
  // most once per mount via `returnScheduledRef`.
  const returnScheduledRef = useRef(false);
  useEffect(() => {
    if (returnScheduledRef.current) return;
    if (!state.bossCleared || state.encounter) return;
    if (bankStatus.kind !== "done") return;
    const settled =
      clearReceipt?.status === "minted" ||
      clearReceipt?.status === "skipped" ||
      clearReceipt?.status === "failed";
    if (!settled) return;
    returnScheduledRef.current = true;
    const t = window.setTimeout(() => {
      router.push(bossReturnHref);
    }, BOSS_RETURN_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [
    state.bossCleared,
    state.encounter,
    bankStatus.kind,
    clearReceipt,
    bossReturnHref,
    router,
  ]);

  // Confirm from the boss-clear selection overlay: bank the kept findings,
  // discard the rest. Boss clear never routes through `extract()` (it guards
  // on `bossCleared`), so we filter the escrow inline and hand only the kept
  // entries to `runBank`. `commitExtraction` then clears the discarded tail.
  const handleConfirmBossBank = useCallback(
    async (keep: number[]) => {
      if (busy) return;
      setBusy(true);
      try {
        const keepSet = new Set(keep);
        const kept = state.escrow.filter((_, i) => keepSet.has(i));
        setBossSelecting(false);
        await runBank({ ...state, escrow: kept }, "boss");
      } finally {
        setBusy(false);
      }
    },
    [busy, runBank, state],
  );

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

  // Lock Descend for 1 second whenever a fresh decision appears, so a
  // player mashing through combat can't blow past the decision and dive
  // deeper by accident — they have to register the choice before it arms.
  // Re-arms every room (keyed on depth).
  const [descendLocked, setDescendLocked] = useState(false);
  useEffect(() => {
    if (!atDecision) {
      setDescendLocked(false);
      return;
    }
    setDescendLocked(true);
    const t = window.setTimeout(() => setDescendLocked(false), 1000);
    return () => window.clearTimeout(t);
  }, [atDecision, state.depth]);

  const handleRetryBank = useCallback(async () => {
    const reason = state.bossCleared ? "boss" : "extract";
    const banked = await runBank(state, reason);
    // A retry that clears the extract bank ends the delve the same way the
    // first-pass confirm does: back to the hideout. Boss clears keep their own
    // terminal panel, so they don't redirect.
    if (banked && reason === "extract") router.push("/");
  }, [router, runBank, state]);

  // The always-present run controls, hosted in the Player pane so the screen
  // reads as three panes (Main · Log · Player): combat actions while a fight
  // is live, the Descend/Extract row at a cleared room. Terminal states
  // (extracted / boss-clear / defeat) own their own CTA up in the focal slot
  // or in a modal, so this is null then — the bar shows no action region.
  const ownedActions: React.ReactNode = runDefeated ? null : state.encounter ? (
    <ActionChoices
      encounter={state.encounter}
      equipped={state.equipped}
      disabled={busy}
      onChoose={handleChoose}
    />
  ) : atDecision ? (
    <ChoiceRow
      ariaLabel="Descend or extract"
      disabled={busy}
      choices={
        [
          {
            key: "advance",
            label: busy ? "Descending…" : "Descend",
            variant: "primary",
            disabled: descendLocked,
            onClick: handleAdvance,
          } as Choice,
          ...(canExtract
            ? [
                {
                  key: "extract",
                  label: "Extract & bank",
                  onClick: () => setSelecting(true),
                } as Choice,
              ]
            : []),
        ] satisfies Choice[]
      }
    />
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      {/*
        Focal slot. While an encounter is live it's the thing you're
        FACING (the monster / trial). The moment a room clears it becomes
        the thing you just WON — the carried findings render here, in the
        same slot the stage vacated, so they replace the enemy instead of
        inserting a fresh panel between the log and the action buttons.
        That insertion was what shoved the whole HUD down on every clear.

        The slot is locked to a FIXED HEIGHT so nothing below it (log,
        action buttons, HUD) ever moves vertically: the stage, the findings
        tray, and the empty between-rooms state all occupy the exact same
        box. Content that's shorter than the slot centres inside it; content
        that's taller scrolls internally. This is the zero-jump guarantee —
        the column geometry is identical in every run state.
      */}
      <div
        className={`relative ${runOver || state.extracted ? "min-h-[22rem]" : "h-[22rem]"}`}
      >
        {state.encounter ? (
          <EncounterStage
            encounter={state.encounter}
            intro={intro}
            activePreset={activePreset}
          />
        ) : atDecision ? (
          <EscrowTray
            escrow={state.escrow}
            preset={activePreset ?? state.preset}
            realm={state.realm}
            // Until the realm-name reveal beat the title bar shows "???", so
            // the carried-finding cards must not stamp the realm name in their
            // provenance footnote either. We gate on the SAME signal the title
            // uses (`realmNameRevealed`, owned by the page) so the tray and the
            // header reveal in lock-step — never one before the other.
            realmName={realmNameRevealed ? realmName : "???"}
          />
        ) : state.extracted ? (
          // Extracted & banked: the focal slot holds the outcome where the
          // enemy stood, instead of dropping it below the log over an empty
          // void. Same terminal-state treatment as the boss clear.
          <Panel
            as="section"
            tone="ok"
            aria-label="Extracted from the delve"
            className="flex flex-col gap-3 p-5"
          >
            <h2
              className="text-base font-semibold"
              style={{ color: "var(--color-ok)" }}
            >
              You surface, findings in hand
            </h2>
            <p className="text-sm opacity-90 leading-relaxed">
              {chainReady ? (
                <>
                  You pulled out before the realm could take you. Everything you
                  carried is banked to your wallet under{" "}
                  <span className="opacity-100 font-medium">{realmName}</span>.
                </>
              ) : (
                <>
                  You pulled out before the realm could take you. Everything you
                  carried is yours for this session under{" "}
                  <span className="opacity-100 font-medium">{realmName}</span> —
                  connect a chain-ready realm to bank it on-chain.
                </>
              )}
            </p>
            {/* Surfacing ends the delve and returns the player to the
                base automatically once the chosen findings have banked
                (see handleConfirmExtract). We only linger on this panel when
                the bank FAILED — then BankStatusLine offers a retry, and a
                successful retry redirects home like the happy path. */}
            <BankStatusLine status={bankStatus} onRetry={handleRetryBank} />
          </Panel>
        ) : runOver ? (
          // Boss down: the focal slot held the enemy, now it holds the thing
          // you WON — the realm-cleared narrative beat plus the clear-receipt /
          // bank status. Both are display content, so they live here in the
          // Main pane rather than below the log. The slot drops its fixed
          // height here (`min-h` above) so the beat sizes to its content
          // instead of scrolling inside a 22rem box — the run is over, so
          // there's no combat below to protect from layout shift.
          <section aria-label="Run complete" className="flex flex-col gap-3">
            {interstitial}
            <Panel tone="glass-2" className="flex flex-col gap-2 p-4">
              {state.bossClearedTurns !== undefined && (
                <p className="text-xs opacity-70 tabular-nums uppercase tracking-widest">
                  Cleared in {state.bossClearedTurns} turn
                  {state.bossClearedTurns === 1 ? "" : "s"}
                </p>
              )}
              {/* Boss clear is an implicit extraction — bank the full escrow. */}
              <BankStatusLine status={bankStatus} onRetry={handleRetryBank} />
              {!clearReceipt && (
                <p className="text-sm opacity-70">Clear receipt: queued…</p>
              )}
              {clearReceipt?.status === "pending" && (
                <p className="text-sm opacity-80">
                  Minting clear receipt on-chain…
                </p>
              )}
              {clearReceipt?.status === "minted" && (
                <div className="flex flex-col gap-1 text-sm">
                  <p className="opacity-90">Clear receipt minted.</p>
                  <p className="opacity-70 font-mono break-all text-[11px]">
                    tokenId 0x{clearReceipt.tokenId.toString(16).slice(0, 16)}… ·
                    tx {clearReceipt.txHash.slice(0, 10)}…
                  </p>
                </div>
              )}
              {clearReceipt?.status === "failed" && (
                <div className="flex flex-col gap-1 text-sm">
                  <p className="text-[var(--color-danger)]">Mint failed.</p>
                  <p className="opacity-70 text-[11px] break-all">
                    {clearReceipt.error}
                  </p>
                </div>
              )}
              {clearReceipt?.status === "skipped" && (
                <p className="text-sm opacity-70">{clearReceipt.reason}</p>
              )}
            </Panel>
          </section>
        ) : null}

        {/*
          Phase-2 banner is an OVERLAY pinned to the top of the focal slot, NOT
          a flow element. Rendering it inline (between the stage and the log)
          used to insert a box that shoved the combat log and the action
          buttons down the instant it appeared — then snapped them back up when
          it auto-faded. Absolutely positioned + pointer-events-none, it floats
          over the stage and changes nothing below it: zero layout shift.
        */}
        {phaseBanner && (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-3">
            <BossPhaseBanner
              show={phaseBanner}
              bossName={phaseBannerNameRef.current}
            />
          </div>
        )}
      </div>

      {(state.encounter || feed.length > 0) && <CombatLog lines={feed} />}

      {selecting && canExtract && (
        <ExtractSelection
          escrow={state.escrow}
          preset={activePreset ?? state.preset}
          realm={state.realm}
          realmName={realmName}
          busy={busy}
          onConfirm={handleConfirmExtract}
          onCancel={() => setSelecting(false)}
        />
      )}

      {bossSelecting && (
        <ExtractSelection
          escrow={state.escrow}
          preset={activePreset ?? state.preset}
          realm={state.realm}
          realmName={realmName}
          busy={busy}
          onConfirm={handleConfirmBossBank}
          // The boss room can't be fled and the run is already won — the
          // only forward motion is to bank, so there's no Back affordance.
          onCancel={() => {}}
          allowCancel={false}
        />
      )}

      <PlayerBar run={state} combat={combat} actions={ownedActions} />

      {runDefeated && (
        <DefeatOverlay
          escrowLost={state.escrow.length}
          depth={state.defeatedAtDepth}
          turn={state.defeatedTurn}
          onLeave={() => router.push("/")}
        />
      )}
    </div>
  );
}

/**
 * Full-screen defeat overlay (permadeath). Death used to be a quiet line
 * appended to the combat log under a live HUD — easy to miss. This portals
 * a dimmed, danger-tinted modal over the whole viewport so a fall is
 * unmissable: the run is over, the unbanked escrow is forfeit, and the only
 * way on is back to the base. Not dismissable by click-outside or Escape —
 * the player must acknowledge the death via the return CTA, which walks them
 * back to the hideout (where the realm is still there to re-enter, on a fresh
 * descent). Mirrors the boss-clear return so both run-end states land home.
 */
function DefeatOverlay({
  escrowLost,
  depth,
  turn,
  onLeave,
}: {
  escrowLost: number;
  depth?: number;
  turn?: number;
  onLeave: () => void;
}) {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const leaveRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);
  // Pull focus to the return CTA so the death is announced and keyboard
  // users land on the only action.
  useEffect(() => {
    if (mounted) leaveRef.current?.focus();
  }, [mounted]);

  if (!mounted) return null;

  return createPortal(
    <motion.div
      role="alertdialog"
      aria-modal="true"
      aria-label="You have fallen"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 backdrop-blur-sm bg-[color-mix(in_oklab,var(--color-danger)_18%,#000_82%)]"
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.div
        className="w-full max-w-md rounded-xl border p-7 flex flex-col gap-4 bg-[var(--color-preset-bg)]"
        style={{
          borderColor:
            "color-mix(in oklab, var(--color-danger) 55%, transparent)",
          boxShadow:
            "0 0 0 1px color-mix(in oklab, var(--color-danger) 25%, transparent), 0 24px 80px -12px color-mix(in oklab, var(--color-danger) 45%, transparent)",
        }}
        initial={reduced ? false : { opacity: 0, scale: 0.92, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      >
        <p
          className="text-[11px] font-mono uppercase tracking-[0.4em] opacity-70"
          style={{ color: "var(--color-danger)" }}
        >
          You died
        </p>
        <h2
          className="text-3xl font-semibold leading-tight"
          style={{ color: "var(--color-danger)" }}
        >
          The realm keeps you.
        </h2>
        {depth !== undefined && (
          <p className="text-xs uppercase tracking-widest opacity-70">
            Fell at depth {depth}
            {/*
              `turn` is the turn count of the FINAL fight (engine resets it
              each room), not a run total. Label it as such so a deep death
              on the first turn of a fresh fight doesn't misread as an
              instant, turn-1 run.
            */}
            {turn !== undefined && turn > 0
              ? ` · turn ${turn} of the fight there`
              : ""}
          </p>
        )}
        <p className="text-sm opacity-90 leading-relaxed">
          The protocol writes you in where you fell — another face for the next
          reader to find. No clear receipt is minted and the realm chain stays
          unchanged; your owned, equipped gear is untouched, but
          {escrowLost > 0 ? (
            <>
              {" "}the{" "}
              <strong style={{ color: "var(--color-danger)" }}>
                {escrowLost} unminted finding
                {escrowLost === 1 ? "" : "s"}
              </strong>{" "}
              you carried are gone. Carry them out next time.
            </>
          ) : (
            <> you carried nothing out to lose.</>
          )}
        </p>
        <button
          ref={leaveRef}
          type="button"
          onClick={onLeave}
          className="mt-1 w-full rounded-lg px-4 py-3 text-sm font-semibold text-[var(--color-preset-bg)] transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ background: "var(--color-danger)" }}
        >
          Back to the base →
        </button>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
