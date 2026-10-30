"use client";

import { useEffect, useState } from "react";

import { Panel } from "@/components/ui";
import { BankStatusLine, type BankStatus } from "./BankStatus";
import { ChoiceRow, type Choice } from "./ChoiceRow";

/** Status of the clearReceipt mint, driven by the play page. */
export type ClearReceiptStatus =
  | { status: "pending" }
  | { status: "minted"; txHash: `0x${string}`; tokenId: bigint }
  | { status: "failed"; error: string }
  | { status: "skipped"; reason: string };

/**
 * The way out of a finished run.
 *
 * Both terminal panels below host one of these and nothing else navigates:
 * the run ends when the player says it ends. `DefeatOverlay` has always
 * worked this way (focused CTA, not dismissable) and a clear should be at
 * least as deliberate as a death.
 *
 * Rendered through `ChoiceRow` rather than a bare button for the activation
 * gate: combat is driven by `ChoiceRow`, so a player mashing Enter through
 * the last fight arrives here with the key still down. The gate disarms on
 * the choice-set change and refuses to fire until Enter is physically
 * released — without it, gating the beat on a press would be no better than
 * the timer it replaces.
 *
 * `blocked` is for a mint still holding the player's loot, never for a
 * cosmetic receipt: a slow clearReceipt must not trap anyone on this screen.
 *
 * While `blocked`, leaving takes two presses rather than one. The exit stays
 * reachable on purpose — a stuck chain must not be a locked door — but the
 * first press now says what leaving costs. Navigating away unmounts the tree
 * that owns the mint loop and `BankStatusLine`'s retry, so a finding that
 * fails after the player has gone is dropped with nothing left to report it:
 * previously the only exit from a cleared run was an auto-return gated on the
 * bank being `done`, and that guard went when the player got a button.
 */
function RunExit({
  label,
  onLeave,
  blocked,
}: {
  label: string;
  onLeave: () => void;
  blocked: boolean;
}) {
  const [armed, setArmed] = useState(false);

  // Disarm the moment the findings land, so a confirm the player opened during
  // the mint doesn't outlive the reason for it.
  useEffect(() => {
    if (!blocked) setArmed(false);
  }, [blocked]);

  if (blocked && armed) {
    return (
      <div className="flex flex-col gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] opacity-70">
          Your findings are still being recorded. Leave now and anything that
          fails is lost.
        </p>
        <ChoiceRow
          ariaLabel="Leave before the findings are recorded"
          choices={
            [
              {
                key: "wait",
                label: "Wait for them",
                variant: "primary",
                onClick: () => setArmed(false),
              },
              {
                key: "leave-anyway",
                label: "Leave anyway",
                onClick: onLeave,
              },
            ] satisfies Choice[]
          }
          showHint={false}
        />
      </div>
    );
  }

  return (
    <ChoiceRow
      ariaLabel="Leave the page"
      choices={
        [
          {
            key: "leave",
            label,
            // Demoted while the findings are still in flight so the eye goes
            // to the bank status instead; still pressable, because a stuck
            // chain must not be a locked door.
            variant: blocked ? "default" : "primary",
            onClick: blocked ? () => setArmed(true) : onLeave,
          },
        ] satisfies Choice[]
      }
      showHint={false}
    />
  );
}

/**
 * Extracted & banked: fills the focal slot with the outcome where the
 * enemy stood, instead of dropping it below the log over an empty void.
 * Same terminal-state treatment as the boss clear.
 */
export function ExtractedPanel({
  chainReady,
  realmName,
  bankStatus,
  onRetryBank,
  onLeave,
}: {
  chainReady: boolean;
  realmName: string;
  bankStatus: BankStatus;
  onRetryBank: () => void;
  onLeave: () => void;
}) {
  return (
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
      <BankStatusLine status={bankStatus} onRetry={onRetryBank} />
      {/* This panel used to be unreachable in the happy path: the extract
          handler pushed `/` the moment the bank settled, so the only players
          who ever read it were the ones whose mint failed. */}
      <RunExit
        label="Back to the base"
        onLeave={onLeave}
        blocked={bankStatus.kind === "pending"}
      />
    </Panel>
  );
}

/**
 * Boss down: the focal slot held the enemy, now it holds the thing you
 * WON — the realm-cleared narrative beat (`interstitial`, owned by the
 * page) plus the clear-receipt / bank status and the exit.
 *
 * The exit lives here rather than inside `interstitial` so there is exactly
 * one of them and it can never be missing — a realm with no story content
 * (trial mode) still has a way home.
 */
export function RunOverPanel({
  interstitial,
  bossClearedTurns,
  bankStatus,
  onRetryBank,
  clearReceipt,
  leaveLabel,
  onLeave,
  exitArmed,
}: {
  interstitial?: React.ReactNode;
  bossClearedTurns?: number;
  bankStatus: BankStatus;
  onRetryBank: () => void;
  clearReceipt?: ClearReceiptStatus;
  /** From `Interstitial.cta.label` — the story names its own way out. */
  leaveLabel: string;
  onLeave: () => void;
  /**
   * Hold the exit back while the boss-clear bank picker is open.
   *
   * That picker is a portalled focus trap and this panel renders *underneath*
   * it (`runOver` is already true while the player is choosing what surfaces
   * with them). A focusable control under a trap is a focus race and an
   * exit the player can reach before they've finished resolving the run.
   */
  exitArmed: boolean;
}) {
  return (
    <section aria-label="Run complete" className="flex flex-col gap-3">
      {interstitial}
      <Panel tone="glass-2" className="flex flex-col gap-2 p-4">
        {bossClearedTurns !== undefined && (
          <p className="text-xs opacity-70 tabular-nums uppercase tracking-widest">
            Cleared in {bossClearedTurns} turn
            {bossClearedTurns === 1 ? "" : "s"}
          </p>
        )}
        {/* Boss clear is an implicit extraction — bank the full escrow. */}
        <BankStatusLine status={bankStatus} onRetry={onRetryBank} />
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
        {exitArmed && (
          <div className="pt-1">
            <RunExit
              label={leaveLabel}
              onLeave={onLeave}
              // Deliberately NOT gated on `clearReceipt`: the receipt is a
              // trophy, the escrow is the player's loot. Only the latter is
              // worth making someone wait for.
              blocked={bankStatus.kind === "pending"}
            />
          </div>
        )}
      </Panel>
    </section>
  );
}
