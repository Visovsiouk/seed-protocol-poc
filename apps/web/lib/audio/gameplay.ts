/**
 * Gameplay → sound mapping.
 *
 * Kept separate from both the audio engine and the components so the
 * mapping is a pure, readable table rather than a scatter of `play()`
 * calls across the combat UI. These functions take engine data (never
 * narration prose — see `CombatBeat`) and name a voice.
 */

import type { CombatBeat, EngineEvent } from "@/lib/engine/types";
import type { SfxId } from "./manifest";

/**
 * Gap between the sounds of two swings resolved in the same step.
 *
 * Deliberately above `SFX_MIN_INTERVAL_MS` (40ms): a multi-hit weapon
 * resolves several beats at once, and without the stagger the throttle
 * would collapse them into a single impact. Spacing them lets the player
 * *hear* that the weapon struck twice.
 */
export const BEAT_STAGGER_MS = 70;

/**
 * The voice for one swing.
 *
 * Player and monster hits use different voices (`hit` vs `hurt`) so the
 * direction of damage is audible without looking — the thing a combat
 * log makes you read.
 */
export function sfxForBeat(beat: CombatBeat): SfxId {
  if (beat.actor === "player") {
    if (!beat.hit) return "miss";
    return beat.crit ? "crit" : "hit";
  }
  if (beat.dodged) return "dodge";
  if (!beat.hit) return "miss";
  return "hurt";
}

/**
 * The voice for a run-level event, or `null` for events that aren't
 * worth a sound.
 *
 * `RoomCleared` is silent on purpose: it fires on the same step as the
 * killing blow and its loot drop, and a third sound in that window just
 * muddies the two that matter.
 */
export function sfxForEvent(event: EngineEvent): SfxId | null {
  switch (event.type) {
    case "LootDropped":
      return "loot";
    case "BossCleared":
      return "victory";
    case "PlayerDefeated":
      return "defeat";
    case "Extracted":
      return "loot";
    case "RoomCleared":
      return null;
  }
}

/**
 * Play a step's beats, staggered so simultaneous swings stay distinct.
 *
 * The first beat fires synchronously — it's the response to the player's
 * click and must feel immediate; only the extras are delayed.
 */
export function playBeats(
  beats: readonly CombatBeat[],
  play: (id: SfxId) => void,
): void {
  beats.forEach((beat, i) => {
    const id = sfxForBeat(beat);
    if (i === 0) play(id);
    else setTimeout(() => play(id), i * BEAT_STAGGER_MS);
  });
}
