"use client";

/**
 * Everything written in this book's margins that the player can read:
 * the notes they found, plus the notes the book wrote about their own deaths.
 *
 * Thin client wrapper over the two storage adapters + the bank. Kept out of
 * `BookPanel` so the panel stays presentational, and out of `margins-local`
 * so that module stays a pure storage adapter with no React in it.
 *
 * Re-reads when `active` goes true rather than subscribing to storage: a
 * note is only ever written during a run, and the Book is only ever read
 * from the dock, so opening the panel is exactly the moment the list can
 * have changed. A `storage` listener would only fire for *other* tabs, which
 * is not the case that matters here.
 *
 * ── On ordering ────────────────────────────────────────────────────────────
 * The player's own notes come first, because the list is newest-first and a
 * death is the most recent thing written in the book. They are deliberately
 * not styled or labelled differently — same `MarginLine` voice as every other
 * note, carrying "your own hand" where the others carry a borrower's
 * signature. That sameness is the entire point: the player has been reading
 * dead borrowers' warnings all game, and discovering their own note in the
 * same form is what reveals what all of it *was*.
 *
 * True interleaving by when-each-was-read would need a write timestamp on both
 * stores. Not worth a migration of players' collected marginalia for an
 * ordering nobody can perceive — each note already shows its own in-world
 * date, which is where the deliberate out-of-order-ness actually lives.
 */

import { useEffect, useState } from "react";
import { loadFoundMargins } from "./margins-local";
import { loadEpitaphs } from "./epitaphs-local";
import { noteById, type MarginNote } from "./marginalia";

export function useFoundMargins(
  player: `0x${string}` | undefined,
  active: boolean,
): MarginNote[] {
  const [notes, setNotes] = useState<MarginNote[]>([]);

  useEffect(() => {
    if (!active) return;
    // Unknown ids (a note retired from the bank between sessions) drop out
    // silently rather than rendering a hole.
    const found = loadFoundMargins(player)
      .map((id) => noteById(id))
      .filter((n): n is MarginNote => n !== undefined)
      .reverse();
    // Stored as rendered, so these need no resolution against the bank.
    const mine = loadEpitaphs(player).reverse();
    setNotes([...mine, ...found]);
  }, [player, active]);

  return notes;
}
