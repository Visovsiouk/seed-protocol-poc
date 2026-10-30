import "server-only";

/**
 * Per-death memo for `/api/story/epitaph`, so a double-POST (React strict
 * mode, a retried fetch, the player reloading the defeat screen) cannot buy
 * the same sentence twice.
 *
 * Keyed by `epitaphId`, which is derived from the run seed and depth rather
 * than from a clock — the same death is the same key forever.
 *
 * In-process and bounded, matching `rate-limit.ts`'s reasoning: the PoC runs a
 * single Next.js process, and the goal is avoiding obvious waste rather than
 * being a real cache. Eviction is oldest-first, which at worst costs one
 * regenerated note.
 *
 * ── Why this isn't inside the route file ───────────────────────────────────
 * A `route.ts` may only export request handlers and the framework's config
 * keys. Next generates a type that constrains every other export to `never`,
 * so an exported `__resetEpitaphMemo` fails `tsc` the moment `.next/types`
 * exists — which is after the first build, not on a clean checkout. Test
 * seams for a route belong beside the state they reset, not in the route.
 */

const MEMO_MAX = 500;
const memo = new Map<string, string>();

/** The note already written for this death, if it is still in the window. */
export function recallEpitaph(id: string): string | undefined {
  return memo.get(id);
}

export function rememberEpitaph(id: string, text: string): void {
  memo.delete(id);
  memo.set(id, text);
  while (memo.size > MEMO_MAX) {
    const oldest = memo.keys().next();
    if (oldest.done) break;
    memo.delete(oldest.value);
  }
}

/** Test-only: drops the memo so cases don't bleed into each other. */
export function __resetEpitaphMemo(): void {
  memo.clear();
}
