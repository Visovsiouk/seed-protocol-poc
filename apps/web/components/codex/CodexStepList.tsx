"use client";

/**
 * The Protocol Codex step list — the journey checklist mapping every step of
 * play onto the Seed Protocol feature it demonstrates (white-paper reference
 * on each row). Status is derived from chain reads (plus one localStorage
 * flag for the cross-realm carry) — see lib/codex/*.
 *
 * Pending rows show what to DO; stamped rows flip to what just HAPPENED
 * on-chain, so the codex doubles as the protocol's show-don't-tell tour.
 *
 * Rendered inside the floating `<CodexWidget/>`. CTAs are plain Links to
 * `/?station=…` (or an app route) paired with the hub-station event so they
 * work both off-hub (fresh mount reads the URL) and on-hub (event switches
 * the live station) — see components/hub/station-event.ts.
 */

import Link from "next/link";
import { Button, Chip } from "@/components/ui";
import { CODEX_STEPS, type CodexStep } from "@/lib/codex/steps";
import type { CodexStatus } from "@/lib/codex/status";
import {
  emitHubStation,
  type HubStation,
} from "@/components/hub/station-event";

function StepRow({
  step,
  done,
  isNext,
  onAction,
}: {
  step: CodexStep;
  done: boolean;
  isNext: boolean;
  /** Fired when the row's CTA is clicked (the widget closes its popover). */
  onAction?: () => void;
}) {
  const diamond = (
    <span
      aria-hidden
      style={{
        width: 9,
        height: 9,
        marginTop: 6,
        flexShrink: 0,
        transform: "rotate(45deg)",
        background: done ? "var(--color-preset-accent)" : "transparent",
        border: `1px solid ${
          done ? "var(--color-preset-accent)" : "var(--border-2)"
        }`,
        boxShadow: done ? "0 0 8px var(--color-preset-accent)" : "none",
      }}
    />
  );

  const target = step.cta.target;
  const isRoute = target.startsWith("/");
  const cta =
    !done && isNext ? (
      <Link
        href={isRoute ? target : `/?station=${target}`}
        prefetch
        className="self-start"
        onClick={() => {
          if (!isRoute && target !== "codex") {
            emitHubStation(target as HubStation);
          }
          onAction?.();
        }}
      >
        <Button intent="primary" size="sm">
          {step.cta.label} →
        </Button>
      </Link>
    ) : null;

  return (
    <li
      className="flex items-start gap-3 py-3"
      style={{ opacity: done || isNext ? 1 : 0.55 }}
      aria-current={isNext ? "step" : undefined}
    >
      {diamond}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-medium tracking-[-0.01em]">
            {step.title}
          </span>
          <Chip
            color={done ? "var(--color-ok)" : "var(--border-2)"}
            label={`WP ${step.wpRef}`}
          />
          {step.frontier && !done && (
            <Chip color="var(--border-2)" label="Horizon" />
          )}
        </div>
        <p className="text-xs leading-relaxed opacity-75">
          {done ? step.proves : step.action}
        </p>
        {cta}
      </div>
    </li>
  );
}

export function CodexStepList({
  status,
  onAction,
}: {
  status: CodexStatus;
  onAction?: () => void;
}) {
  return (
    <ul className="flex flex-col divide-y divide-[var(--border-1)]">
      {CODEX_STEPS.map((step) => (
        <StepRow
          key={step.id}
          step={step}
          done={status.done.has(step.id)}
          isNext={status.nextId === step.id}
          onAction={onAction}
        />
      ))}
    </ul>
  );
}
