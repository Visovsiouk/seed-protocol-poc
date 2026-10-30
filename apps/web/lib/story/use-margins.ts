"use client";

/**
 * Everything written in this book's margins that the player can read:
 * the notes they found and where each turned up, plus the notes the book
 * wrote about their own deaths.
 *
 * Thin client wrapper over the two storage adapters. Kept out of `BookPanel`
 * so the panel stays presentational, and out of `margins-local` so that module
 * stays a pure storage adapter with no React in it.
 *
 * Re-reads when `active` goes true rather than subscribing to storage: a
 * note is only ever written during a run, and the Book is only ever read
 * from the dock, so opening the panel is exactly the moment the list can
 * have changed. A `storage` listener would only fire for *other* tabs, which
 * is not the case that matters here.
 *
 * ── Why this returns a map rather than a list ──────────────────────────────
 * The collection used to be a flat, newest-first array — every note the player
 * had found, in the order they happened to find them. That is a log, and it
 * threw away both halves of what makes the bank worth keeping: who wrote what,
 * and that the writing travels between pages.
 *
 * So the found notes now come back as `id → page`, and the *bank* supplies the
 * shape (`marginHands()`). The view can then show a hand's notes in the order
 * that hand wrote them, with the gaps still visible — which is the difference
 * between a collection and a feed. Resolving ids against the bank is the
 * view's job now; this only reports what the player has read.
 *
 * The player's own notes stay separate. They are stored as rendered rather
 * than as bank ids — the book writes them fresh for each death — so they have
 * no hand to belong to and get their own section.
 */

import { useEffect, useState } from "react";
import type { Preset } from "@/lib/engine/types";
import { loadFoundMargins } from "./margins-local";
import { loadEpitaphs } from "./epitaphs-local";
import type { MarginNote } from "./marginalia";

export type MarginsCollection = {
  /** Note id → the page it turned up on. `null` for pre-v2 finds. */
  found: ReadonlyMap<string, Preset | null>;
  /** The book's notes about this player's own deaths, newest first. */
  mine: readonly MarginNote[];
  /** How many bank notes have been found — drives the dock's badge. */
  count: number;
};

const EMPTY: MarginsCollection = { found: new Map(), mine: [], count: 0 };

export function useFoundMargins(
  player: `0x${string}` | undefined,
  active: boolean,
): MarginsCollection {
  const [collection, setCollection] = useState<MarginsCollection>(EMPTY);

  useEffect(() => {
    if (!active) return;
    const found = new Map<string, Preset | null>();
    // Unknown ids (a note retired from the bank between sessions) are kept
    // here and simply never matched by the view, which renders the bank.
    for (const f of loadFoundMargins(player)) found.set(f.id, f.on);
    setCollection({
      found,
      mine: loadEpitaphs(player).reverse(),
      count: found.size,
    });
  }, [player, active]);

  return collection;
}
