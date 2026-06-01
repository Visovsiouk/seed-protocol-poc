/**
 * Meter.
 *
 * One bar primitive behind three delve readouts: HP, the depth meter
 * (1 ··· bossDepth), and the realm budget bar. `segments` renders discrete
 * ticks (depth nodes); omitting it renders a continuous fill (HP/budget).
 *
 * Colour is a prop so callers drive semantics (HP greens→rose, budget warn,
 * depth accent). The track uses the glass surface token so it re-themes per
 * preset.
 */

import { tv, type VariantProps } from "tailwind-variants";

const track = tv({
  base: "relative w-full overflow-hidden rounded-full bg-[var(--surface-2)]",
  variants: {
    size: {
      sm: "h-1.5",
      md: "h-2",
      lg: "h-3",
    },
  },
  defaultVariants: { size: "md" },
});

type MeterProps = VariantProps<typeof track> & {
  /** Current value. */
  value: number;
  /** Maximum value. */
  max: number;
  /** Fill colour (CSS colour or var()). Defaults to the preset accent. */
  color?: string;
  /**
   * Render N discrete segments instead of a continuous fill. Used by the
   * depth meter so each descended node reads as a lit tick.
   */
  segments?: number;
  className?: string;
};

export function Meter({
  value,
  max,
  color = "var(--color-preset-accent)",
  segments,
  size,
  className,
}: MeterProps) {
  const safeMax = max <= 0 ? 1 : max;
  const pct = Math.min(100, Math.max(0, (value / safeMax) * 100));

  if (segments && segments > 0) {
    return (
      <div className={`flex gap-1 ${className ?? ""}`} aria-hidden>
        {Array.from({ length: segments }, (_, i) => {
          const lit = i < value;
          return (
            <span
              key={i}
              className="h-2 flex-1 rounded-full transition-[background,box-shadow] duration-[var(--dur)] ease-[var(--ease-out)]"
              style={{
                background: lit ? color : "var(--surface-2)",
                boxShadow: lit ? `0 0 8px -1px ${color}` : "none",
              }}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className={track({ size, className })}>
      <div
        className="h-full rounded-full transition-[width] duration-[var(--dur)] ease-[var(--ease-out)]"
        style={{ width: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}70` }}
      />
    </div>
  );
}
