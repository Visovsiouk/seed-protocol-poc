/**
 * Canonical catalog-effect declarations — the deploy-time input to the
 * on-chain `CatalogEffectRegistry`, AND the disconnected-mode fallback
 * for the engine.
 *
 * **On-chain registry is the source of truth in connected play.**
 *
 * This table is read in exactly two places:
 *   1. `pnpm seed:catalog` — feeds these names into the registry's
 *      `setEffects(schemaId, names)` at bring-up time.
 *   2. The engine resolver (`catalog-effects.ts`) — fallback when no
 *      `generated/catalog.json` entry exists for the active chain (e.g.
 *      vitest, disconnected/trial mode, or Base Sepolia before seeding).
 *
 * When the on-chain registry and this table diverge, **the registry
 * wins** in connected play. Editing this table without re-running
 * `pnpm seed:catalog` only updates the fallback path — connected
 * play continues to read whatever the registry already has.
 *
 * On-chain reality:
 *
 *   The sister-repo SchemaRegistry assigns ONE `loot` schemaId per
 *   preset (3 total: e.g. fantasy=2, scifi=4, cyberpunk=6 on localhost).
 *   There is no separate weapon/armor schema on-chain — both slots use
 *   the same loot schema and partition by `kind` in the per-mint
 *   metadata. So this table keys off `preset`, not `(preset, slot)`,
 *   and lists the *union* of weapon + armor effects for that preset.
 *   The resolver splits them by slot at read time using
 *   `WEAPON_EFFECTS` / `ARMOR_EFFECTS` from `lib/engine/catalog.ts`.
 *
 * Per-preset assignment rationale (mirrors the prose in runtime.ts that
 * the original off-chain S4 commit baked in):
 *
 *   - fantasy   → bleed (weapon) + regen (armor)        — visceral / pastoral
 *   - scifi     → crit_chance (weapon) + damage_reduction (armor)
 *                                                         — precision / armoured
 *   - cyberpunk → multi_hit (weapon) + dodge_chance (armor)
 *                                                         — twitch / speed
 */

import type { CatalogEffectName, Preset } from "@/lib/engine/types";

/**
 * Per-preset declared catalog effects. The list is the *union* of
 * weapon + armor effects; the on-chain registry stores it verbatim
 * keyed by the preset's loot schemaId, and the resolver partitions
 * by slot at read time.
 *
 * Effect name encoding on the wire: `bytes32` right-padded UTF-8
 * (matches `stringToHex(name, { size: 32 })` — the convention
 * `SchemaField.name` already uses).
 */
export const CANONICAL_CATALOG_EFFECTS: Readonly<
  Record<Preset, readonly CatalogEffectName[]>
> = {
  fantasy: ["bleed", "regen"],
  scifi: ["crit_chance", "damage_reduction"],
  cyberpunk: ["multi_hit", "dodge_chance"],
} as const;

/**
 * Closed set of catalog names the resolver is allowed to surface.
 * Anything else read from chain (e.g. a misencoded name, or a name
 * added in a future contract version this app doesn't understand)
 * gets dropped on the floor with a console warning rather than
 * crashing the loot roll. Mirrors the `CatalogEffectName` union in
 * `lib/engine/types.ts`.
 */
export const CATALOG_EFFECT_NAMES: readonly CatalogEffectName[] = [
  "lifesteal",
  "armor_pierce",
  "crit_chance",
  "multi_hit",
  "bleed",
  "regen",
  "thorns",
  "dodge_chance",
  "damage_reduction",
] as const;
