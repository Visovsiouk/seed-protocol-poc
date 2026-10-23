"use client";

/**
 * A margin note, found between rooms.
 *
 * Sits in the focal slot above the carried findings — the moment a room
 * clears and the player is catching their breath is the one point in a run
 * where they'll actually read twenty words. Before the fight they're sizing
 * up a monster; during it they're watching numbers.
 *
 * Deliberately NOT in the combat log: that pane is `h-[4.5rem]` with a
 * three-line window, so a note would be clipped — and the log is the Book's
 * voice. Mixing a borrower's handwriting into it would undo the one thing
 * the voice split is for.
 *
 * `shrink-0` is load-bearing. The focal slot is a fixed 22rem so the action
 * buttons below never move (the zero-jump guarantee in `EncounterFrame`);
 * this takes its natural height and the findings tray flexes into what's
 * left, rather than this growing and pushing the tray out of the box.
 */

import { Panel, Stamp } from "@/components/ui";
import { MarginLine, MarginSignature } from "@/components/story/voices";
import { noteSignature } from "@/lib/story/marginalia";
import type { MarginFind as MarginFindNote } from "@/lib/story/marginalia";

export function MarginFind({
  note,
  className,
}: {
  note: MarginFindNote;
  className?: string;
}) {
  return (
    <Panel
      as="aside"
      tone="parchment"
      aria-label="A note in the margin"
      className={`flex flex-col gap-1.5 p-3 ${className ?? ""}`}
    >
      <Stamp tone="muted">In the margin</Stamp>
      <MarginLine size="sm">{note.text}</MarginLine>
      <MarginSignature>
        {noteSignature(note)} · {note.date}
      </MarginSignature>
    </Panel>
  );
}
