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
 * The warden's felt beats stay out of the stage's way: the boss room's first
 * appearance pulses the stage's kept-reader ghost (face bloom behind the
 * enemy), and the phase 1→2 turn — detected by diffing the previous and next
 * `combat.bossPhase` after each `step()` — fires a danger toast through the
 * global notification stack. No overlay ever covers the encounter text.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import { useBankEscrow } from "./BankStatus";
import { ChoiceRow, type Choice } from "./ChoiceRow";
import { useNotify } from "@/components/ui/Toast";
import { CombatLog } from "./CombatLog";
import { DefeatOverlay } from "./DefeatOverlay";
import { EscrowTray } from "./EscrowTray";
import { ExtractSelection } from "./ExtractSelection";
import { PlayerBar } from "./PlayerBar";
import { EncounterStage } from "./EncounterStage";
import {
  ExtractedPanel,
  RunOverPanel,
  type ClearReceiptStatus,
} from "./RunOutcomePanels";

/**
 * How long the run-over beat (clear narrative + bank/receipt status) dwells
 * after a boss clear settles before the player is routed back to the base.
 * Long enough to read the beat; short enough not to feel stuck.
 */
const BOSS_RETURN_DELAY_MS = 3500;

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
  clearReceipt?: ClearReceiptStatus;
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
  // Batched escrow mint — status + the once-per-run `runBank` gate (see
  // `useBankEscrow`). The engine-side extraction commits only after the
  // batch mint settles, so a failed bank leaves the escrow intact.
  const commitExtraction = useCallback(
    () => setState((prev) => engineCommitExtraction(prev)),
    [],
  );
  const { bankStatus, runBank } = useBankEscrow({
    onBankEscrow,
    onSettled: commitExtraction,
  });
  // Monotonic nonce handed to the stage's kept-reader ghost: bumped on
  // boss-start so the face suggestion blooms behind the warden.
  const [ghostReveal, setGhostReveal] = useState(0);
  const notify = useNotify();
  // Open while the player is choosing which carried findings to bank vs
  // discard (the Extract & bank selection overlay). The actual extraction
  // only fires on confirm, with the kept indices.
  const [selecting, setSelecting] = useState(false);
  // Open while the player is choosing which findings to bank on a boss
  // clear. Same picker as Extract, but the boss room can't be fled — the
  // run is over either way, so the modal has no Back affordance.
  const [bossSelecting, setBossSelecting] = useState(false);

  // Pulse the stage ghost exactly once when the boss room's encounter first
  // appears. `bossGhostFiredRef` guards against the effect re-running on
  // every combat step (the encounter object changes each turn).
  const bossGhostFiredRef = useRef(false);

  // Gear is locked for the duration of a delve: the loadout is chosen in
  // the pocket-realm hub before descending and baked into `initialState`
  // by `startRun`. There is no in-run equip path, so the engine's
  // `state.equipped` never changes mid-run.

  const combat =
    state.encounter?.kind === "combat" ? state.encounter.combat : undefined;

  // Boss-start beat: when the live encounter first becomes the boss (its
  // monster carries `bakedEffects`), pulse the stage ghost so the kept-reader
  // face blooms behind the warden. The name/lore overlay is gone — it used to
  // cover the encounter text; the combat log's intro line carries the moment.
  useEffect(() => {
    if (bossGhostFiredRef.current) return;
    if (state.encounter?.kind !== "combat") return;
    const monster = state.encounter.combat.monster;
    if (!("bakedEffects" in monster)) return;
    bossGhostFiredRef.current = true;
    setGhostReveal((n) => n + 1);
  }, [state.encounter]);

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
        }
        const nextPhase =
          result.state.encounter?.kind === "combat"
            ? result.state.encounter.combat.bossPhase
            : undefined;
        if (prevPhase === 1 && nextPhase === 2 && combat) {
          // The warden turns: a danger toast in the global stack, floating
          // clear of the stage. The stage re-blooms its ghost on the phase
          // change on its own (keyed on the phase), so no nonce bump.
          notify({
            tone: "danger",
            title: "Phase 2",
            description: `${combat.monster.name} stops holding back — whatever keeps it is done pretending.`,
          });
        }
        setState(result.state);
      } finally {
        setBusy(false);
      }
    },
    [appendLines, busy, combat, notify, onEvent, state],
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
            ghostReveal={ghostReveal}
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
          <ExtractedPanel
            chainReady={chainReady}
            realmName={realmName}
            bankStatus={bankStatus}
            onRetryBank={handleRetryBank}
          />
        ) : runOver ? (
          // Boss down: the focal slot held the enemy, now it holds the thing
          // you WON. Both the narrative beat and the receipt/bank status are
          // display content, so they live here in the Main pane rather than
          // below the log. The slot drops its fixed height here (`min-h`
          // above) so the beat sizes to its content instead of scrolling
          // inside a 22rem box — the run is over, so there's no combat below
          // to protect from layout shift.
          <RunOverPanel
            interstitial={interstitial}
            bossClearedTurns={state.bossClearedTurns}
            bankStatus={bankStatus}
            onRetryBank={handleRetryBank}
            clearReceipt={clearReceipt}
          />
        ) : null}
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
