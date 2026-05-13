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
