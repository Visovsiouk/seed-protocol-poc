"use client";

import type { Preset } from "@/lib/engine/types";
import { Chip } from "@/components/ui";

export function PresetBadge({ preset }: { preset: Preset }) {
  const label =
    preset === "fantasy" ? "Fantasy" : preset === "scifi" ? "Sci-Fi" : "Cyberpunk";
  return (
    <span className="inline-block text-[10px] uppercase tracking-widest px-2 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border-1)]">
      {label}
    </span>
  );
}

export function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "ok" | "warn" | "muted";
}) {
  const color =
    tone === "ok"
      ? "var(--color-ok)"
      : tone === "warn"
        ? "var(--color-warn)"
        : "var(--color-preset-fg)";
  return <Chip color={color} label={label} />;
}

/** Shared interactive-card chrome for the realm picker cards. */
export const REALM_CARD_CLASS =
  "flex flex-col gap-3 p-5 rounded-md text-left transition hover:scale-[1.02] focus:outline-none focus:ring";

/**
 * Preset-themed card surface — the genre palette resolves via the card's
 * `data-preset` attribute; a custom accent can be layered on top by
 * spreading an accent CSS-var override after this object.
 */
export const REALM_CARD_THEME_STYLE = {
  background: "var(--color-preset-bg)",
  color: "var(--color-preset-fg)",
  border: "1px solid var(--color-preset-accent)",
} as const satisfies React.CSSProperties;
