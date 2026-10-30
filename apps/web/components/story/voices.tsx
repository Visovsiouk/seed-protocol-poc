"use client";

/**
 * The margin voice, as rendering.
 *
 * The old narration failed partly on register: every line — room description,
 * boss lore, post-clear beat — was the same breathy second-person prose, so
 * nothing stood out and the eye slid off. The rewrite splits the narration in
 * two, and this module is where that split becomes visible. A reader should be
 * able to tell who is talking without being told, which is a job for type, not
 * for adjectives.
 *
 *   - **The Book** — not here. It's the existing `Body` from the kit (mono
 *     italic with a hanging em-dash). That em-dash is the Book's tic and the
 *     reason the margin voice can't reuse `Body`.
 *   - **The Margins** (`MarginLine`) — a former borrower's pen. The only
 *     cursive in the app.
 *
 * ── Why there is no third voice ────────────────────────────────────────────
 * A `ColophonLine`/`Redaction`/`ReviseLine` set used to live here: the
 * antagonist never speaks, so he was rendered as *typography* — a line that
 * wrote itself, was struck through, and rewrote while the player watched, plus
 * redaction bars closing over text.
 *
 * It was cut because it did not communicate. A struck-through line only reads
 * as "someone is editing this page" if the reader already has that convention;
 * cold, in an opening, it reads as a typo being corrected or as a rendering
 * glitch, and it read that way in both directions when the edit was flipped to
 * try to fix it. Typography can carry a character the player has already met.
 * It can't introduce one.
 *
 * What replaced it costs nothing to render and needs no convention: he is the
 * only entry on the date-due card with no name, and after the player signs,
 * something writes one word under their line in a hand that isn't theirs. The
 * player reads an artifact rather than decoding an animation.
 */

import type { ReactNode } from "react";

/**
 * A former borrower's handwriting.
 *
 * Cursive runs visually smaller than sans at the same px, so the sizes here
 * are a step up from `Body`'s to land on the same optical measure. The slight
 * rotation and the hairline text-shadow are doing one job between them:
 * making this read as ink pressed into a page by a hand, next to type that
 * was printed. No em-dash prefix — that belongs to the Book.
 */
export function MarginLine({
  children,
  size = "md",
  className,
}: {
  children: ReactNode;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <p
      className={[
        "font-[family-name:var(--font-margin)] leading-[1.5] opacity-90",
        "[text-shadow:0_0_0.6px_currentColor]",
        "-rotate-[0.35deg] origin-left",
        size === "sm" ? "text-[16px]" : "text-[19px]",
        className ?? "",
      ].join(" ")}
    >
      {children}
    </p>
  );
}

/**
 * The attribution under a margin note — who wrote it and when.
 *
 * Kept separate from `MarginLine` so the signature can sit in a beat's
 * `footnote` slot while the note itself sits in the body, and so the two can
 * carry different rotations (a signature is never quite square to the note).
 */
export function MarginSignature({ children }: { children: ReactNode }) {
  return (
    <p className="self-end font-[family-name:var(--font-margin)] text-[15px] opacity-70 rotate-[0.6deg]">
      {children}
    </p>
  );
}
