/**
 * Loot provenance — the soul on a finding.
 *
 * Canon: findings are what bound aspirants carried
 * before they fell. Tier is *how deep a climber got* before the world took
 * them — so the deepest gear (T4/T5) carries a trace of the one it outlived. A
 * catalog effect is not just a stat; it's a scar with a cause:
 *
 *   - lifesteal  — the blade learned to drink because its carrier was dying
 *   - bleed      — it never closed the first wound it made
 *   - crit_chance— it remembers exactly where the soft place is
 *   - multi_hit  — its carrier struck twice because once was never enough
 *   - armor_pierce— it was sharpened on something that wore plate, and won
 *   - regen      — it keeps mending the hand that is no longer inside it
 *   - thorns     — the coat remembers being struck, and answers
 *   - dodge_chance— its carrier survived by not being where the blow landed
 *   - damage_reduction — it took the hits so its carrier could keep walking
 *
 * Pure data + a selector. Presentation-only: consumed by `AssetCard`'s
 * dramatic-reveal path for T4/T5 drops (the provenance line under the name).
 * Lower-tier findings get no line — they belonged to climbers who didn't get
 * far enough to leave a story.
 */

/** Minimum tier that earns a provenance line. */
export const PROVENANCE_MIN_TIER = 4;

/**
 * Effect → one-line provenance. The fiction is the cause of the mechanic, in
 * the bound-aspirant register. Keyed by catalog effect `name`.
 */
const EFFECT_PROVENANCE: Record<string, string> = {
  lifesteal:
    "It learned to drink. The one who carried it was bleeding out and asked it " +
    "to, and it never unlearned the taste.",
  bleed:
    "The first wound it opened never closed. It has been weeping that same cut " +
    "through every hand since.",
  crit_chance:
    "It knows the soft place under the ribs the way you know your own teeth. " +
    "Someone taught it, and did not survive the lesson.",
  multi_hit:
    "Its carrier struck twice because once was never enough to live — and the " +
    "habit set into the steel.",
  armor_pierce:
    "It was honed against something that wore plate and counted on it. The " +
    "plate is gone. The edge remembers winning.",
  regen:
    "It is still mending a hand that is no longer inside it, stitching an " +
    "absence closed, patient and wrong.",
  thorns:
    "It took so many blows for the one who wore it that it learned to answer. " +
    "It does not know that one is gone.",
  dodge_chance:
    "Its carrier lived by never being quite where the blow fell — right up " +
    "until the once they were.",
  damage_reduction:
    "It ate the hits so its carrier could keep walking. It walked them a long " +
    "way before the dark caught up.",
};

/**
 * Fallback by tier when a T4/T5 finding carries no catalog effect — still
 * names whose hands it left, just without a specific scar.
 */
const TIER_PROVENANCE: Record<number, string> = {
  4: "Deep gear. A climber carried this nearly to the warden's door before the " +
    "world took the hand that held it.",
  5: "This came off someone who all but reached the heart of the world. They " +
    "did not carry it out. You can.",
};

/**
 * Resolve a provenance line for a finding, or `null` if it isn't deep enough
 * to have a story. Deterministic: picks the first mapped catalog effect (the
 * roll order is already deterministic), else falls back to the tier line.
 */
export function provenanceFor(card: {
  tier: number;
  catalogEffects: readonly { name: string }[];
}): string | null {
  if (card.tier < PROVENANCE_MIN_TIER) return null;
  for (const effect of card.catalogEffects) {
    const line = EFFECT_PROVENANCE[effect.name];
    if (line) return line;
  }
  return TIER_PROVENANCE[card.tier] ?? null;
}
