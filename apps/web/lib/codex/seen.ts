/**
 * Per-player "already celebrated" codex steps — the toast watcher's memory.
 *
 * A step lands here once it has been toasted (or was already done when the
 * session first settled), so reloads and wallet reconnects never re-announce
 * old progress. Same per-address Store shape as `lib/codex/local.ts`; wiped
 * by the deployment guard on chain redeploys (the progress it describes no
 * longer exists).
 */

import type { CodexStepId } from "./steps";
import { CODEX_STEPS } from "./steps";

const STORAGE_KEY = "seed-protocol-poc:codex-seen";

type Store = Record<string, CodexStepId[]>;

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

export function loadSeenSteps(
  player: `0x${string}` | undefined,
): Set<CodexStepId> {
  if (!player) return new Set();
  return new Set(read()[player.toLowerCase()] ?? []);
}

export function saveSeenSteps(
  player: `0x${string}` | undefined,
  seen: ReadonlySet<CodexStepId>,
): void {
  if (!player || typeof window === "undefined") return;
  try {
    const store = read();
    store[player.toLowerCase()] = [...seen];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage disabled — worst case a step re-toasts next session.
  }
}

/**
 * Steps completed but not yet celebrated, in journey order. Pure — unit
 * tested next to `status.ts`.
 */
export function newlyStamped(
  done: ReadonlySet<CodexStepId>,
  seen: ReadonlySet<CodexStepId>,
): CodexStepId[] {
  return CODEX_STEPS.filter((s) => done.has(s.id) && !seen.has(s.id)).map(
    (s) => s.id,
  );
}
