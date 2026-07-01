/**
 * Cold-open beats — "The Branding at the Threshold".
 *
 * The first thing a new player sees is a five-page diegetic vignette —
 * not a tutorial, not a welcome screen. They arrive at the foot of the
 * worlds, read the makers'-roll of everyone who came before, take an
 * unfinished maker's-mark branded into their hand, learn the stake, and
 * go down through the first open door — waking in the base. Only the
 * nearest world is open; the rest stay sealed and unnamed until the ones
 * before them are mastered.
 *
 * Each beat grounds one plain fact under the atmosphere, so that by the
 * end a newcomer plainly knows who they are, what they must do, what a
 * fall costs, and what they are climbing toward.
 *
 * Pure data so the component (`ColdOpenBook`) stays presentational and
 * the beats can be snapshot-tested.
 */

import type { CinematicBeat } from "./types";

/**
 * A cold-open page is just a `CinematicBeat` — the cinematic player reads the
 * optional `wash`/`timing` annotations below to give the five pages a felt,
 * timed reveal instead of a static click-through.
 */
export type ColdOpenBeat = CinematicBeat;

export const COLD_OPEN_BOOK: readonly ColdOpenBeat[] = [
  {
    stamp: "The foot of the worlds",
    body: [
      "You have climbed down as far as climbing goes. This is the bottom " +
        "of everything — a stone floor under a sky that is really the " +
        "undersides of worlds, hung open above you like doors left ajar.",
      "Creation was never finished. The first makers began these worlds and " +
        "gave out before the work was done — died, wandered off, faltered — " +
        "and their half-made worlds still turn overhead, waiting for a hand. " +
        "Mortals come here to try for that: a maker's power. Almost none " +
        "climb back up.",
    ],
    footnote: "the worlds hang open · the floor is cold",
    cta: "Go on",
    timing: { lineStagger: true },
  },
  {
    stamp: "The roll of makers",
    body: [
      "A slab of standing stone bars the first door, and it is covered edge " +
        "to edge in names — carved, branded, scratched by everyone who ever " +
        "stood where you stand. Most of them stop halfway. A name begun, a " +
        "stroke that trails off and never finishes.",
      "The topmost mark is the oldest and the only one cut clean through: " +
        "the First Maker, the first mortal who climbed down here and climbed " +
        "back out a god. Below it, name under unfinished name, the failures " +
        "run down into the dark. At the very bottom there is one empty place " +
        "left. It is exactly the size of a hand.",
    ],
    cta: "Set your hand to it",
    timing: { lineStagger: true, hold: { line: 1 } },
  },
  {
    stamp: "The branding",
    body: [
      "Something takes your hand where you touch the stone, and it burns — " +
        "not clean, not finished. A maker's-mark, but a maker's-mark left " +
        "half-cut, the fire still in it. It settles into the back of your " +
        "hand and stays warm, because it is not done. Neither are you.",
      "This is the bargain, and it is plain: master three of the worlds " +
        "above and carry yourself back out, and the mark finishes — into a " +
        "true-name, a maker's power that is yours to keep. Fall, and the " +
        "world you fall in finishes it for you, the only other way a mark " +
        "like this ever gets finished: by binding you into itself.",
    ],
    cta: "Understand the stake",
    wash: "warm",
    timing: { lineStagger: true, hold: { line: 1 } },
  },
  {
    stamp: "What waits below",
    body: [
      "Each world above you is already ruled. Someone came this far before " +
        "you, went down, and faltered — clung, or reached for what they " +
        "hadn't earned, or tried to finish what should have stayed open — " +
        "and the world bound them into its heart as its guardian-god. They " +
        "are what you will have to master. They were mortals once, marked " +
        "like you.",
      "The shape of it is simple. Descend a world. Master it — put down the " +
        "one bound at its heart — and carry a spark of it back out instead " +
        "of being swallowed. Three worlds, three sparks. Three sparks kindle " +
        "your Name.",
    ],
    cta: "Face the door",
    wash: "void",
    timing: { lineStagger: true, fadeOutToBlack: true },
  },
  {
    stamp: "The first door",
    body: [
      "Only the nearest door will open — the others stay sealed and unnamed " +
        "until the ones before them fall. Beyond it: wet leaves, wet stone, " +
        "a world still growing because it is the least finished of the " +
        "three, and somewhere down in the green, a wet laugh that has been " +
        "waiting a long time for someone to come down.",
      "The mark on your hand throbs once, warm, and starts to count. You " +
        "step back from the stone. This is the base — the last dry ground " +
        "before the worlds. From here, there is only down.",
    ],
    footnote: "you are at the foot of the worlds",
    cta: "Wake",
    timing: { lineStagger: true },
  },
] as const;

/**
 * localStorage key recording that the player has consumed the cold-open.
 * On returning visits, the landing surfaces the continue card directly.
 * Versioned so we can re-introduce the opening if the content rewrites —
 * bumped to `.v3` for the full "Branding at the Threshold" rewrite.
 */
export const COLD_OPEN_STORAGE_KEY = "seed-protocol:cold-open-consumed.v3";
