/**
 * Flavor bank shape — one bank per preset (fantasy / scifi / cyberpunk).
 *
 * A flavor bank is data, not code: ~100–150 strings plus monster/boss
 * stat-and-verb records. The engine reads from it
 * exclusively via the helpers in `narration.ts`; banks should never need
 * to know engine internals beyond the type contract below.
 *
 * Authoring rules:
 *   - Every `narrationKey` referenced by any `RoomTemplate` MUST have at
 *     least one variant string in `rooms`. Missing keys throw at runtime
 *     (see `pickVariant`).
 *   - Monsters carry their own attack-verb banks; bosses carry phase-2
 *     narration as a separate key on `bossPhases`.
 *   - Loot names are no longer assembled from this bank — they come
 *     from the schema-native tier-scaled `name(type, tier)` ladder in
 *     `lib/loot/names.ts` (mirror of each weapon/armor schema's
 *     on-chain view).
 */

import type { BossDef, MonsterDef, RoomTemplate } from "../engine/types";

export type FlavorBank = {
  /** Display name shown on `/play/[preset]`. */
  presetDisplayName: string;

  /** Keyed by `RoomTemplate.narrationKey` → variants picked by the RNG. */
  rooms: Readonly<Record<string, readonly string[]>>;

  /** Boss phase-2 narration, keyed by `BossDef.phase2NarrationKey`. */
  bossPhases: Readonly<Record<string, readonly string[]>>;

  /**
   * Trial-room flavor: short obstacle prompts ("leap the gap"). The
   * engine picks one per room and renders it above the DC banner. The
   * ability is rolled, not flavored, so a single bank covers both
   * agility and endurance trials.
   */
  trialPrompts: readonly string[];
  /** Trial pass/fail outcome lines. */
  trialSuccess: readonly string[];
  trialFailure: readonly string[];

  /** Ledger-room intro flavor — mood-setting only. */
  ledgerPrompts: readonly string[];

  /** Room templates for this preset's run. */
  roomTemplates: readonly RoomTemplate[];

  /** Monster roster, keyed by `MonsterDef.id`. */
  monsters: Readonly<Record<string, MonsterDef>>;

  /** Boss roster — every realm of this preset picks one of these. */
  bosses: Readonly<Record<string, BossDef>>;
};
