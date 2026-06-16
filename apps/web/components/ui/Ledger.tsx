/**
 * Ledger primitives, promoted into the kit.
 *
 * These are the diegetic-ledger voice — a stamped eyebrow, a torn-page
 * rule, and a "recovered page" footnote — token-ized to the preset accent
 * and the display/mono type voices. They began life in
 * `components/ledger/Ledger.tsx`; the per-route migrations point
 * consumers here, after which the old module is retired.
 */

import { tv, type VariantProps } from "tailwind-variants";
import type { ReactNode } from "react";

// ─── Rule ──────────────────────────────────────────────────────────────────
// Hairline divider that reads as a torn page edge. `accent` glows with the
// preset; `muted` is a neutral separator.

const rule = tv({
  base: "block w-full h-px",
  variants: {
    tone: {
      accent:
        "bg-[linear-gradient(to_right,transparent,var(--color-preset-accent),transparent)] opacity-55",
      muted:
        "bg-[linear-gradient(to_right,transparent,var(--border-1),transparent)]",
    },
  },
  defaultVariants: { tone: "accent" },
});

export function Rule({ tone }: VariantProps<typeof rule>) {
  return <span aria-hidden className={rule({ tone })} />;
}

// ─── Stamp ─────────────────────────────────────────────────────────────────
// Small-caps mono eyebrow wrapped in figure-dash brackets — a rubber stamp,
// not a UI label.

const stamp = tv({
  base: "inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.32em] opacity-75",
  variants: {
    tone: {
      accent: "text-[var(--color-preset-accent)]",
      muted: "text-[var(--color-preset-text)]/60",
    },
  },
  defaultVariants: { tone: "accent" },
});

export function Stamp({
  children,
  tone,
}: { children: ReactNode } & VariantProps<typeof stamp>) {
  return (
    <span className={stamp({ tone })}>
      <span aria-hidden className="opacity-55">
        ┄
      </span>
      <span>{children}</span>
      <span aria-hidden className="opacity-55">
        ┄
      </span>
    </span>
  );
}

// ─── Body ──────────────────────────────────────────────────────────────────
// Mono-italic narrative copy with a hanging em-dash and a narrow measure —
// reads as a written page note, not UI text. `sm` tightens it for cards.

const body = tv({
  base: "font-mono italic leading-[1.75] tracking-[-0.005em] opacity-85 max-w-[62ch]",
  variants: {
    size: { sm: "text-[13px]", md: "text-[14.5px]" },
  },
  defaultVariants: { size: "md" },
});

export function Body({
  children,
  size,
}: { children: ReactNode } & VariantProps<typeof body>) {
  return (
    <p className={body({ size })}>
      <span aria-hidden className="mr-[0.45em] opacity-50">
        —
      </span>
      {children}
    </p>
  );
}

// ─── Footnote ────────────────────────────────────────────────────────────────
// Right-aligned small-caps mono attribution — the "recovered page" tag.

export function Footnote({ children }: { children: ReactNode }) {
  return (
    <p className="self-end font-mono text-[10px] uppercase tracking-[0.25em] opacity-65">
      {children}
    </p>
  );
}
