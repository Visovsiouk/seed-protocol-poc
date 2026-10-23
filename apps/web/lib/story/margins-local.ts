/**
 * Per-player record of which margin notes the borrower has found.
 *
 * Same per-address `Store` shape as `lib/codex/seen.ts` — lowercased address
 * key, `typeof window` guard, swallowed JSON errors — so the two read the
 * same way and a reader of one already knows this one.
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

const STORAGE_KEY = "seed-protocol-poc:margins.v1";

/** address → note ids, in the order they were found. */
type Store = Record<string, string[]>;

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    // A hand-edited or truncated value shouldn't take the dock down.
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Store;
  } catch {
    return {};
  }
}

/** Note ids this player has found, oldest first. */
export function loadFoundMargins(player: `0x${string}` | undefined): string[] {
  if (!player) return [];
  const found = read()[player.toLowerCase()];
  return Array.isArray(found) ? found.filter((id) => typeof id === "string") : [];
}

/**
 * Record a find. Idempotent — re-finding a note the player already has is a
 * no-op, so a re-render or a revisited room can't duplicate an entry.
 */
export function markMarginFound(
  player: `0x${string}` | undefined,
  id: string,
): void {
  if (!player || typeof window === "undefined") return;
  try {
    const store = read();
    const key = player.toLowerCase();
    const found = Array.isArray(store[key]) ? store[key]! : [];
    if (found.includes(id)) return;
    store[key] = [...found, id];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage disabled or full — worst case the note isn't collected. The
    // player still read it when it dropped, which is the part that mattered.
  }
}
