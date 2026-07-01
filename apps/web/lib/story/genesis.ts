/**
 * The Pilgrim's Brand — fantasy starter story object.
 *
 * Long before the player, a fire-mage came to the Reach reaching for a
 * name, and burned. She was an aspirant too, marked as the player is; the
 * Reach bound her, the way it binds everyone it can (bosses
 * are bound aspirants). Her blade — or one of its sisters — is buried in
 * the second clearing. The Hag is `weakTo: fire` for a reason.
 * **Fantasy-only**: the brand is tied to `forcedFirstWeaponElement: "fire"`
 * on the fantasy starter, so the first weapon drop reads as a found relic
 * rather than a coincidence.
 *
 * Pure data + selector functions. No engine state, no chain reads.
 * Imported by `lib/engine/index.ts` (brand drops on the forced first
 * weapon).
 */

/**
 * Narration emitted ONCE per run when the player picks up the forced-fire
 * weapon drop in fantasy. Selected pseudo-deterministically from `pick`
 * (a uint32 derived from the loot rng) so the same run always reads the
 * same story.
 *
 * The brand is the same idea every time — a pilgrim fell, her blade
 * remained — but the framing varies so consecutive runs don't read
 * identically when the player finds another one.
 *
 * Fantasy-only — tied to `forcedFirstWeaponElement: "fire"` on the
 * fantasy starter realm config.
 */
const PILGRIM_BRAND_DROPS: readonly string[] = [
  "Under the moss, a blade wrapped in burnt cloth. The hilt is still warm. " +
    "Someone came down here before you, marked the way you are marked, " +
    "reaching for the same thing. She didn't carry herself out — the Reach " +
    "bound her.",
  "A sword has been driven into the dirt to mark a grave. The wood around " +
    "it is charred. The name on the hilt is too faded to read; the Reach " +
    "set its own shape over hers before she could finish it.",
  "A scorched scabbard. The runes have melted into each other. Inside, the " +
    "blade is still hungry.",
  "A pilgrim's body kneels at the foot of an oak, long since dried to leather. " +
    "Her hand is wrapped around the grip. It opens for you — one climber handing " +
    "the next what the deeper dark already bound her for.",
];

/**
 * Optional name override for the Pilgrim's Brand. The on-chain mint
 * encodes this as the asset's display name — the realm-themed
 * adjective/noun assembly is bypassed for this one drop so the card
 * actually reads as a story object.
 *
 * Variant pool kept small so two adjacent runs feel like sister blades,
 * not unrelated loot.
 */
const PILGRIM_BRAND_NAMES: readonly string[] = [
  "The Pilgrim's Brand",
  "Ember-Wake",
  "Ash-Vow",
  "The Bell-Caller",
];

function pickFrom<T>(pool: readonly T[], rngPick: number): T {
  const idx = ((rngPick % pool.length) + pool.length) % pool.length;
  return pool[idx]!;
}

/**
 * Resolve the pilgrim's brand drop for this run. `rngPick` is any
 * uint32 drawn from the loot rng — same seed in produces same brand out,
 * so the narration and the assigned name align with the existing run's
 * deterministic chain.
 */
export function pilgrimsBrand(rngPick: number): {
  name: string;
  narration: string;
} {
  return {
    name: pickFrom(PILGRIM_BRAND_NAMES, rngPick),
    // pick the narration off a different bit of the seed so two runs that
    // happen to land on the same name don't also share the same line
    narration: pickFrom(PILGRIM_BRAND_DROPS, rngPick >>> 8),
  };
}
