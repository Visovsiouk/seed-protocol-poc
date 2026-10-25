/**
 * Per-player record of writing that has crossed between pages.
 *
 * ── Why a crossing is worth keeping ────────────────────────────────────────
 * "The pages are connected by the binding, and writing carries between them"
 * is the canon's answer to how a medieval sword works in 2041 — and until now
 * the game only ever *asserted* it. `GearTranslationScreen` showed the proof
 * for about eight seconds on the way into a run and then threw it away, so the
 * one place the universal-asset claim is made story-legible left no trace.
 *
 * The Book's pages tab is where it belongs: each page can now say which other
 * pages have your writing in them. That is the same fact the adapter contract
 * enforces, told as something the player did rather than something they were
 * told.
 *
 * ── Why the key is the ordered pair ───────────────────────────────────────
 * Idempotent on `${from}>${to}`, not on the run or the token. A crossing is a
 * fact about two pages, and carrying a second sword the same direction is not
 * a second fact — it is the same one again. This also makes the store
 * naturally bounded: three presets give six ordered pairs, so there is no log
 * to cap and no growth to manage. Creator pages draw from the same three
 * presets, so founding realms doesn't change that.
 *
 * `at` is the first crossing in that direction, which is the one the player
 * remembers. Mirrors `epitaphs-local.ts` otherwise: lowercased address key,
 * `typeof window` guard, swallowed JSON errors, every row re-validated on
 * read, and deliberately NOT in `DEPLOYMENT_SCOPED_KEYS` — a chain reset
 * doesn't un-carry what you carried.
 */

import type { Preset } from "@/lib/engine/types";
import { PAGES } from "./canon";

const STORAGE_KEY = "seed-protocol-poc:crossings.v1";

/**
 * A preset the canon has a page for.
 *
 * Validated against `PAGES` rather than the engine's `VALID_PRESETS` for two
 * reasons. `PAGES` is what the reader indexes to get a page name, so this
 * checks the thing that would actually break. And `lib/engine/runtime` pulls
 * in `lib/chain`, which parses the public env at import — a store this small
 * has no business failing to load because `NEXT_PUBLIC_CHAIN` is unset, and
 * the sibling stores all keep their imports to pure data for the same reason.
 */
function isPage(value: unknown): value is Preset {
  return typeof value === "string" && Object.hasOwn(PAGES, value);
}

export type Crossing = {
  /** `${from}>${to}` — see the docblock on why this is the identity. */
  id: string;
  /** The page the writing was made on. */
  from: Preset;
  /** The page that re-described it. */
  to: Preset;
  /** Unix seconds of the first crossing in this direction. */
  at: number;
};

export function crossingId(from: Preset, to: Preset): string {
  return `${from}>${to}`;
}

/** address → crossings, oldest first. */
type Store = Record<string, Crossing[]>;

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Store;
  } catch {
    return {};
  }
}

/** Does this look like a crossing we wrote, rather than arbitrary JSON? */
function isCrossing(value: unknown): value is Crossing {
  if (!value || typeof value !== "object") return false;
  const c = value as Partial<Crossing>;
  return (
    typeof c.id === "string" &&
    typeof c.at === "number" &&
    isPage(c.from) &&
    isPage(c.to)
  );
}

/** Every crossing this player has made, oldest first. */
export function loadCrossings(player: `0x${string}` | undefined): Crossing[] {
  if (!player) return [];
  const rows = read()[player.toLowerCase()];
  return Array.isArray(rows) ? rows.filter(isCrossing) : [];
}

/**
 * Record that writing made on `from` was re-described by `to`.
 *
 * A same-page crossing is dropped rather than stored: nothing crossed, and a
 * row saying a page has its own writing in it is noise in the Book.
 */
export function markCrossing(
  player: `0x${string}` | undefined,
  from: Preset,
  to: Preset,
): void {
  if (!player || typeof window === "undefined") return;
  if (from === to) return;
  if (!isPage(from) || !isPage(to)) return;
  try {
    const store = read();
    const key = player.toLowerCase();
    const rows = Array.isArray(store[key]) ? store[key]!.filter(isCrossing) : [];
    const id = crossingId(from, to);
    if (rows.some((c) => c.id === id)) return;
    store[key] = [
      ...rows,
      { id, from, to, at: Math.floor(Date.now() / 1000) },
    ];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage disabled or full — the crossing still happened on-chain and the
    // player still watched it. Only the record is lost.
  }
}
