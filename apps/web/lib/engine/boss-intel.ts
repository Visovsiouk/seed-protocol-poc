import { getFlavorBank } from "@/lib/flavor";
import {
  CYBERPUNK_ELEMENTS,
  FANTASY_ELEMENTS,
  SCIFI_ELEMENTS,
  type Element,
  type Preset,
} from "./types";

/**
 * Boss intel for the pre-descend loadout screen (player realms only).
 *
 * Combat already applies 1.5× damage against a boss's `weakTo` element and
 * 0.5× against its `resistTo` (lib/engine/combat.ts) — this module only
 * SURFACES those numbers so the player can counter-pick before descending,
 * which is the pull toward the bazaar: drops roll random elements, the
 * market is where you find the right one on purpose.
 */

export type BossIntel = {
  bossId: string;
  bossName: string;
  /** Element the boss is weak to (1.5× incoming damage). */
  weakTo: Element | null;
  /** Element the boss resists (0.5× incoming damage). */
  resistTo: Element | null;
};

export function getBossIntel(preset: Preset, bossId: string): BossIntel | null {
  const bank = getFlavorBank(preset);
  const boss = bank.bosses[bossId];
  if (!boss) return null;
  return {
    bossId: boss.id,
    bossName: boss.name,
    weakTo: boss.weakTo ?? null,
    resistTo: boss.resistTo ?? null,
  };
}

const ELEMENT_VOCAB: Readonly<Record<Preset, readonly Element[]>> = {
  fantasy: FANTASY_ELEMENTS,
  scifi: SCIFI_ELEMENTS,
  cyberpunk: CYBERPUNK_ELEMENTS,
};

/**
 * Translate an element between preset vocabularies. The 12 adapter
 * contracts re-encode elements BY INDEX when an asset crosses a preset
 * boundary (fire ↔ plasma ↔ incendiary, etc.), so the client-side mapping
 * is a deterministic index lookup — no chain call needed to know how a
 * foreign weapon's element will read in this realm.
 */
export function translateElement(
  element: Element | undefined,
  from: Preset,
  to: Preset,
): Element {
  if (!element || element === "none" || from === to) return element ?? "none";
  const idx = ELEMENT_VOCAB[from].indexOf(element);
  if (idx <= 0) return "none";
  return ELEMENT_VOCAB[to][idx] ?? "none";
}

export type ElementMatch = "counter" | "resisted" | "neutral";

/**
 * How a weapon element (in this realm's local vocabulary — translate foreign
 * gear first) fares against the boss.
 */
export function matchAgainstBoss(
  weaponElement: Element | undefined,
  intel: BossIntel,
): ElementMatch {
  if (!weaponElement || weaponElement === "none") return "neutral";
  if (intel.weakTo && weaponElement === intel.weakTo) return "counter";
  if (intel.resistTo && weaponElement === intel.resistTo) return "resisted";
  return "neutral";
}
