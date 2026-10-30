/**
 * Per-player record of which margin notes the borrower has found, and where.
 *
 * Same per-address `Store` shape as `lib/codex/seen.ts` — lowercased address
 * key, `typeof window` guard, swallowed JSON errors — so the two read the
 * same way and a reader of one already knows this one.
 *
 * ── Why v2 carries the page ────────────────────────────────────────────────
 * v1 stored bare note ids. But a note signed by Marrow in 1911 turning up on
 * a station in 2041 *is* the canon's answer to how the pages connect, and the
 * find already knew which page it surfaced on — `MarginFind.foundOn` — and
 * threw it away the moment it was recorded. The collection could then only
 * show what you read, never that the writing had travelled, which was the
 * single most interesting thing about it.
 *
 * v1 data is read transparently and reports `on: null`: those finds really do
 * have no recorded page, and inventing one would be worse than admitting it.
 * The old key is left in place rather than deleted — it costs a few hundred
 * bytes and means a downgrade doesn't lose anybody's collection.
 *
 * ── Deliberately NOT deployment-scoped ─────────────────────────────────────
 * `lib/persistence/deployment-guard.ts` wipes `codex-flags`, `codex-seen` and
 * `equipped` on a chain redeploy, because each describes *chain* state that
 * no longer exists afterwards. Margins don't: they describe what the player
 * has read. The card's stamps re-derive from `TutorialProgress`, so progress
 * self-heals on its own.
 *
 * The consequence is accepted on purpose: after `pnpm local --clean`, a
 * wallet keeps its collected marginalia while its clears reset. That reads
 * correctly rather than as a bug — you have been down here before, and the
 * notes you've read stay read.
 */

import type { Preset } from "@/lib/engine/types";

const STORAGE_KEY = "seed-protocol-poc:margins.v2";
/** v1: `Record<address, string[]>`. Read-only now; never written again. */
const LEGACY_KEY = "seed-protocol-poc:margins.v1";

/** A note the borrower has read, and the page it turned up on. */
export type FoundMargin = {
  id: string;
  /** `null` for finds recorded before v2, which did not keep the page. */
  on: Preset | null;
};

/** address → finds, in the order they were found. */
type Store = Record<string, FoundMargin[]>;

function isPreset(v: unknown): v is Preset {
  return v === "fantasy" || v === "cyberpunk" || v === "scifi";
}

/**
 * Coerce one stored list into `FoundMargin[]`.
 *
 * Accepts both shapes on purpose: a bare string is a v1 entry, an object is a
 * v2 one. That makes the migration a *read* concern rather than a rewrite
 * pass, so a player whose storage is full — the one case where a migration
 * write would fail — still sees their collection.
 */
function normalize(raw: unknown): FoundMargin[] {
  if (!Array.isArray(raw)) return [];
  const out: FoundMargin[] = [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      out.push({ id: entry, on: null });
    } else if (
      entry &&
      typeof entry === "object" &&
      typeof (entry as { id?: unknown }).id === "string"
    ) {
      const { id, on } = entry as { id: string; on?: unknown };
      out.push({ id, on: isPreset(on) ? on : null });
    }
  }
  return out;
}

function parse(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    // A hand-edited or truncated value shouldn't take the dock down.
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    const source =
      parse(window.localStorage.getItem(STORAGE_KEY)) ??
      parse(window.localStorage.getItem(LEGACY_KEY));
    if (!source) return {};
    const store: Store = {};
    for (const [addr, list] of Object.entries(source)) {
      store[addr] = normalize(list);
    }
    return store;
  } catch {
    return {};
  }
}

/** Notes this player has found, oldest first. */
export function loadFoundMargins(
  player: `0x${string}` | undefined,
): FoundMargin[] {
  if (!player) return [];
  return read()[player.toLowerCase()] ?? [];
}

/**
 * Record a find. Idempotent — re-finding a note the player already has is a
 * no-op, so a re-render or a revisited room can't duplicate an entry, and a
 * v1 find is not re-stamped with a page it was never read on.
 */
export function markMarginFound(
  player: `0x${string}` | undefined,
  id: string,
  on?: Preset,
): void {
  if (!player || typeof window === "undefined") return;
  try {
    const store = read();
    const key = player.toLowerCase();
    const found = store[key] ?? [];
    if (found.some((f) => f.id === id)) return;
    store[key] = [...found, { id, on: on ?? null }];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage disabled or full — worst case the note isn't collected. The
    // player still read it when it dropped, which is the part that mattered.
  }
}
