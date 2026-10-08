/**
 * The authored sprite bank.
 *
 * Lookup is `(preset, monsterId)` and returns `null` when a creature has no
 * sprite yet. A null is not a failure: `CreatureSigil` falls back to the
 * procedural generator, so the roster can be converted a few creatures at a
 * time and an unknown id from a player-deployed realm still draws something
 * rather than leaving a hole.
 */

import type { Preset } from "@/lib/engine/types";
import { validateSprite, type Sprite } from "@/lib/art/pixels";
import { FANTASY_SPRITES } from "./fantasy";

const BANKS: Readonly<Record<Preset, Readonly<Record<string, Sprite>>>> = {
  fantasy: FANTASY_SPRITES,
  scifi: {},
  cyberpunk: {},
};

// Validate every grid once at module load. A ragged row is the dominant
// authoring slip and is near-invisible by eye in a 32-row block of text, so
// failing loudly here beats shipping a creature with a bite out of it.
for (const [preset, bank] of Object.entries(BANKS)) {
  for (const [id, sprite] of Object.entries(bank)) {
    validateSprite(sprite, `${preset}:${id}`);
  }
}

/** The authored sprite for a roster id, or `null` if none exists yet. */
export function spriteFor(preset: Preset, id: string): Sprite | null {
  return BANKS[preset]?.[id] ?? null;
}

/** Ids with authored art, for the dev gallery's coverage view. */
export function spriteIds(preset: Preset): readonly string[] {
  return Object.keys(BANKS[preset] ?? {});
}
