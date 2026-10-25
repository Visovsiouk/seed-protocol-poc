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
import { useAccount } from "wagmi";
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
import { useAudio } from "@/lib/audio/AudioProvider";
import { playBeats, sfxForEvent } from "@/lib/audio/gameplay";
import { CombatLog } from "./CombatLog";
import { DefeatOverlay } from "./DefeatOverlay";
import { EscrowTray } from "./EscrowTray";
import { MarginFind } from "./MarginFind";
import { marginAt } from "@/lib/story/marginalia";
import { useEpitaph } from "@/lib/story/use-epitaph";
import { markMarginFound } from "@/lib/story/margins-local";
import { markEpitaphWritten } from "@/lib/story/epitaphs-local";
import { ExtractSelection } from "./ExtractSelection";
import { PlayerBar } from "./PlayerBar";
import { EncounterStage, type BookmarkOverlay } from "./EncounterStage";
import {
  ExtractedPanel,
  RunOverPanel,
  type ClearReceiptStatus,
} from "./RunOutcomePanels";

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
   * Where the boss-clear panel's exit sends the player. The starter arc
   * passes `/?station=altar` on the arc-completing clear to land the player
   * on the Seed chest; everything else returns to the base (`/`).
   */
  bossReturnHref?: string;
  /**
   * The label on that exit, which the story owns: `Interstitial.cta.label`.
   * The page already computes the `Interstitial` to build `interstitial`, so
   * it reads the label off the same object. Defaulted rather than required so
   * a realm with no story content still has a way home.
   */
  bossReturnLabel?: string;
  /**
   * This realm's own identity for its boss, held under the name at the bottom
   * of the delve. Only creator realms pass one — the starter pages' bookmarks
   * are named in `canon.ts`. See `BookmarkOverlay`.
   */
  bookmark?: BookmarkOverlay;
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
  bossReturnLabel = "Back to the base",
  bookmark,
}: Props) {
  const router = useRouter();
  // Only used to namespace collected margin notes per player, the same way
  // the codex stores namespace their flags. A disconnected run still shows
  // its notes; they just aren't kept.
  const { address } = useAccount();
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
  const { play } = useAudio();
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
        // Swing sounds first: they're the response to the click. Event
        // stings (loot, victory, defeat) land after, matching the order
        // the fiction resolves in.
        playBeats(result.beats, play);
        for (const ev of result.events) {
          const sfx = sfxForEvent(ev);
          if (sfx) play(sfx);
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
    [appendLines, busy, combat, notify, onEvent, play, state],
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
        for (const ev of result.events) {
          const sfx = sfxForEvent(ev);
          if (sfx) play(sfx);
          onEvent?.(ev);
        }
        setState(result.state);
        setSelecting(false);
        // Bank the chosen findings and stop there. This used to push `/` on
        // success, which meant `ExtractedPanel` — the beat that tells the
        // player what they just got away with — was only ever seen by players
        // whose mint failed. The panel now carries its own exit.
        await runBank(result.state, "extract");
      } finally {
        setBusy(false);
      }
    },
    [appendLines, busy, onEvent, play, runBank, state],
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

  /**
   * Leaving a finished run — the only navigation out of a terminal state.
   *
   * This replaces a `setTimeout` that pushed `bossReturnHref` 3.5 seconds
   * after a clear settled. That timer made the biggest payoff in the game the
   * one beat nobody read to the end of, and it was the only player-facing
   * transition in the app decided by a clock rather than a press — death has
   * always required acknowledging the overlay.
   *
   * `leftRef` keeps the old effect's idempotency: a double-press (or an Enter
   * that lands on the button twice) must not stack two pushes.
   */
  const leftRef = useRef(false);
  const handleLeaveRun = useCallback(
    (href: string) => {
      if (leftRef.current) return;
      leftRef.current = true;
      router.push(href);
    },
    [router],
  );

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

  /**
   * The note waiting in this room, if any.
   *
   * Derived, never stored. It deliberately does NOT enter `RunState`: the
   * play page must hand the engine back the exact object `startRun`
   * returned (the engine resolves schemas and bosses through `WeakMap`s
   * keyed on it), and the mint wire body is built from `entry.loot` alone,
   * so a cosmetic find has no business anywhere near either. Keeping it as
   * a `useMemo` here is the firewall.
   *
   * `marginAt` draws from a domain-separated sub-seed and builds its own
   * `Rng`, so it cannot perturb a loot or combat roll — the engine makes a
   * fresh generator per step and holds no shared RNG state.
   */
  const margin = useMemo(
    () =>
      atDecision
        ? marginAt({
            runSeed: state.rngSeed,
            depth: state.depth,
            preset: state.preset,
          })
        : null,
    [atDecision, state.rngSeed, state.depth, state.preset],
  );

  /**
   * The facts of *this* death.
   *
   * Gathered here because this is the only place that holds every one at
   * once: which page, how deep, what was still on the stage when the player
   * went down, which turn of that fight, and how much unbanked escrow went
   * with them. `DefeatOverlay` stays presentational.
   */
  const epitaphFacts = useMemo(() => {
    if (!state.defeated) return undefined;
    const monster = state.encounter?.combat.monster;
    return {
      runSeed: state.rngSeed,
      preset: state.preset,
      depth: state.defeatedAtDepth ?? state.depth,
      killedBy: monster?.name ?? "Something down there",
      wasBookmark: !!monster && "bakedEffects" in monster,
      turns: state.defeatedTurn ?? 0,
      carried: state.escrow.length,
    };
  }, [
    state.defeated,
    state.rngSeed,
    state.preset,
    state.depth,
    state.defeatedAtDepth,
    state.defeatedTurn,
    state.escrow.length,
    state.encounter,
  ]);

  /**
   * The note itself. Returns the deterministic bank note synchronously and
   * swaps in a generated line only if one arrives — with the story-AI flag
   * unset (the default) it never asks, and this is a pure function of the
   * facts above. See `use-epitaph.ts`.
   */
  const epitaph = useEpitaph(epitaphFacts);

  // Collect it. Ref-guarded per note so a re-render can't re-write, mirroring
  // `bossGhostFiredRef` above; `markMarginFound` is itself idempotent, so
  // this is belt and braces rather than the only defence.
  const collectedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!margin || !address) return;
    if (collectedRef.current === margin.id) return;
    collectedRef.current = margin.id;
    markMarginFound(address, margin.id);
  }, [margin, address]);

  /**
   * Keep the note the book just wrote about the player.
   *
   * This is the turn the whole marginalia system is built toward: their own
   * note joins the ones they have been reading, which is what reveals in
   * retrospect that every warning they found was somebody's death. Without it
   * the epitaph showed once on the overlay and vanished, and the card's
   * "nobody has ever been stamped back in" had no consequence anywhere.
   *
   * Stored as the note *as rendered*, not as the facts — see
   * `epitaphs-local.ts`. Ref-guarded on id like the find above; the store is
   * idempotent on id as well, so a reload of the defeat screen is a no-op.
   */
  const epitaphKeptRef = useRef<string | null>(null);
  useEffect(() => {
    if (!epitaph || !address) return;
    if (epitaphKeptRef.current === epitaph.id) return;
    epitaphKeptRef.current = epitaph.id;
    markEpitaphWritten(address, epitaph);
  }, [epitaph, address]);

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
    // Both terminal panels own an exit now, so a successful retry just
    // updates the bank line and leaves the player where they are.
    await runBank(state, state.bossCleared ? "boss" : "extract");
  }, [runBank, state]);

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
            // Gear is locked for the delve (see the note above), so this is
            // the weapon every blow in this run is struck with.
            equippedWeapon={state.equipped.weapon}
            bookmark={bookmark}
          />
        ) : atDecision ? (
          // A found note sits above the findings, both inside the same fixed
          // slot — the note takes its natural height (`shrink-0`) and the
          // tray flexes into the remainder, so nothing below the slot moves.
          <div className="flex h-full flex-col gap-2">
            {margin && <MarginFind note={margin} className="shrink-0" />}
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
          </div>
        ) : state.extracted ? (
          <ExtractedPanel
            chainReady={chainReady}
            realmName={realmName}
            bankStatus={bankStatus}
            onRetryBank={handleRetryBank}
            // A surfacing always goes home to the base — the arc's Altar
            // landing is earned by clearing a page, not by backing out of one.
            onLeave={() => handleLeaveRun("/")}
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
            leaveLabel={bossReturnLabel}
            onLeave={() => handleLeaveRun(bossReturnHref)}
            exitArmed={!bossSelecting}
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
          epitaph={epitaph}
          onLeave={() => handleLeaveRun("/")}
        />
      )}
    </div>
  );
}
