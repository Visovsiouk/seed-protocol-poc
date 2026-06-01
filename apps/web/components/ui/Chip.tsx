/**
 * Chip family.
 *
 * Small uppercase pills for loot metadata. Colour always pairs with a
 * label so it is never the sole signal (colour-blind safety). All hue
 * lookups come from the single source of truth in `lib/ui/loot-visuals.ts`
 * — these components never own their own colour dicts.
 */

import type { ReactNode } from "react";
import type { CatalogEffect } from "@/lib/engine/types";
import {
  effectMeta,
  elementColor,
  TIER_LABEL,
  tierColor,
} from "@/lib/ui/loot-visuals";

// ─── base ────────────────────────────────────────────────────────────────────
// Soft-bg pill tinted toward `color`, with a legible same-hue label. `color`
// is any CSS colour (hex or a var()).

export function Chip({
  color,
  label,
  sub,
}: {
  color: string;
  label: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide leading-none"
      style={{
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`,
        color,
      }}
    >
      <span>{label}</span>
      {sub != null && (
        <span className="font-normal lowercase opacity-75">{sub}</span>
      )}
    </span>
  );
}

// ─── tier ──────────────────────────────────────────────────────────────────

export function TierChip({ tier }: { tier: number }) {
  return <Chip color={tierColor(tier)} label={`T${tier}`} sub={TIER_LABEL[tier]} />;
}

// ─── element ─────────────────────────────────────────────────────────────────
// `label` lets callers pass a preset-translated name (e.g. "laser") while
// the hue stays keyed to the canonical element so it reads the same across
// realms. `kind` adds the damage/resist framing word.

export function ElementChip({
  element,
  label,
  kind = "damage",
}: {
  element: string;
  label?: string;
  kind?: "damage" | "resist";
}) {
  const name = label ?? element;
  return (
    <Chip
      color={elementColor(element)}
      label={kind === "resist" ? `resists ${name}` : name}
    />
  );
}

// ─── catalog effect ───────────────────────────────────────────────────────────

export function EffectChip({ effect }: { effect: CatalogEffect }) {
  const meta = effectMeta(effect.name);
  if (!meta) return null;
  return <Chip color={meta.color} label={meta.label} sub={meta.format(effect.value)} />;
}

// ─── provenance ───────────────────────────────────────────────────────────────
// Neutral, accent-tinted pill for origin/creator facts. Intentionally
// quieter than the loot chips so it reads as a margin annotation.

export function ProvenanceChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-preset-accent)] bg-[var(--surface-2)] border border-[var(--border-1)]">
      {children}
    </span>
  );
}
