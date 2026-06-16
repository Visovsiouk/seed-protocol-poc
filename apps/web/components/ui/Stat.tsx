/**
 * Stat.
 *
 * Label + tabular-figure value, with an optional delta. Powers the HUD
 * badges, the realm-dashboard MetricsRow, and the value-flow rows. Tabular
 * figures are non-negotiable here so ticking numbers don't jitter.
 */

import type { ReactNode } from "react";
import { tv, type VariantProps } from "tailwind-variants";

const stat = tv({
  base: "flex gap-0.5",
  variants: {
    align: {
      center: "flex-col items-center",
      start: "flex-col items-start",
    },
  },
  defaultVariants: { align: "center" },
});

export function Stat({
  label,
  value,
  delta,
  color,
  align,
}: {
  label: ReactNode;
  value: ReactNode;
  /** Signed change shown beside the value (e.g. "+12"). Coloured by sign. */
  delta?: number;
  /** Override the value colour (CSS colour or var()). */
  color?: string;
  align?: VariantProps<typeof stat>["align"];
}) {
  return (
    <div className={stat({ align })}>
      <span className="text-[9px] uppercase tracking-widest opacity-60">{label}</span>
      <span className="flex items-baseline gap-1 leading-none">
        <span className="text-base font-bold tabular-nums" style={color ? { color } : undefined}>
          {value}
        </span>
        {delta != null && delta !== 0 && (
          <span
            className="text-[10px] font-semibold tabular-nums"
            style={{ color: delta > 0 ? "var(--color-ok)" : "var(--color-danger)" }}
          >
            {delta > 0 ? `+${delta}` : delta}
          </span>
        )}
      </span>
    </div>
  );
}
