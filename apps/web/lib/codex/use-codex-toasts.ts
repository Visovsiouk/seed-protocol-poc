"use client";

/**
 * Codex completion watcher — fires a toast the moment a step flips to done.
 *
 * Codex status is DERIVED (chain reads + one localStorage flag), never
 * evented, so completions are detected by diffing successive derives against
 * a baseline:
 *
 *   - Nothing is compared while `isLoading` — a partially-loaded derive
 *     briefly reports steps as not-done, and toasting the flip back to done
 *     would announce stale progress on every page load.
 *   - The first settled derive per address per PAGE LOAD baselines silently
 *     (persisted seen-set ∪ currently done) — reloads, pre-feature progress,
 *     and other-device completions are absorbed, not celebrated. The
 *     baseline lives at module scope, keyed by address, so a wallet
 *     disconnect/reconnect flicker or a widget remount mid-session does NOT
 *     re-baseline — progress that lands during the gap still toasts.
 *   - After that, any step newly in `done` toasts once and joins the
 *     persisted seen-set (`lib/codex/seen.ts`).
 *
 * Steps are monotonic (chain state only accrues), so done→undone never
 * needs handling. Consumed ONLY by `<CornerDock/>` — a second mount would
 * double-toast.
 */

import { useEffect } from "react";
import { useNotify } from "@/components/ui/Toast";
import { CODEX_STEPS, type CodexStepId } from "./steps";
import type { CodexStatus } from "./status";
import { loadSeenSteps, newlyStamped, saveSeenSteps } from "./seen";

/** Session baselines by lowercase address — survives remounts/reconnects. */
const baselines = new Map<string, Set<CodexStepId>>();

export function useCodexToasts(
  address: `0x${string}` | undefined,
  status: CodexStatus,
  isLoading: boolean,
): void {
  const notify = useNotify();

  useEffect(() => {
    if (!address || isLoading) return;

    const addr = address.toLowerCase();
    const baseline = baselines.get(addr);

    if (!baseline) {
      const seen = new Set([...loadSeenSteps(address), ...status.done]);
      baselines.set(addr, seen);
      saveSeenSteps(address, seen);
      return;
    }

    const fresh = newlyStamped(status.done, baseline);
    if (fresh.length === 0) return;
    for (const id of fresh) {
      const step = CODEX_STEPS.find((s) => s.id === id)!;
      baseline.add(id);
      notify({
        tone: "ok",
        title: `Codex stamped — ${step.title}`,
        description: step.proves,
      });
    }
    saveSeenSteps(address, baseline);
  }, [address, isLoading, notify, status.done]);
}
