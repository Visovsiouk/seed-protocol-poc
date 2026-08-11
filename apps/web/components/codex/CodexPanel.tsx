"use client";

/**
 * CodexPanel — the body of the Protocol Codex popover.
 *
 * Extracted from the former CodexWidget so the shared <CornerDock/> can render
 * it in the same floating slot the Inventory panel uses. Purely presentational:
 * status comes from the dock (which owns `useCodexStatus`), and `onAction` lets
 * a step CTA close the popover.
 */

import { Rule, Stamp } from "@/components/ui";
import type { CodexStatus } from "@/lib/codex/status";
import { CodexStepList } from "./CodexStepList";

export function CodexPanel({
  status,
  isLoading,
  onAction,
}: {
  status: CodexStatus;
  isLoading: boolean;
  onAction?: () => void;
}) {
  return (
    <>
      <header className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <Stamp tone="accent">The Codex</Stamp>
          <span
            className="font-mono text-sm tabular-nums opacity-70"
            aria-label={`Codex progress: ${status.completed} of ${status.total}`}
          >
            {isLoading ? "…" : `${status.completed}/${status.total}`}
          </span>
        </div>
        <Rule />
        <p className="text-xs leading-relaxed opacity-70">
          One journey, the whole protocol — each step exercises a different
          guarantee of the Seed Protocol, and the referenced white-paper section
          is what your action proves on-chain.
        </p>
      </header>
      <CodexStepList status={status} onAction={onAction} />
    </>
  );
}
