"use client";

import { useCallback, useRef, useState } from "react";
import type { EscrowEntry, RunState } from "@/lib/engine/types";
import { ChoiceRow, type Choice } from "./ChoiceRow";

/** Status of the batched escrow mint at extraction / boss clear. */
export type BankStatus =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "done"; count: number }
  | { kind: "failed"; error: string };

/**
 * Owns the batched escrow mint: the mint status plus a
 * `runBank` that guards so it fires exactly once per run — both the
 * Extract confirm and the boss-clear auto-bank funnel through it, and the
 * callers' effects can re-fire on every state change. The gate re-opens on
 * a mint failure so the player can retry without losing the findings.
 */
export function useBankEscrow(args: {
  /** The parent-supplied batch-mint handler (may be async; may reject). */
  onBankEscrow?: (
    escrow: readonly EscrowEntry[],
    ctx: { reason: "extract" | "boss" },
  ) => Promise<void> | void;
  /**
   * Called once the batch mint settles — commit the engine-side
   * extraction so the escrow clears only after the mint landed.
   */
  onSettled: () => void;
}): {
  bankStatus: BankStatus;
  runBank: (
    bankState: RunState,
    reason: "extract" | "boss",
  ) => Promise<boolean>;
} {
  const { onBankEscrow, onSettled } = args;
  const [bankStatus, setBankStatus] = useState<BankStatus>({ kind: "idle" });
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
        onSettled();
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
    [onBankEscrow, onSettled],
  );

  return { bankStatus, runBank };
}

/**
 * Renders the state of the batched escrow mint. Shared by
 * the extraction-success panel and the boss-clear run-over panel — both
 * bank the escrow, the only difference is the trigger.
 */
export function BankStatusLine({
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
