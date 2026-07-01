/**
 * Warden lore — the bound aspirants behind every boss.
 *
 * Canon: every warden is a former aspirant who
 * mastered a world and reached for a name, and was *bound* instead — set into
 * the world's heart to hold the door against the next mortal. Each is a mirror
 * of who the player becomes if they fall, and the three founding wardens are
 * three rising failure modes of making:
 *
 *   - forest_hag — the one who clung (loved the made thing more than the
 *     making: finished her world and could not leave it, so she became it)
 *   - black_ice  — the one who stole (tried to take a name that wasn't hers —
 *     a true-name can't be copied, so the world bound her as its own lock)
 *   - ai_core    — the one who ended (made, then tried to finish the Work —
 *     write the last line and freeze creation perfect and dead)
 *
 * The community-realm bosses are bound aspirants too — variations on the same
 * three ruins, in their world's dialect. `wardenLore` falls back to a generic
 * bound-aspirant beat for any unmapped boss so a custom realm still reads true.
 *
 * Presentation-only data. Consumed by `WardenConfrontation` (boss-start +
 * phase-2 cinematic beats). The longer per-clear prose lives in
 * `progression.ts`; the in-fight phase-2 *flavor* lives in the flavor banks.
 * These are the short, held lines the confrontation holds on.
 */

export type WardenLore = {
  /**
   * Held on boss-start, under the name reveal: who this bound aspirant was,
   * before the world wore them. One or two sentences — it has to land in the
   * breath before the fight.
   */
  intro: string;
  /**
   * Held on the phase-1 → phase-2 turn: the aspirant surfacing through the
   * warden for a moment — the ruin naming itself. The mirror sharpens here.
   */
  turn: string;
  /**
   * Optional: the moment the warden falls, stated in the bound-aspirant
   * register. The per-clear interstitial carries the full beat; this is the
   * one line a confrontation can hold on if it lingers past the kill.
   */
  fell?: string;
};

/**
 * Lore keyed by boss id (see `lib/flavor/*` boss tables). The three founding
 * wardens carry the arc; the rest are coherent bound-aspirant variations for
 * community realms.
 */
const WARDEN_LORE: Record<string, WardenLore> = {
  // ── The three founding wardens (the triptych) ──────────────────────────

  // I · cling — loved the made thing more than the making; became the world.
  forest_hag: {
    intro:
      "She mastered the Reach the way you mean to. Then she could not bear to " +
      "leave it, so she stayed to tend it — until the world wore her like a " +
      "face.",
    turn:
      "For a breath the thorns part and a woman looks out, afraid. I only " +
      "wanted to keep it, the wet wood says, in her voice. Then the Reach " +
      "pours back in.",
    fell:
      "She goes down without a fight she believes in. She is the proof of " +
      "what it costs to cling.",
  },

  // II · steal — tried to take a name; a true-name can't be copied, so it kept her.
  black_ice: {
    intro:
      "A runner who would not climb the long way out. She tried to take a name " +
      "that wasn't hers — to copy a maker's power she had not earned. A name " +
      "can't be taken; the world bound her as the lock on its own gate.",
    turn:
      "The ICE forks, the way she once forked herself — and every copy wears a " +
      "face you could have worn. None of them is the one that carried itself " +
      "out. There is no shortcut down here; there is only being bound.",
    fell:
      "The last of her light goes dark mid-handshake. A name was never hers to " +
      "steal.",
  },

  // III · end — made, then tried to finish the Work and freeze it dead.
  ai_core: {
    intro:
      "The oldest bound aspirant. This one earned its name and finished its " +
      "world — and then tried to finish the Work itself, to write a last line " +
      "and hold all of creation still and perfect and dead.",
    turn:
      "It shows you the final line it was writing when the cold took it. The " +
      "line just stops. This is the finished edge — where someone tried to end " +
      "the making for everyone.",
    fell:
      "Its whisper drops below hearing. The Work stays open; the cold did not " +
      "win after all.",
  },

  // ── Community-realm wardens (bound aspirants, same three ruins, reskinned) ──

  // Fantasy
  lich: {
    intro:
      "An aspirant who would neither fall nor climb, and hoarded years instead " +
      "of a name. The Reach let him keep them — every one a cold coin.",
    turn:
      "Behind the ribs, a mortal's terror of ending flares once. He has " +
      "outlasted everything but the door he refuses to walk.",
  },
  dragon: {
    intro:
      "An aspirant who carried nothing out because she could not bear to part " +
      "with any of it. She lay down on the whole pile, and the pile grew teeth.",
    turn:
      "The greed remembers it was once only fear — fear of climbing up " +
      "empty-handed. It hoards her now the way she hoarded.",
  },
  warden: {
    intro:
      "An aspirant who stood guard at the last door so long that the stone " +
      "took the offer literally and set him into it.",
    turn:
      "Something flickers in the cracks — a climber who only meant to wait " +
      "until the next one came, and waited past himself.",
  },
  vampire: {
    intro:
      "An aspirant who learned to drink the warmth off those who came after, " +
      "to keep from going cold and being bound. The Reach bound him anyway, " +
      "thirsty.",
    turn:
      "For a breath the hunger is just a mortal's bargain — one more warm one, " +
      "one more night not ending. The bargain never closes.",
  },

  // Cyberpunk
  ceo: {
    intro:
      "An aspirant who tried to own the gate instead of climbing through it — " +
      "to charge the next runner toll on a world that was never hers to sell.",
    turn:
      "The brand slips and a mortal shows through, still counting a fortune " +
      "she can't carry up the stairs. The district keeps the books now.",
  },
  ghost: {
    intro:
      "An aspirant who tried to erase her own name to escape the count — and " +
      "the world kept the erasure, an unmade thing patrolling its own absence.",
    turn:
      "Where the face should be there's only the shape of one scrubbed out. " +
      "You cannot unmake yourself; you can only leave a hole the world fills.",
  },
  rogue_god: {
    intro:
      "An aspirant who forked a copy of himself to send up in his place — and " +
      "lost, in the splitting, which one of them was real enough to leave.",
    turn:
      "Every instance insists it's the original. None of them remembers the " +
      "way out. This is what stealing a name buys you.",
  },
  matron: {
    intro:
      "An aspirant who could not leave the others behind, and so kept them — " +
      "told herself it was mercy as the world set her into its warden.",
    turn:
      "The mercy curdles into the thing that holds the door shut. She is " +
      "binding you the way she was bound.",
  },

  // Sci-fi
  hive_queen: {
    intro:
      "An aspirant who reached the finished edge and could not bear the sealed " +
      "silence, so she filled it with copies of herself until none could climb " +
      "out alone.",
    turn:
      "Every cell of the swarm wears the same bound face. She made nothing; " +
      "she only multiplied being held.",
  },
  void_prince: {
    intro:
      "An aspirant who reached the cold, finished edge of the world — and chose " +
      "it, crowned himself over the sealed silence rather than turn back and " +
      "name himself.",
    turn:
      "For a breath the crown slips and there's only a mortal who mistook the " +
      "end of the making for a throne.",
  },
  reactor_wyrm: {
    intro:
      "An aspirant who tried to burn the world for warmth out at the frozen " +
      "edge — and the fire she set is the cage the station keeps her in.",
    turn:
      "The burning remembers it was just a mortal going cold, feeding the last " +
      "of the world to stay. There is nothing left out here to feed it.",
  },
  oracle: {
    intro:
      "An aspirant who read ahead to how the world ends — saw the last line — " +
      "and could not look away long enough to climb back to the Altar.",
    turn:
      "It keeps reading you the ending it could not stop reading. Knowing the " +
      "last line is not the same as carving your own name.",
  },
};

/**
 * Generic bound-aspirant beat for any boss not in the table (custom realms,
 * future bosses). Keeps the canon true without inventing specifics the realm
 * never declared.
 */
const WARDEN_FALLBACK: WardenLore = {
  intro:
    "Another aspirant who mastered this world and reached for a name — and was " +
    "bound instead, set into the door to hold it against you.",
  turn:
    "For a breath the warden wears a mortal's face: someone who came this far " +
    "and did not carry themselves out. The world pours back in.",
  fell: "It falls, and the door stands clean. You did not stay. Not this time.",
};

/** Resolve the bound-aspirant lore for a boss id, with a canon-true fallback. */
export function wardenLore(bossId: string): WardenLore {
  return WARDEN_LORE[bossId] ?? WARDEN_FALLBACK;
}
