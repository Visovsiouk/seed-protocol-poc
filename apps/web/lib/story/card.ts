/**
 * The borrower's own side of the date-due card.
 *
 * `CardEntries` renders the *other* borrowers — the stamped-out rows, the
 * scratched-off 1788 entry, the torn return column. This module derives the
 * part that belongs to the player: whether they've signed, which pages bear
 * their stamp, and whether the signet has been pressed.
 *
 * ── Why this is the progress tracker ───────────────────────────────────────
 * The old UI described progress as "sparks kindling against the mark", which
 * is three abstractions deep and tells a player nothing they can act on. A
 * card with three stamp slots is the same information, legible at a glance,
 * and already in the fiction: three stamps earn a signet, a signet lets you
 * write a page, and the return column stays torn the whole time so the reason
 * you can't simply leave is never out of sight.
 *
 * ── Why it derives from `lockStateFor` ─────────────────────────────────────
 * Rather than re-deriving unlock rules, this maps the *existing*
 * `lockStateFor()` used by `RealmSelector`, `GenesisLedger` and the hub. Five
 * surfaces then answer "which pages are open?" from one function, so the card
 * cannot drift out of step with the doors it describes.
 *
 * Pure: a `TutorialProgress` snapshot in, a card model out. No hooks, no
 * chain reads, no `window`.
 */

import type { Preset } from "@/lib/engine/types";
import type { TutorialProgress } from "@/lib/tutorial/progress";
import { PAGES } from "./canon";
import { REALM_ORDER, lockStateFor } from "./progression";

/**
 * One page's slot on the card.
 *
 *   - `stamped` — the borrower cleared this page; it bears their mark.
 *   - `open`    — reachable, not yet stamped.
 *   - `sealed`  — an earlier page is still unstamped, so this one can't be
 *     read yet. The Book renders a sealed page as illegible rather than
 *     labelling it "locked".
 */
export type CardStampState = "stamped" | "open" | "sealed";

export type CardStamp = {
  preset: Preset;
  /** Position in the canonical play order, 1-indexed. */
  slot: 1 | 2 | 3;
  /** Display name of the page, from canon. */
  page: string;
  state: CardStampState;
  /** Unix seconds of the clear that earned the stamp, or `null`. */
  ts: number | null;
};

export type DueDateCard = {
  /** Has the borrower written their name on the card at all? */
  signed: boolean;
  stamps: CardStamp[];
  /** Three stamps down and the signet cut — the card is spent. */
  signetPressed: boolean;
  /** How many slots are stamped, 0..3. Convenience for badges. */
  stampCount: number;
  /**
   * Always true in the PoC. The tear is what makes signing out impossible and
   * authorship the only way on, so it is modelled explicitly rather than
   * hardcoded in the view — a later chapter that repairs the card has
   * somewhere to say so.
   */
  returnColumnTorn: boolean;
};

export function dueDateCard(args: {
  progress: TutorialProgress;
  /**
   * Whether the borrower has signed the card.
   *
   * An argument rather than an import: the fact lives in localStorage behind
   * `hasConsumedColdOpen()`, which is a `"use client"` module, and pulling a
   * client module into a pure lib would make this untestable. The hook that
   * calls this supplies it — the same shape as `deriveCodexStatus`, which
   * also takes plain booleans it refuses to go and fetch.
   */
  signed: boolean;
}): DueDateCard {
  const { progress, signed } = args;

  const stamps: CardStamp[] = REALM_ORDER.map((preset, i) => {
    const lock = lockStateFor(preset, progress);
    const state: CardStampState =
      lock === "cleared" ? "stamped" : lock === "locked-pre-prev" ? "sealed" : "open";

    // `progress.cleared` is oldest-first; a page can only be cleared once for
    // the purposes of the card, so the first match is the stamp's date.
    const clear = progress.cleared.find((c) => c.preset === preset);

    return {
      preset,
      slot: (i + 1) as 1 | 2 | 3,
      page: PAGES[preset].name,
      state,
      ts: state === "stamped" ? (clear?.ts ?? null) : null,
    };
  });

  return {
    signed,
    stamps,
    signetPressed: progress.hasSeed,
    stampCount: stamps.filter((s) => s.state === "stamped").length,
    returnColumnTorn: true,
  };
}
