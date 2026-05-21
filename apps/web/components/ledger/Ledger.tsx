/**
 * Diegetic-ledger presentation primitives.
 *
 * The narrative voice on the landing page and per-realm dashboards is
 * meant to read like a worn page someone left pinned to a door — not as
 * marketing copy. These four helpers give every story block the same
 * shape:
 *
 *   ──────────── ┄ STAMP · GENESIS · DOOR I ┄ ────────────
 *   Title in mono, tight kerning.
 *   — body in mono italic, hanging em-dash, narrow measure.
 *   ─────────── recovered page · pinned to the first door
 *
 * Lives in its own module so the landing picker (`RealmSelector`) and
 * the per-realm dashboard (`/realm/[address]`) speak with one voice
 * without duplicating components.
 */

import type { ReactNode } from "react";

/**
 * Hairline divider. `accent` uses the active preset's accent color
 * (theme variable) and reads as a torn page edge; `muted` is a neutral
 * grey for separators that shouldn't carry color weight.
 */
export function LedgerRule({
  tone = "accent",
}: {
  tone?: "accent" | "muted";
}) {
  return (
    <span
      aria-hidden
      className="block w-full"
      style={{
        height: 1,
        background:
          tone === "accent"
            ? "linear-gradient(to right, transparent 0%, var(--color-preset-accent) 50%, transparent 100%)"
            : "linear-gradient(to right, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%)",
        opacity: tone === "accent" ? 0.55 : 1,
      }}
    />
  );
}

/**
 * Stamp-style eyebrow: small-caps mono wrapped in figure-dash brackets.
 * Replaces plain UI labels with something that looks rubber-stamped onto
 * the page. Accent-tinted by default; pass `tone="muted"` for a neutral
 * margin annotation that shouldn't compete with the preset palette.
 */
export function LedgerStamp({
  children,
  tone = "accent",
}: {
  children: ReactNode;
  tone?: "accent" | "muted";
}) {
  const color =
    tone === "accent" ? "var(--color-preset-accent)" : "rgba(255,255,255,0.6)";
  return (
    <span
      className="inline-flex items-center gap-2 font-mono text-[10px] uppercase"
      style={{
        letterSpacing: "0.32em",
        opacity: 0.75,
        color,
      }}
    >
      <span aria-hidden style={{ opacity: 0.55 }}>
        ┄
      </span>
      <span>{children}</span>
      <span aria-hidden style={{ opacity: 0.55 }}>
        ┄
      </span>
    </span>
  );
}

/**
 * Body copy: mono italic with a hanging em-dash and a narrow measure.
 * Reads as a written note rather than UI text. `max-w-[62ch]` keeps the
 * column tight enough to parse as a page even on wide screens.
 */
export function LedgerBody({
  children,
  size = "md",
}: {
  children: ReactNode;
  size?: "sm" | "md";
}) {
  const fontSize = size === "sm" ? 13 : 14.5;
  return (
    <p
      className="font-mono italic leading-[1.75] opacity-85"
      style={{
        fontSize,
        letterSpacing: "-0.005em",
        maxWidth: "62ch",
      }}
    >
      <span aria-hidden style={{ marginRight: "0.45em", opacity: 0.5 }}>
        —
      </span>
      {children}
    </p>
  );
}

/**
 * Right-aligned small-caps mono attribution — the "recovered page" tag
 * at the bottom of a ledger block. Use sparingly so it stays a footer
 * rather than competing with the body.
 */
export function LedgerFootnote({ children }: { children: ReactNode }) {
  return (
    <p
      className="font-mono text-[10px] uppercase opacity-50 self-end"
      style={{ letterSpacing: "0.25em" }}
    >
      {children}
    </p>
  );
}
