"use client";

import { Panel } from "@/components/ui";
import { BankStatusLine, type BankStatus } from "./BankStatus";

/** Status of the clearReceipt mint, driven by the play page. */
export type ClearReceiptStatus =
  | { status: "pending" }
  | { status: "minted"; txHash: `0x${string}`; tokenId: bigint }
  | { status: "failed"; error: string }
  | { status: "skipped"; reason: string };

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
}: {
  chainReady: boolean;
  realmName: string;
  bankStatus: BankStatus;
  onRetryBank: () => void;
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
      {/* Surfacing ends the delve and returns the player to the
          base automatically once the chosen findings have banked
          (see handleConfirmExtract). We only linger on this panel when
          the bank FAILED — then BankStatusLine offers a retry, and a
          successful retry redirects home like the happy path. */}
      <BankStatusLine status={bankStatus} onRetry={onRetryBank} />
    </Panel>
  );
}

/**
 * Boss down: the focal slot held the enemy, now it holds the thing you
 * WON — the realm-cleared narrative beat (`interstitial`, owned by the
 * page) plus the clear-receipt / bank status.
 */
export function RunOverPanel({
  interstitial,
  bossClearedTurns,
  bankStatus,
  onRetryBank,
  clearReceipt,
}: {
  interstitial?: React.ReactNode;
  bossClearedTurns?: number;
  bankStatus: BankStatus;
  onRetryBank: () => void;
  clearReceipt?: ClearReceiptStatus;
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
      </Panel>
    </section>
  );
}
