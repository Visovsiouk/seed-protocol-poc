/**
 * Button — the shared action primitive.
 *
 * Kills the per-page inline-styled buttons. Intents map onto the preset
 * palette so every action recolours with the realm:
 *
 *   primary   solid accent — the one obvious next step
 *   ghost     hairline glass — secondary, low-weight
 *   danger    rose — destructive / at-risk (extract-vs-fall framing)
 *   diegetic  stamped ledger action — reads as a rubber-stamp, not chrome
 */

import { tv, type VariantProps } from "tailwind-variants";
import type { ComponentPropsWithoutRef } from "react";

const button = tv({
  base: [
    "inline-flex items-center justify-center gap-2 rounded-md font-semibold",
    "transition-[background,color,border-color,box-shadow] duration-[var(--dur-fast)]",
    "ease-[var(--ease-out)] disabled:opacity-40 disabled:pointer-events-none",
  ],
  variants: {
    intent: {
      primary:
        "bg-[var(--color-preset-accent)] text-[var(--color-preset-bg)] hover:shadow-[0_0_20px_-4px_var(--glow)]",
      ghost:
        "bg-[var(--surface-1)] text-[var(--color-preset-fg)] border border-[var(--border-1)] hover:bg-[var(--surface-2)]",
      danger:
        "bg-[var(--color-danger)] text-[var(--color-preset-bg)] hover:brightness-110",
      diegetic: [
        "bg-transparent text-[var(--color-preset-accent)] font-mono uppercase",
        "border border-dashed border-[var(--border-2)] tracking-[0.18em]",
        "hover:bg-[color-mix(in_oklab,var(--color-preset-accent)_10%,transparent)]",
      ],
    },
    size: {
      sm: "text-xs px-2.5 py-1",
      md: "text-sm px-4 py-2",
      lg: "text-base px-6 py-3",
    },
    block: { true: "w-full", false: "" },
  },
  defaultVariants: {
    intent: "primary",
    size: "md",
    block: false,
  },
});

type ButtonVariants = VariantProps<typeof button>;

type ButtonProps = ButtonVariants &
  Omit<ComponentPropsWithoutRef<"button">, "className"> & {
    className?: string;
  };

export function Button({
  intent,
  size,
  block,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={button({ intent, size, block, className })} {...rest} />
  );
}
