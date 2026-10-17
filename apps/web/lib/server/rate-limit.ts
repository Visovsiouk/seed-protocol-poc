/**
 * Shared per-key sliding-window rate limiter.
 *
 * Deliberately NOT marked `server-only` and free of env / RPC imports, so the
 * window and eviction behaviour are unit-testable — the same split as
 * `lib/trader-server/client-ip.ts` and `lib/faucet-server/guards.ts`. Callers
 * supply `max` from env.
 *
 * Replaces two near-identical hand-rolled copies (one in trader-server, one in
 * faucet-server). Both pruned timestamps *within* a key but never removed the
 * keys themselves, so the Map grew without bound for the life of the process —
 * and under systemd these run for weeks. Each limiter instance keeps its own
 * bucket, so trader / faucet / realm budgets stay independent.
 *
 * In-process only: resets on restart and is per-instance, which is acceptable
 * here for the same reason `signer-nonce-lock.ts` is — the PoC runs a single
 * Next.js process. The goal is making casual abuse painful, not being
 * DDoS-grade. A horizontally-scaled deployment would need a shared store.
 */

export const DEFAULT_WINDOW_MS = 10 * 60 * 1000;

/**
 * Ceiling on tracked keys. Keys are client IPs, and since `getClientIp` no
 * longer honours a forged `X-Forwarded-For` (see client-ip.ts) the live key
 * count is bounded by real peers — so this is a backstop against slow growth,
 * not the primary defence.
 *
 * TRADEOFF: evicting a key resets that caller's budget, so eviction fails
 * OPEN. That is deliberate — unbounded memory in a long-lived process is the
 * worse failure, and reaching this ceiling requires ~20k distinct real IPs
 * inside one window. Expired keys are always dropped before any live key is
 * evicted, so the ceiling is only consulted under genuine fan-out.
 */
export const DEFAULT_MAX_KEYS = 20_000;

export class RateLimitExceededError extends Error {
  constructor(message = "Rate limit exceeded") {
    super(message);
    this.name = "RateLimitExceededError";
  }
}

export type SlidingWindowLimiter = {
  /**
   * Records a hit. Returns false (recording nothing) when over budget.
   *
   * `max` overrides the construction default for this call. Callers that
   * read their ceiling from env per request (the faucet) pass it here rather
   * than rebuilding the limiter — rebuilding would drop every bucket, handing
   * out a fresh budget to everyone currently throttled.
   */
  allow(key: string, max?: number): boolean;
  /** `allow`, but throws `RateLimitExceededError` instead of returning false. */
  hit(key: string, max?: number): void;
  /** Number of tracked keys. Test/diagnostic use. */
  size(): number;
  /** Drops all state. Test use, and between cases. */
  reset(): void;
};

export function createSlidingWindowLimiter(opts: {
  /** Default max hits per key per window; overridable per `allow` call. */
  max: number;
  windowMs?: number;
  maxKeys?: number;
}): SlidingWindowLimiter {
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const maxKeys = opts.maxKeys ?? DEFAULT_MAX_KEYS;

  // Insertion order doubles as recency order: every touch deletes and
  // re-inserts the key, so the oldest entry is always the front of the Map.
  // Values are hit timestamps, each array bounded by `max` (we stop recording
  // at the ceiling), so total memory is O(maxKeys * max).
  const buckets = new Map<string, number[]>();

  /** Drops keys whose every timestamp has aged out of the window. */
  function dropExpired(cutoff: number): void {
    for (const [key, hits] of buckets) {
      // hits is append-only and monotonic, so the last entry is the newest.
      const newest = hits[hits.length - 1];
      if (newest === undefined || newest <= cutoff) buckets.delete(key);
    }
  }

  /** Re-inserts `key` so it sorts as most-recently-used. */
  function touch(key: string, hits: number[]): void {
    buckets.delete(key);
    buckets.set(key, hits);
  }

  function allow(key: string, max: number = opts.max): boolean {
    const now = Date.now();
    const cutoff = now - windowMs;

    const recent = (buckets.get(key) ?? []).filter((t) => t > cutoff);

    if (recent.length >= max) {
      // Over budget. Still re-insert the pruned array: it keeps the key from
      // looking stale to the evictor while a caller is actively hammering it,
      // and discards timestamps that have aged out.
      touch(key, recent);
      return false;
    }

    recent.push(now);
    touch(key, recent);

    if (buckets.size > maxKeys) {
      dropExpired(cutoff);
      // Expired keys alone may not get us under the ceiling. Evict
      // least-recently-used until they do. `key` was just touched, so it is
      // the newest entry and cannot be the one evicted here.
      while (buckets.size > maxKeys) {
        const oldest = buckets.keys().next();
        if (oldest.done) break;
        buckets.delete(oldest.value);
      }
    }

    return true;
  }

  return {
    allow,
    hit(key, max) {
      if (!allow(key, max)) throw new RateLimitExceededError();
    },
    size: () => buckets.size,
    reset: () => buckets.clear(),
  };
}
