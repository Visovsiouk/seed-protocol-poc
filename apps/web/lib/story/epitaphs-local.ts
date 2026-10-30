/**
 * Per-player record of the notes the book wrote about *them*.
 *
 * ── Why this is the payoff, and why it needed its own store ────────────────
 * The player spends the whole game collecting other borrowers' marginalia.
 * This is where that turns around: their own death note joins the same
 * margins, in the same hand-written voice, so every warning they ever read is
 * retroactively revealed to have been somebody's death. Until this existed the
 * epitaph rendered once on the defeat overlay and was lost, which left the
 * card's thesis — nobody has ever been stamped back in — with no visible
 * consequence anywhere in the game.
 *
 * It could not share `margins-local.ts`. That store holds note *ids* and
 * resolves them through `noteById()` against the static `NOTES` pool; an
 * epitaph is composed from the facts of one run and has no pool entry, so an
 * id alone would resolve to nothing and render a blank row. Separate key
 * rather than a `margins.v2` migration: the shapes genuinely differ, and a
 * migration would put every player's already-collected marginalia at risk to
 * no benefit.
 *
 * ── Why the prose is stored, not the facts ─────────────────────────────────
 * An earlier sketch stored `EpitaphFacts` and re-derived the text with
 * `epitaphFallback()` on read — smaller, and deterministic. It is wrong for
 * one case that matters: with `STORY_AI_ENABLED=true` the note the player read
 * came from a model and cannot be recomposed, so revisiting the Book would
 * silently show them *different* words than the ones they were shown when they
 * died. A margin note that rewrites itself between readings is exactly the
 * thing this story is about, and not in a good way. So the record is the note
 * as rendered.
 *
 * Mirrors `margins-local.ts` otherwise: lowercased address key, `typeof
 * window` guard, swallowed JSON errors, and deliberately NOT in
 * `DEPLOYMENT_SCOPED_KEYS` — a chain reset doesn't un-read what you read.
 */

import type { MarginNote } from "./marginalia";

const STORAGE_KEY = "seed-protocol-poc:epitaphs.v1";

/** address → the notes the book wrote about them, oldest death first. */
type Store = Record<string, MarginNote[]>;

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    // A hand-edited or truncated value shouldn't take the dock down.
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Store;
  } catch {
    return {};
  }
}

/** Does this look like a note we wrote, rather than arbitrary stored JSON? */
function isNote(value: unknown): value is MarginNote {
  if (!value || typeof value !== "object") return false;
  const n = value as Partial<MarginNote>;
  return typeof n.id === "string" && typeof n.text === "string";
}

/** Every epitaph this player has earned, oldest first. */
export function loadEpitaphs(player: `0x${string}` | undefined): MarginNote[] {
  if (!player) return [];
  const rows = read()[player.toLowerCase()];
  return Array.isArray(rows) ? rows.filter(isNote) : [];
}

/**
 * Record the note the book wrote about this death.
 *
 * One row per death: `note.id` is `epitaphId(facts)` — derived from the run
 * seed and depth rather than from a clock, so the same death is the same key
 * forever and a reload of the defeat screen cannot duplicate a row.
 *
 * **Re-writing an existing id replaces its prose rather than being dropped.**
 * The id is a function of the run's facts and not of the text, so the bank
 * note and a generated one share it — and first-write-wins meant the bank line
 * won every race against the model's, which is precisely the drift the
 * prose-not-facts decision above exists to prevent. The position in the list
 * is kept, because it is the order the deaths happened in, not the order they
 * were written. Callers should still only write once the note has stopped
 * changing (`useEpitaph`'s `settled`); this makes a late correction possible
 * rather than making it the plan.
 */
export function markEpitaphWritten(
  player: `0x${string}` | undefined,
  note: MarginNote,
): void {
  if (!player || typeof window === "undefined") return;
  if (!isNote(note)) return;
  try {
    const store = read();
    const key = player.toLowerCase();
    const rows = Array.isArray(store[key]) ? store[key]! : [];
    const at = rows.findIndex((n) => n.id === note.id);
    if (at >= 0) {
      // Same words already on record — don't touch storage at all.
      if (rows[at]!.text === note.text) return;
      const next = [...rows];
      next[at] = note;
      store[key] = next;
    } else {
      store[key] = [...rows, note];
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage disabled or full — worst case the note isn't kept. The player
    // still read it on the overlay, which is the part that mattered.
  }
}
