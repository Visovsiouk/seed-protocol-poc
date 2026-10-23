/**
 * Marginalia — what the borrowers before you wrote in the gutters.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * The old story put its narrative in a wall of prose before the game and in
 * long interstitials after it, and nobody read either. This moves the story
 * *into* the run as a reward: a short, dated, signed note found in a room.
 * Twenty words instead of a hundred and sixty, delivered when the player has
 * just survived something and is receptive, and collectible — the Book fills
 * up, which is a reason to keep descending that the prose never gave anyone.
 *
 * Found out of order and contradicting each other, which is the point. A
 * linear explanation of the Colophon would be exposition; six borrowers over
 * two centuries half-guessing at him is a mystery. Marrow thinks he's a
 * person. Salk thinks he's a system. Raine has a file number for him. They're
 * all partly right.
 *
 * ── Why the pool is global and not per-page ────────────────────────────────
 * "The book carries their writing between pages" is the story's answer to how
 * three eras connect, and this is where that becomes mechanical rather than
 * asserted: a note signed by Marrow in 1911 can surface on the Drift Station
 * in 2041, and the find is labelled with the page it turned up on. The reader
 * watches writing cross.
 *
 * ── Determinism ────────────────────────────────────────────────────────────
 * Which note surfaces is drawn from the run seed, so the same descent always
 * yields the same notes — the book shows you what it decides to show you, and
 * that decision is the seed.
 *
 * The draw is domain-separated from the engine's own RNG rather than reusing
 * `subSeed`: this module must never perturb a loot or combat roll. It imports
 * `createRng` (a pure constructor) and viem, and deliberately NOT
 * `lib/engine/index` — asserted in `marginalia.test.ts`. The engine holds no
 * shared mutable RNG state (`rngFor` builds a fresh one per step), so an
 * independent generator here provably cannot shift a die.
 *
 * Pure: no hooks, no `window`, no chain reads.
 */

import { encodePacked, keccak256 } from "viem";
import { createRng } from "@/lib/engine/rng";
import type { Preset } from "@/lib/engine/types";
import { borrower, type BorrowerId } from "./canon";

export type MarginNote = {
  /** Stable id — the localStorage key and the React key. */
  id: string;
  /** The note. One to three sentences; the voice does the rest. */
  text: string;
  /** As it reads on the page, in that borrower's convention. */
  date: string;
  /**
   * Which named borrower wrote it. Omitted for notes with no canon author —
   * most importantly the player's own epitaph, which is written *by them*
   * and must not be attributed to somebody else just to satisfy a lookup.
   */
  by?: BorrowerId;
  /**
   * Attribution override, for notes with no canon author. Takes precedence
   * over `by`; resolve both through `noteSignature()` rather than reading
   * either field directly.
   */
  signature?: string;
};

/** How a note signs itself, whoever wrote it. */
export function noteSignature(note: MarginNote): string {
  if (note.signature) return note.signature;
  return note.by ? borrower(note.by).signature : "unsigned";
}

/** A note as found, tagged with where it turned up. */
export type MarginFind = MarginNote & { foundOn: Preset };

/**
 * How often a cleared room yields a note.
 *
 * Tuned so a three-room starter descent usually turns up one and sometimes
 * two: frequent enough to feel like a reason to look, rare enough that it
 * stays a find. Not a drop the player can farm — there's no mechanical
 * benefit, only story.
 */
const DISCOVERY_P = 0.55;

/**
 * The bank.
 *
 * Ordering is meaningless — the draw is uniform. Grouped by writer only so a
 * voice stays consistent while it's being edited. Each note has to survive
 * being read *first*, with no context, because any of them can be.
 */
const NOTES: readonly MarginNote[] = [
  // ── Edith Marrow, 1911 ───────────────────────────────────────────────────
  // Devout, stubborn, practical. Got further than anyone. Writes like someone
  // keeping a field journal she expects to be read by a stranger.
  {
    id: "m-01",
    by: "marrow",
    date: "4 March 1911",
    text: "Third descent. The wet one lets you in easily, which I no longer take as kindness.",
  },
  {
    id: "m-02",
    by: "marrow",
    date: "11 March 1911",
    text: "Found a woman's name cut into a root, down deep. Alder. The root had grown round it, the way skin grows round a splinter.",
  },
  {
    id: "m-03",
    by: "marrow",
    date: "19 March 1911",
    text: "She is not dead. That is the part I cannot write home about. She is holding the page.",
  },
  {
    id: "m-04",
    by: "marrow",
    date: "2 April 1911",
    text: "Whoever tore the return column did it from the front of the card. You can see where the thumb went.",
  },
  {
    id: "m-05",
    by: "marrow",
    date: "8 April 1911",
    text: "I have started writing in the book itself. If it will not let me out, let it at least carry the warning.",
  },
  {
    id: "m-06",
    by: "marrow",
    date: "15 April 1911",
    text: "A sentence I wrote last week now reads differently. I am certain of the original. I have no way to prove it.",
  },
  {
    id: "m-07",
    by: "marrow",
    date: "30 April 1911",
    text: "He is not a devil. A devil would want something from me. He only wants the book to stop.",
  },
  {
    id: "m-08",
    by: "marrow",
    date: "7 May 1911",
    text: "Rule: do not take what you have not earned. Alder earned hers and stayed anyway, so the rule is not sufficient.",
  },
  {
    id: "m-09",
    by: "marrow",
    date: "22 May 1911",
    text: "Three stamps. The book owes me a signet and I find I am afraid of being owed anything by it.",
  },
  {
    id: "m-10",
    by: "marrow",
    date: "undated",
    text: "If you are reading this and you have not signed yet: close it. I know you already have. So did I.",
  },
  {
    // Diegetic cover for the Reach's fire weakness and the forced fire first
    // weapon in `starter-realms.ts` — the one mechanic in the starter that
    // reads as arbitrary unless somebody says this out loud.
    id: "m-11",
    by: "marrow",
    date: "26 March 1911",
    text: "Bring fire to the wet one. Everything down there is still growing, and growing things have never once liked being burned.",
  },

  // ── Teo Salk, 1987 ──────────────────────────────────────────────────────
  // Slangy, paranoid, funny, wrong about things. Finds Kord already in the
  // ICE and draws the wrong conclusion. Writes fast, in fragments.
  {
    id: "s-01",
    by: "salk",
    date: "03.14.87",
    text: "ok so the district is a PAGE. it's printed. i can see the dot pattern if i stand too close to a wall.",
  },
  {
    id: "s-02",
    by: "salk",
    date: "03.21.87",
    text: "there's a woman in the ICE. not behind it — in it. she's the lock AND the thing the lock is for.",
  },
  {
    id: "s-03",
    by: "salk",
    date: "04.02.87",
    text: "her name's Kord. she tried to COPY a signet. you can't copy a signet. i have now tried twice to confirm this.",
  },
  {
    id: "s-04",
    by: "salk",
    date: "04.09.87",
    text: "theory: the Colophon isn't a guy, it's a process. a cleanup routine. you don't get hunted, you get MAINTAINED.",
  },
  {
    id: "s-05",
    by: "salk",
    date: "04.30.87",
    text: "found handwriting from 1911 on a wall that was poured last year. so that's a thing that happens here.",
  },
  {
    id: "s-06",
    by: "salk",
    date: "05.12.87",
    text: "whoever E. Marrow is/was: your rule is good. your handwriting is insufferable. thank you for the rule.",
  },
  {
    id: "s-07",
    by: "salk",
    date: "05.28.87",
    text: "update on the process theory: a process doesn't countersign. i watched it countersign.",
  },
  {
    id: "s-08",
    by: "salk",
    date: "06.04.87",
    text: "he doesn't delete you. that's the thing nobody warns you about. he FILES you. you get a slot.",
  },
  {
    id: "s-09",
    by: "salk",
    date: "06.19.87",
    text: "the neon's still wet in the east blocks. means he hasn't finished here. means he's coming back.",
  },
  {
    id: "s-10",
    by: "salk",
    date: "07.01.87",
    text: "if you're new: the gear comes with you between pages. same object, different language. don't panic when your sword is a gun.",
  },
  {
    id: "s-11",
    by: "salk",
    date: "07.15.87",
    text: "Quire buys anything and asks nothing. that's not generosity, that's someone who's been here long enough to stop being curious.",
  },

  // ── Auditor V. Raine, 2041 ──────────────────────────────────────────────
  // Clinical, half-redacted, filing reports to a department that no longer
  // exists. The only one who has read both of the others.
  {
    id: "r-01",
    by: "raine",
    date: "2041-02-06",
    text: "Site survey, Ker-7. Structure is intact, sealed, and at temperature. No decay. Nothing here is decaying, which is the finding.",
  },
  {
    id: "r-02",
    by: "raine",
    date: "2041-02-14",
    text: "Station is named for its author. He signed his own work and then kept going. There were six before this one.",
  },
  {
    id: "r-03",
    by: "raine",
    date: "2041-02-27",
    text: "Ker earned a signet and used it correctly. Then he reached for the colophon. Filed, in the page he wrote.",
  },
  {
    id: "r-04",
    by: "raine",
    date: "2041-03-08",
    text: "Cross-reference: E. Marrow, 1911. T. Salk, 1987. Both legible. Neither should be. Concluding that the binding is the carrier.",
  },
  {
    id: "r-05",
    by: "raine",
    date: "2041-03-19",
    text: "Salk was wrong about the process and right about the filing. I would tell him. The gutter does not work in that direction.",
  },
  {
    id: "r-06",
    by: "raine",
    date: "2041-04-01",
    text: "Marrow: your rule is insufficient but it is the only one anybody has written down. I am adopting it.",
  },
  {
    id: "r-07",
    by: "raine",
    date: "2041-04-15",
    text: "He revises from the back forward. Ker-7 is done. The district is in progress. The wet one has not been reached.",
  },
  {
    id: "r-08",
    by: "raine",
    date: "2041-05-02",
    text: "Which means the order you walk is the order he finished. You are walking toward his completed work.",
  },
  {
    id: "r-09",
    by: "raine",
    date: "2041-05-20",
    text: "Request for guidance submitted. No department remains to receive it. Proceeding on my own authority, which is also no longer extant.",
  },
  {
    id: "r-10",
    by: "raine",
    date: "2041-06-11",
    text: "A finished book can be signed. An unfinished one cannot. I do not think anyone has tried the obvious thing.",
  },

  // ── Quire ───────────────────────────────────────────────────────────────
  // Didn't escape, didn't get bound. Deals. Terse, transactional, unbothered —
  // and the only one who isn't frightened, which is its own kind of warning.
  {
    id: "q-01",
    by: "quire",
    date: "no date given",
    text: "I don't go down and I don't go out. There is a third thing and you are standing in it.",
  },
  {
    id: "q-02",
    by: "quire",
    date: "no date given",
    text: "Everything you carry is already written down. That is why I can buy it. That is why you can't lie to me about it.",
  },
  {
    id: "q-03",
    by: "quire",
    date: "no date given",
    text: "Four of you have sold me the same blade. It was the same blade each time. None of you were.",
  },
  {
    id: "q-04",
    by: "quire",
    date: "no date given",
    text: "He has never once come for me. I have thought about what that says. I have stopped thinking about it.",
  },

  // ── Unsigned ────────────────────────────────────────────────────────────
  // Borrowers the card doesn't name. One of these is in the player's own
  // hand, which they have no way to know on a first read.
  {
    id: "u-01",
    by: "marrow",
    date: "signature scratched out",
    text: "Do not finish it. Whatever else you do down here. Do not help him finish it.",
  },
  {
    id: "u-02",
    by: "salk",
    date: "signature scratched out",
    text: "The stamps aren't the way out. The stamps are so the book has to admit you exist. Different thing. Better thing.",
  },
  {
    id: "u-03",
    by: "raine",
    date: "signature scratched out",
    text: "You will get the chance to sign out. Everyone does. That is the trap, and it is the last one.",
  },
];

/** Every note in the bank. Exposed for tests and for the Book's empty state. */
export const MARGIN_NOTES = NOTES;

export function noteById(id: string): MarginNote | undefined {
  return NOTES.find((n) => n.id === id);
}

/**
 * The note waiting in this room, or `null`.
 *
 * Deterministic in `(runSeed, depth)`. The domain separator (`"margin"`) means
 * a future change to how the engine salts its own sub-seeds can never collide
 * with this draw — the two derivations are independent by construction, not
 * by luck.
 */
export function marginAt(args: {
  runSeed: `0x${string}`;
  depth: number;
  preset: Preset;
}): MarginFind | null {
  const { runSeed, depth, preset } = args;

  const seed = keccak256(
    encodePacked(["bytes32", "string", "uint16"], [runSeed, "margin", depth]),
  );
  const rng = createRng(seed);

  if (!rng.chance(DISCOVERY_P)) return null;

  const note = rng.pick(NOTES);
  return { ...note, foundOn: preset };
}
