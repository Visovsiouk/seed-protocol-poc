/**
 * Silhouette families — the creature classes the art layer can draw.
 *
 * Readability needs a shape class before it needs detail: a Dire Wolf should
 * read as a beast at a glance, a Wraith as something that isn't quite there.
 * Stats alone can't give us that (a wolf and a bandit have near-identical HP
 * and attack dice), so each roster entry is tagged with one word here.
 *
 * Why this table lives in `lib/art/` and not as a field on `MonsterDef`:
 * `lib/ui/loot-visuals.ts` sets the rule that the engine never imports
 * presentation, and a silhouette is presentation. Tagging the engine's types
 * with art metadata would invert that dependency for no mechanical gain.
 *
 * Unknown ids — a boss from a realm somebody deploys later — fall back to a
 * hash-derived family. The look is arbitrary but *stable*, so an unrecognised
 * entity still gets a consistent identity instead of a blank frame. There is
 * never a hole.
 */

import type { Preset } from "@/lib/engine/types";
import { artRng } from "./seed";

export const FAMILIES = [
  "humanoid",
  "beast",
  "undead",
  "wisp",
  "winged",
  "hulk",
  "swarm",
] as const;

export type Family = (typeof FAMILIES)[number];

/**
 * Keyed `"<preset>:<monsterId>"` across all three flavor banks — 36 monsters
 * plus 15 bosses. Keep in step with `lib/flavor/*.ts`; the totality test in
 * `families.test.ts` fails if a roster entry loses its tag, so a new monster
 * can't ship untagged by accident.
 */
const TAGS: Readonly<Record<string, Family>> = {
  // ── fantasy ────────────────────────────────────────────────────────────────
  "fantasy:goblin": "humanoid",
  "fantasy:giant_rat": "beast",
  "fantasy:bandit": "humanoid",
  "fantasy:skeleton": "undead",
  "fantasy:wolf": "beast",
  "fantasy:ghoul": "undead",
  "fantasy:forest_hag_minion": "wisp",
  "fantasy:ogre": "hulk",
  "fantasy:wraith": "wisp",
  "fantasy:troll": "hulk",
  "fantasy:cultist": "humanoid",
  "fantasy:shadow_drake": "winged",
  "fantasy:forest_hag": "humanoid",
  "fantasy:lich": "undead",
  "fantasy:dragon": "winged",
  "fantasy:warden": "hulk",
  "fantasy:vampire": "undead",

  // ── scifi ──────────────────────────────────────────────────────────────────
  "scifi:drone": "winged",
  "scifi:scavenger": "humanoid",
  "scifi:drifter": "wisp",
  "scifi:warbot": "hulk",
  "scifi:xenoid": "beast",
  "scifi:exo_hunter": "humanoid",
  "scifi:saboteur": "humanoid",
  "scifi:spore_husk": "undead",
  "scifi:cryo_revenant": "undead",
  "scifi:rogue_loader": "hulk",
  "scifi:ai_acolyte": "humanoid",
  "scifi:void_lich": "undead",
  "scifi:ai_core": "hulk",
  "scifi:hive_queen": "swarm",
  "scifi:void_prince": "wisp",
  "scifi:reactor_wyrm": "winged",
  "scifi:oracle": "wisp",

  // ── cyberpunk ──────────────────────────────────────────────────────────────
  "cyberpunk:street_punk": "humanoid",
  "cyberpunk:fixer": "humanoid",
  "cyberpunk:ripper": "beast",
  "cyberpunk:drone_swarm": "swarm",
  "cyberpunk:netrunner": "wisp",
  "cyberpunk:enforcer": "hulk",
  "cyberpunk:ad_mascot": "beast",
  "cyberpunk:ganger_lieutenant": "humanoid",
  "cyberpunk:chrome_monk": "humanoid",
  "cyberpunk:ice_sentinel": "hulk",
  "cyberpunk:corp_assassin": "humanoid",
  "cyberpunk:rogue_synth": "humanoid",
  "cyberpunk:black_ice": "wisp",
  "cyberpunk:ceo": "humanoid",
  "cyberpunk:ghost": "wisp",
  "cyberpunk:rogue_god": "hulk",
  "cyberpunk:matron": "swarm",
};

/** Silhouette family for a roster id, hash-derived when untagged. */
export function familyFor(preset: Preset, id: string): Family {
  const tagged = TAGS[`${preset}:${id}`];
  if (tagged !== undefined) return tagged;
  return FAMILIES[artRng(`family:${preset}:${id}`).nextInt(FAMILIES.length)]!;
}

/** True when `id` carries an authored tag — used by the art gallery. */
export function isTagged(preset: Preset, id: string): boolean {
  return TAGS[`${preset}:${id}`] !== undefined;
}
