"use client";

/**
 * The margin notes this player has collected, resolved and newest-first.
 *
 * Thin client wrapper over `margins-local` + the bank. Kept out of
 * `BookPanel` so the panel stays presentational, and out of `margins-local`
 * so that module stays a pure storage adapter with no React in it.
 *
 * Re-reads when `active` goes true rather than subscribing to storage: a
 * note is only ever written during a run, and the Book is only ever read
 * from the dock, so opening the panel is exactly the moment the list can
 * have changed. A `storage` listener would only fire for *other* tabs, which
 * is not the case that matters here.
 */

import { useEffect, useState } from "react";
import { loadFoundMargins } from "./margins-local";
import { noteById, type MarginNote } from "./marginalia";

export function useFoundMargins(
  player: `0x${string}` | undefined,
  active: boolean,
): MarginNote[] {
  const [notes, setNotes] = useState<MarginNote[]>([]);

  useEffect(() => {
    if (!active) return;
    const ids = loadFoundMargins(player);
    // Newest first — the one just found should be at the top. Unknown ids
    // (a note retired from the bank between sessions) drop out silently
    // rather than rendering a hole.
    const resolved = ids
      .map((id) => noteById(id))
      .filter((n): n is MarginNote => n !== undefined)
      .reverse();
    setNotes(resolved);
  }, [player, active]);

  return notes;
}
