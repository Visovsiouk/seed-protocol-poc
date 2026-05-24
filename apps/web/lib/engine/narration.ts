/**
 * Templated narration — mustache-lite, no logic.
 *
 * Flavor banks (lib/flavor/*) carry string templates with `{var}` slots.
 * `render(template, vars)` substitutes; `pickVariant(bank, key, rng)` picks
 * a uniformly-random string from a named array in the bank.
 *
 * Keep this dumb on purpose: the engine should never need to read a flavor
 * bank's *structure*, only call into these two helpers.
 */

import type { Rng } from "./rng";

/** Mustache-lite substitution. Unknown vars are left as-is. */
export function render(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = vars[name];
    return v === undefined ? `{${name}}` : String(v);
  });
}

/**
 * Sentence-start form of a monster/boss name with a definite article:
 *
 *   { name: "Goblin"         } → "The Goblin"
 *   { name: "The Forest Hag" } → "The Forest Hag"   (no double prefix)
 *
 * Use this instead of hand-rolling `` `The ${m.name}` `` in narration —
 * boss names in the flavor banks bake the article into the proper noun
 * (so "The Forest Hag" reads as a name, not a description), and a naive
 * template was producing "The The Forest Hag".
 */
export function monsterTitle(m: { name: string }): string {
  return m.name.startsWith("The ") ? m.name : `The ${m.name}`;
}

/**
 * Mid-sentence form of {@link monsterTitle}:
 *
 *   { name: "Goblin"         } → "the Goblin"
 *   { name: "The Forest Hag" } → "the Forest Hag"
 *
 * Used for lines like "you dodge the Forest Hag's attack."
 */
export function monsterLower(m: { name: string }): string {
  return m.name.startsWith("The ")
    ? `the ${m.name.slice(4)}`
    : `the ${m.name}`;
}

/**
 * Picks a uniformly-random variant from a string array. Throws when the
 * key is missing or empty — these are bank-authoring bugs we want to catch
 * loudly in tests, not silently degrade to an empty narration line.
 */
export function pickVariant(
  bank: Record<string, readonly string[]>,
  key: string,
  rng: Rng,
): string {
  const variants = bank[key];
  if (!variants) {
    throw new Error(`pickVariant: missing narration key "${key}"`);
  }
  if (variants.length === 0) {
    throw new Error(`pickVariant: empty variant list for key "${key}"`);
  }
  return rng.pick(variants);
}
