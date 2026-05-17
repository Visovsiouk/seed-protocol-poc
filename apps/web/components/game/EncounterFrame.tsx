"use client";

/**
 * Centerpiece of `/play/[preset]`. Holds the live `RunState`
 * and drives the engine in response to player input:
 *
 *   step(state, choice)         → consume player action
 *   advance(state, bossId)      → next room after a clear
 *   commitLootMint(state)       → clear pendingLoot once the mint settles
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
 *   - `<LootMintPrompt/>` takes over the bottom row when `pendingLoot`
 *     is present (will swap `onMint` for the real on-chain tx).
 *   - The "Advance" button shows once the encounter is cleared *and* any
 *     pending loot has been committed/skipped.
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
  LootRoll,
  NarrationLine,
  Preset,
  RunState,
} from "@/lib/engine/types";
import {
  advance as engineAdvance,
  commitLootMint as engineCommitLoot,
  equipItem as engineEquipItem,
  step as engineStep,
} from "@/lib/engine";
import { getFlavorBank } from "@/lib/flavor";
import { ActionChoices } from "./ActionChoices";
import { BossPhaseBanner } from "./BossPhaseBanner";
import { CombatLog } from "./CombatLog";
import { HUD } from "./HUD";
import { LootMintPrompt } from "./LootMintPrompt";
import { RoomNarration } from "./RoomNarration";

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
   * Fires when the player commits the pendingLoot via the Mint button (i.e.
   * NOT on Skip). May be async — if the handler returns a rejected promise
   * the engine-side commit is skipped, leaving the prompt up for retry.
   *  uses this to grow the local inventory; dispatches
   * the on-chain mint and lets the wagmi receipt reconcile.
   *
   * The `ctx.depth` snapshot is the current room depth at the moment of
   * drop — the parent's `initialState.depth` is frozen at 1 from
   * `startRun`, so callers needing the *real* depth (e.g. for the
   * server-side tier-vs-difficulty bounds check) must read it from here.
   */
  onLootMinted?: (loot: LootRoll, ctx: { depth: number }) => Promise<void> | void;
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
};

/**
 * Split engine-emitted lines into the room intro paragraph + the remainder
 * that should be appended to the combat log.
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
  equipped,
  onEvent,
  onLootMinted,
  clearReceipt,
  interstitial,
  activePreset = null,
}: Props) {
  const initialSplit = useMemo(() => splitIntro(initialLines), [initialLines]);

  const [state, setState] = useState<RunState>(initialState);
  const [intro, setIntro] = useState<string>(initialSplit.intro);
  const [feed, setFeed] = useState<readonly NarrationLine[]>(initialSplit.rest);
  const [busy, setBusy] = useState(false);
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

  const bank = useMemo(() => getFlavorBank(state.preset), [state.preset]);
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

  const handleMint = useCallback(async () => {
    const loot = state.pendingLoot;
    if (!loot) return;
    // Run the caller's mint handler first — if it throws (tx revert,
    // wallet rejection, network drop), leave `pendingLoot` intact so the
    // player can retry without losing the drop.
    if (onLootMinted) {
      try {
        await onLootMinted(loot, { depth: state.depth });
      } catch (err) {
        appendLines([
          {
            text: `Mint failed: ${(err as Error).message ?? "unknown error"}`,
            emphasis: "damage",
          },
        ]);
        return;
      }
    }
    const next = engineCommitLoot(state);
    appendLines([
      { text: "Loot stowed in your pack.", emphasis: "heal" },
    ]);
    setState(next);
  }, [appendLines, onLootMinted, state]);

  const handleSkip = useCallback(() => {
    // Same engine-side behaviour as mint for the PoC — the difference is
    // that 's mint path will actually send a tx. Skip just drops
    // the pendingLoot.
    const next = engineCommitLoot(state);
    appendLines([
      { text: "You leave the spoils behind.", emphasis: "info" },
    ]);
    setState(next);
  }, [appendLines, state]);

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

  const runOver = state.bossCleared && !state.encounter && !state.pendingLoot;

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

      <CombatLog lines={feed} />

      {state.encounter ? (
        <ActionChoices
          encounter={state.encounter}
          combatVerbs={bank.combatVerbs}
          disabled={busy}
          onChoose={handleChoose}
        />
      ) : state.pendingLoot ? (
        <LootMintPrompt
          loot={state.pendingLoot}
          bank={bank}
          onMint={handleMint}
          onSkip={handleSkip}
        />
      ) : runOver ? (
        <section
          aria-label="Run complete"
          className="flex flex-col gap-3"
        >
          {interstitial}
          <div
            className="flex flex-col gap-2 p-4 rounded-md"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {state.bossClearedTurns !== undefined && (
              <p className="text-xs opacity-60 tabular-nums uppercase tracking-widest">
                Cleared in {state.bossClearedTurns} turn
                {state.bossClearedTurns === 1 ? "" : "s"}
              </p>
            )}
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
              <p style={{ color: "#f77" }}>Mint failed.</p>
              <p className="opacity-60 text-[11px] break-all">
                {clearReceipt.error}
              </p>
            </div>
          )}
          {clearReceipt?.status === "skipped" && (
            <p className="text-sm opacity-60">{clearReceipt.reason}</p>
          )}
          </div>
        </section>
      ) : (
        <div className="flex">
          <button
            type="button"
            onClick={handleAdvance}
            disabled={busy}
            className="rounded-md px-5 py-2.5 text-sm font-medium transition disabled:opacity-40"
            style={{
              background: "var(--color-preset-accent)",
              color: "var(--color-preset-bg)",
            }}
          >
            {busy ? "Advancing…" : "Advance"}
          </button>
        </div>
      )}
    </div>
  );
}
