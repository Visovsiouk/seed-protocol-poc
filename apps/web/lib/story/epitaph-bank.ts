/**
 * The note the book writes about *you*, when you fall.
 *
 * ── Why this is the payoff ─────────────────────────────────────────────────
 * The player has been collecting other borrowers' marginalia for the whole
 * game — warnings, guesses, bitter little asides. This is where that
 * retroactively means something: your own note joins theirs, in the same
 * hand-written voice, in the same margins. Every warning they read was
 * somebody's death, and now one of them is theirs.
 *
 * It is also the only place in the story where "nobody has ever been stamped
 * back in" stops being a line on a card and becomes a line about the player.
 *
 * ── Why it's a bank and not a template ─────────────────────────────────────
 * Deterministic in the run's own facts, so the same death always writes the
 * same note. Phase 3 can put a model in front of this for a sentence that
 * knows *which* monster on *which* turn — but this bank is the shipped
 * experience with the flag off, and both the server and the client fall back
 * to it, so the path stays exercised on every machine without a key.
 *
 * Pure. No RNG beyond the run seed, no `window`, no chain reads.
 */

import { encodePacked, keccak256 } from "viem";
import { createRng } from "@/lib/engine/rng";
import type { Preset } from "@/lib/engine/types";
import type { MarginNote } from "./marginalia";
import { PAGES } from "./canon";

export type EpitaphFacts = {
  runSeed: `0x${string}`;
  preset: Preset;
  /** Depth the run ended at. */
  depth: number;
  /** Display name of whatever killed them. */
  killedBy: string;
  /** Whether that was the page's bookmark rather than a lesser thing. */
  wasBookmark: boolean;
  /** Turn of the final fight (the engine resets this per room). */
  turns: number;
  /** How many unminted findings went into the dark with them. */
  carried: number;
};

/**
 * A stable id for this death, so the client can store it once and the server
 * can cache against it. Derived from the facts rather than from a clock —
 * two reloads of the same defeat must not mint two notes.
 */
export function epitaphId(facts: EpitaphFacts): string {
  const h = keccak256(
    encodePacked(
      ["bytes32", "string", "uint16"],
      [facts.runSeed, "epitaph", facts.depth],
    ),
  );
  return `e-${h.slice(2, 14)}`;
}

/**
 * Openers, drawn deterministically so a death reads differently to the last.
 *
 * `{page}` interpolates a canon page name, and two of the three already begin
 * with a definite article ("The Hollow Reach"), so these templates must never
 * put one in front of it.
 */
const OPENERS = [
  "Got as far as the {depth} room of {page}.",
  "Stopped on the {depth} room of {page}.",
  "{page}, {depth} room.",
  "Record for {page}: stopped at the {depth} room.",
];

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth"];

function ordinal(n: number): string {
  return ORDINALS[n - 1] ?? `${n}th`;
}

/**
 * Compose the borrower's own margin note.
 *
 * Written in the second person and addressed to whoever reads it next, which
 * is the convention every other note in the bank follows — the player has
 * been reading exactly this shape for the whole run, so theirs slots in
 * without announcing itself as special.
 */
export function epitaphFallback(facts: EpitaphFacts): MarginNote {
  const rng = createRng(
    keccak256(
      encodePacked(
        ["bytes32", "string", "uint16"],
        [facts.runSeed, "epitaph-voice", facts.depth],
      ),
    ),
  );

  const page = PAGES[facts.preset].name;
  const opener = rng
    .pick(OPENERS)
    .replace("{depth}", ordinal(facts.depth))
    .replace("{page}", page);

  // No trailing punctuation on either clause — the sentence is closed once,
  // below, so a bookmark death can't end up with a doubled full stop.
  const cause = facts.wasBookmark
    ? `The bookmark had me — ${facts.killedBy}`
    : `${facts.killedBy} had me`;

  const timing =
    facts.turns <= 0
      ? ""
      : facts.turns <= 2
        ? ", inside two turns"
        : `, on turn ${facts.turns}`;

  const loss =
    facts.carried > 0
      ? `Everything I was carrying — ${facts.carried} — went into the dark with me.`
      : "I was carrying nothing, which is the only part I got right.";

  const close = facts.wasBookmark
    ? "Bring fire, or bring somebody."
    : "Don't take my word for the route. Take the warning.";

  return {
    id: epitaphId(facts),
    // No `by`: this one is the player's. Attributing it to a named
    // borrower to satisfy a lookup would quietly undo the whole beat.
    signature: "your own hand",
    date: "stamped out, never back in",
    text: [opener, `${cause}${timing}.`, loss, close].join(" "),
  };
}
