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
 *   - The first settled derive per address baselines silently (persisted
 *     seen-set ∪ currently done) — reloads, pre-feature progress, and
 *     other-device completions are absorbed, not celebrated.
 *   - After that, any step newly in `done` toasts once and joins the
 *     persisted seen-set (`lib/codex/seen.ts`).
 *
 * Steps are monotonic (chain state only accrues), so done→undone never
 * needs handling. Consumed ONLY by `<CodexWidget/>` — a second mount would
 * double-toast.
 */

import { useEffect, useRef } from "react";
import { useNotify } from "@/components/ui/Toast";
import { CODEX_STEPS, type CodexStepId } from "./steps";
import type { CodexStatus } from "./status";
import { loadSeenSteps, newlyStamped, saveSeenSteps } from "./seen";

export function useCodexToasts(
  address: `0x${string}` | undefined,
  status: CodexStatus,
  isLoading: boolean,
): void {
  const notify = useNotify();
  const baselineRef = useRef<{
    addr: string;
    seen: Set<CodexStepId>;
  } | null>(null);

  useEffect(() => {
    if (!address) {
      baselineRef.current = null;
      return;
    }
    if (isLoading) return;

    const addr = address.toLowerCase();
    const baseline = baselineRef.current;

    if (!baseline || baseline.addr !== addr) {
      const seen = new Set([...loadSeenSteps(address), ...status.done]);
      baselineRef.current = { addr, seen };
      saveSeenSteps(address, seen);
      return;
    }

    const fresh = newlyStamped(status.done, baseline.seen);
    if (fresh.length === 0) return;
    for (const id of fresh) {
      const step = CODEX_STEPS.find((s) => s.id === id)!;
      baseline.seen.add(id);
      notify({
        tone: "ok",
        title: `Codex stamped — ${step.title}`,
        description: step.proves,
      });
    }
    saveSeenSteps(address, baseline.seen);
  }, [address, isLoading, notify, status.done]);
}
