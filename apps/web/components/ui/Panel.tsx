/**
 * Panel — the shared surface primitive.
 *
 * Replaces the hand-rolled `style={{ background: "rgba(255,255,255,0.06)",
 * border: "1px solid rgba(255,255,255,0.08)" }}` panels scattered across
 * the app. Every surface derives from the preset-aware tokens in
 * globals.css (`--surface-*`, `--border-*`, `--glow`, `--parchment`), so a
 * single `[data-preset]` switch re-themes all panels at once.
 *
 *   tone   glass-1 | glass-2 | glass-3 | parchment    (neutral surface layer)
 *          danger | warn | ok                          (semantic tinted surface)
 *   glow   none | accent                              (accent halo ring)
 *   inset  true | false                               (inner vs. raised)
 */

import { tv, type VariantProps } from "tailwind-variants";
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

const panel = tv({
  base: "rounded-lg border",
  variants: {
    tone: {
      "glass-1": "bg-[var(--surface-1)] border-[var(--border-1)]",
      "glass-2": "bg-[var(--surface-2)] border-[var(--border-1)]",
      "glass-3": "bg-[var(--surface-3)] border-[var(--border-1)]",
      parchment:
        "bg-[var(--parchment)] text-[var(--parchment-ink)] border-[var(--border-1)]",
      danger: "bg-[var(--surface-danger)] border-[var(--border-danger)]",
      warn: "bg-[var(--surface-warn)] border-[var(--border-warn)]",
      ok: "bg-[var(--surface-ok)] border-[var(--border-ok)]",
    },
    glow: {
      none: "",
      accent: "border-[var(--border-2)] shadow-[0_0_24px_-6px_var(--glow)]",
    },
    inset: {
      true: "shadow-[inset_0_1px_0_0_var(--border-1)]",
      false: "",
    },
  },
  defaultVariants: {
    tone: "glass-1",
    glow: "none",
    inset: false,
  },
});

type PanelVariants = VariantProps<typeof panel>;

type PanelProps<T extends ElementType> = {
  as?: T;
  children?: ReactNode;
  className?: string;
} & PanelVariants &
  Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

export function Panel<T extends ElementType = "div">({
  as,
  tone,
  glow,
  inset,
  className,
  children,
  ...rest
}: PanelProps<T>) {
  const Tag = (as ?? "div") as ElementType;
  return (
    <Tag className={panel({ tone, glow, inset, className })} {...rest}>
      {children}
    </Tag>
  );
}
