/**
 * Cold-open "Book" beats.
 *
 * The first thing a new player sees is a five-page diegetic vignette —
 * not a tutorial, not a welcome screen. They're reading a book they
 * weren't supposed to find, the ink misbehaves, the room goes
 * elsewhere, and they wake in mud. The room they wake in is the first
 * realm (fantasy), unnamed until depth 2.
 *
 * Pure data so the component (`ColdOpenBook`) stays presentational and
 * the beats can be snapshot-tested.
 */

export type ColdOpenBeat = {
  /** Small-caps eyebrow stamp at the top of the page. */
  stamp: string;
  /**
   * Body paragraphs. Each entry is a separate `<LedgerBody/>` so the
   * hanging em-dash repeats per paragraph (reads like the page was
   * written line at a time, not laid out in one block).
   */
  body: string[];
  /** Optional right-aligned attribution at the foot of the page. */
  footnote?: string;
  /** Label on the advance button at the bottom of the page. */
  cta: string;
};

export const COLD_OPEN_BOOK: readonly ColdOpenBeat[] = [
  {
    stamp: "Field record · page found",
    body: [
      "You're not supposed to be in this room. You know that the way you " +
        "know your own teeth: without thinking. The book on the table has " +
        "no title on its spine, only a small mark pressed into the leather " +
        "with someone's thumb.",
      "You open it anyway. You always do.",
    ],
    footnote: "the door is shut · the lamp is low",
    cta: "Turn the page",
  },
  {
    stamp: "Page I · the forbidden one",
    body: [
      "The page is wet. That isn't right — the rest of the book is dry, " +
        "the room is dry, your hands are dry. You touch the ink with one " +
        "finger to be sure.",
      "It moves. Not the way wet ink moves. The way water moves when " +
        "something is swimming under it.",
    ],
    cta: "Read on",
  },
  {
    stamp: "Page II · the ink answers",
    body: [
      "The letters lift off the paper and come down on the back of your " +
        "hand. They settle in, the way a name settles in. You try to wipe " +
        "them off and they only go further in.",
      "The lamp does not flicker. The room does not change. Only the " +
        "edges of the room become uncertain about where they were.",
    ],
    cta: "Keep reading",
  },
  {
    stamp: "Page III · the room goes elsewhere",
    body: [
      "The floor is not the floor anymore. It is a long descent that " +
        "remembered being a floor. You fall the way you fall in a dream — " +
        "slowly enough to notice that nothing has hold of you, and then all " +
        "at once.",
      "Wet leaves. Wet stone. Somewhere a long way off, a bell, and behind " +
        "the bell, a wet laugh that hasn't decided whether it likes you.",
    ],
    cta: "Open your eyes",
  },
  {
    stamp: "Field record · the ground",
    body: [
      "You wake in mud. The mark on your hand is still there. You don't " +
        "know where you are. You started a task you cannot finish, and the " +
        "ground beneath you has begun to count.",
    ],
    footnote: "walk forward",
    cta: "Wake",
  },
] as const;

/**
 * localStorage key recording that the player has consumed the cold-open.
 * On returning visits, the landing surfaces the continue card directly.
 * Versioned so we can re-introduce the Book if the content rewrites.
 */
export const COLD_OPEN_STORAGE_KEY = "seed-protocol:cold-open-consumed.v1";
