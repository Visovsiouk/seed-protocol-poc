"use client";

/**
 * The Protocol Codex — a journey checklist mapping every step of play onto
 * the Seed Protocol feature it demonstrates (white-paper reference on each
 * row). Status is derived from chain reads on every mount (plus one
 * localStorage flag for the cross-realm carry, which the chain can't
 * witness) — see lib/codex/*.
 *
 * Pending rows show what to DO; stamped rows flip to what just HAPPENED
 * on-chain, so the codex doubles as the protocol's show-don't-tell tour.
 */

import Link from "next/link";
import { useAccount } from "wagmi";
import { Panel, Button, Chip, Stamp, Rule } from "@/components/ui";
import { CODEX_STEPS, type CodexStep } from "@/lib/codex/steps";
import { useCodexStatus } from "@/lib/codex/use-codex";

type StationId = "doors" | "market" | "altar" | "forge" | "codex";

function StepRow({
  step,
  done,
  isNext,
  onNavigate,
}: {
  step: CodexStep;
  done: boolean;
  isNext: boolean;
  onNavigate?: (station: StationId) => void;
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

  const cta =
    !done && isNext ? (
      step.cta.target.startsWith("/") ? (
        <Link href={step.cta.target} prefetch className="self-start">
          <Button intent="primary" size="sm">
            {step.cta.label} →
          </Button>
        </Link>
      ) : onNavigate ? (
        <Button
          intent="primary"
          size="sm"
          onClick={() => onNavigate(step.cta.target as StationId)}
        >
          {step.cta.label} →
        </Button>
      ) : (
        <Link
          href={`/?station=${step.cta.target}`}
          prefetch
          className="self-start"
        >
          <Button intent="primary" size="sm">
            {step.cta.label} →
          </Button>
        </Link>
      )
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

export function CodexPanel({
  onNavigate,
}: {
  onNavigate?: (station: StationId) => void;
}) {
  const { address } = useAccount();
  const { status, isLoading } = useCodexStatus(address);

  return (
    <Panel
      as="section"
      tone="glass-2"
      aria-label="Protocol codex"
      className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-6"
    >
      <header className="flex flex-col gap-2">
        <Stamp tone="accent">The Codex</Stamp>
        <Rule />
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-mono text-xl font-medium tracking-[-0.015em]">
            One journey, the whole protocol
          </h3>
          <span
            className="font-mono text-sm tabular-nums opacity-70"
            aria-label={`Codex progress: ${status.completed} of ${status.total}`}
          >
            {isLoading ? "…" : `${status.completed}/${status.total}`}
          </span>
        </div>
        <p className="text-xs leading-relaxed opacity-70">
          Every step below exercises a different guarantee of the Seed
          Protocol — the referenced white-paper section is what your action
          proves on-chain.
        </p>
      </header>
      <ul className="flex flex-col divide-y divide-[var(--border-1)]">
        {CODEX_STEPS.map((step) => (
          <StepRow
            key={step.id}
            step={step}
            done={status.done.has(step.id)}
            isNext={status.nextId === step.id}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
    </Panel>
  );
}
