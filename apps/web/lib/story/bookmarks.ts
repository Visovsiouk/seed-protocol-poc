/**
 * Bookmarks — the borrowers the Colophon filed.
 *
 * Canon: a bookmark holds a page so it can be found again. He doesn't kill
 * borrowers, he *files* them — binds one into a page's heart so he can come
 * back and keep revising it. Every boss is one of these. Tearing a bookmark
 * out is why clearing a page matters: the page stops being findable.
 *
 * ── What changed, and why ──────────────────────────────────────────────────
 * This replaces `wardens.ts`, which was unreachable — `wardenLore()` was
 * imported by nothing, and its own docblock pointed at a component that no
 * longer existed. So its prose had never been on screen. Rather than migrate
 * dead text, this is rewritten against the canon and actually rendered: the
 * `intro` is held under the boss's name in `EncounterStage`, which is the one
 * moment a player is looking straight at the thing and waiting.
 *
 * The three founding bookmarks are also no longer three unrelated moral
 * lessons. They are three people, with names and dates on the same card the
 * player is carrying, filed by the same hand:
 *
 *   - Hesper Alder (1847) — stayed. Mastered a page and could not leave it.
 *   - Vesna Kord (1981)  — copied. Tried to duplicate a signet instead of
 *     earning one, and the page kept her as its own lock.
 *   - Aurelio Ker (1908) — finished. Earned a signet, wrote a page, signed
 *     it with his own name, then reached for the colophon. His rival filed
 *     him into the page he'd written.
 *
 * Community-realm bosses are bookmarks too — other borrowers, same three
 * ruins in their page's dialect. `bookmarkLore` falls back to an unnamed
 * bookmark for anything unmapped, so a player-authored realm still reads
 * true without inventing specifics the realm never declared.
 *
 * Presentation-only data.
 */

import { type Borrower, bookmarkFor } from "./canon";

export type BookmarkLore = {
  /**
   * Who this was, before the page wore them. Held under the name reveal —
   * one or two sentences, because it has to land in the breath before the
   * fight starts.
   */
  intro: string;
  /**
   * The phase-1 → phase-2 turn: the borrower surfacing through the bookmark
   * for a moment. This is where the mirror sharpens — it is the player, if
   * the player stops.
   */
  turn: string;
  /** The moment it falls, if a surface lingers past the kill. */
  fell?: string;
  /** Set for the three the card names. Community bosses have none. */
  borrower?: Borrower;
};

const LORE: Record<string, Omit<BookmarkLore, "borrower">> = {
  // ── The three the card names ────────────────────────────────────────────

  // Stayed. Loved the made thing more than the making.
  forest_hag: {
    intro:
      "She mastered the Reach the way you mean to, and then could not bear to " +
      "leave it. She stayed to tend it. It has been wearing her for a while now.",
    turn:
      "The thorns part and a woman looks out, afraid. I only wanted to keep it, " +
      "the wet wood says, in her voice. Then the Reach pours back in.",
    fell: "She goes down without a fight she believes in.",
  },

  // Copied. A signet is not a thing that can be duplicated.
  black_ice: {
    intro:
      "A runner who would not climb the long way out. She tried to copy a " +
      "signet she had not earned — so the district kept her as the lock on " +
      "its own gate.",
    turn:
      "The ICE forks the way she once forked herself, and every copy wears a " +
      "face you could have worn. Not one of them is the one that got out.",
    fell: "The last of her goes dark mid-handshake.",
  },

  // Finished. Wrote a page, signed it, and reached for the last one.
  ai_core: {
    intro:
      "He earned a signet and used it correctly: he wrote this page and put " +
      "his name on it. Then he reached for the colophon, and something older " +
      "filed him into his own work.",
    turn:
      "It shows you the last line he was writing when the cold took it. The " +
      "line just stops. There were six stations before this one.",
    fell: "The hum drops below hearing. The book is still unfinished.",
  },

  // ── Community-realm bookmarks ───────────────────────────────────────────
  // Other borrowers, the same three ruins in their page's dialect.

  // Fantasy
  lich: {
    intro:
      "A borrower who would neither fall nor leave, and hoarded years instead " +
      "of earning a signet. The page let him keep every one.",
    turn:
      "Behind the ribs, a mortal's terror of ending flares once. He has " +
      "outlasted everything except the door he refuses to walk through.",
  },
  dragon: {
    intro:
      "A borrower who carried nothing out because she could not bear to part " +
      "with any of it. She lay down on the whole pile, and the pile grew teeth.",
    turn:
      "The greed remembers it was once only fear — of going back up with empty " +
      "hands. It hoards her now the way she hoarded.",
  },
  warden: {
    intro:
      "A borrower who stood guard at the last door so long that the stone took " +
      "the offer literally.",
    turn:
      "Something flickers in the cracks: someone who only meant to wait until " +
      "the next one came, and waited past himself.",
  },
  vampire: {
    intro:
      "A borrower who learned to drink the warmth off those who came after, to " +
      "keep from going cold and being filed. He was filed anyway, thirsty.",
    turn:
      "For a breath the hunger is just a bargain — one more warm one, one more " +
      "night not ending. The bargain never closes.",
  },

  // Cyberpunk
  ceo: {
    intro:
      "A borrower who tried to own the gate instead of walking through it, and " +
      "to charge the next one toll on a page that was never hers to sell.",
    turn:
      "The brand slips and a mortal shows through, still counting a fortune she " +
      "cannot carry up the stairs. The district keeps the books now.",
  },
  ghost: {
    intro:
      "A borrower who tried to scratch her own name off the card to escape the " +
      "count. The page kept the erasure and let the rest go.",
    turn:
      "Where the face should be there is only the shape of one scrubbed out. " +
      "You cannot unmake yourself; you can only leave a hole.",
  },
  rogue_god: {
    intro:
      "A borrower who forked a copy of himself to send up in his place, and " +
      "lost track, in the splitting, of which one was real enough to leave.",
    turn:
      "Every instance insists it is the original. None of them remembers the " +
      "way out. This is what copying buys.",
  },
  matron: {
    intro:
      "A borrower who could not leave the others behind, and so kept them. She " +
      "told herself it was mercy while the page set her into its lock.",
    turn:
      "The mercy curdles into the thing holding the door shut. She is filing " +
      "you the way she was filed.",
  },

  // Sci-fi
  hive_queen: {
    intro:
      "A borrower who reached the sealed silence and could not bear it, so she " +
      "filled it with copies of herself until none could leave alone.",
    turn:
      "Every cell of the swarm wears the same filed face. She wrote nothing; " +
      "she only multiplied being held.",
  },
  void_prince: {
    intro:
      "A borrower who reached the cold edge of a finished page and chose it — " +
      "crowned himself over the silence rather than turn back and sign.",
    turn:
      "For a breath the crown slips, and there is only someone who mistook the " +
      "end of the making for a throne.",
  },
  reactor_wyrm: {
    intro:
      "A borrower who tried to burn a finished page for warmth. The fire she " +
      "set is the cage the station keeps her in.",
    turn:
      "The burning remembers it was just someone going cold, feeding the last " +
      "of a world to stay in it. There is nothing left out here to feed it.",
  },
  oracle: {
    intro:
      "A borrower who read ahead to the last line — and could not look away " +
      "long enough to carry herself back out.",
    turn:
      "It keeps reading you the ending it could not stop reading. Knowing the " +
      "last line is not the same as writing your own.",
  },
};

/**
 * Unmapped bosses — player-authored realms, future additions. Stays true to
 * the canon without inventing details the realm never declared.
 */
const FALLBACK: Omit<BookmarkLore, "borrower"> = {
  intro:
    "Another borrower who got this far and was filed here, set into the page " +
    "to hold it open against you.",
  turn:
    "For a breath the thing wears a mortal's face: someone who came this far " +
    "and did not carry themselves out. Then the page pours back in.",
  fell: "It falls, and the page stops being findable. You did not stay.",
};

/** Resolve a boss id to its bookmark, with a canon-true fallback. */
export function bookmarkLore(bossId: string): BookmarkLore {
  const lore = LORE[bossId] ?? FALLBACK;
  // The three the card names carry their borrower through, so a surface can
  // show "Hesper Alder · filed 1847" beside the boss's own name.
  const borrower = bookmarkFor(bossId);
  return borrower ? { ...lore, borrower } : { ...lore };
}
