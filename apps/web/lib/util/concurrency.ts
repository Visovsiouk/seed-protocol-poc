/**
 * Bounded-concurrency async map. Pure and dependency-free so it is testable
 * without a chain or env.
 *
 * `Promise.all(xs.map(fn))` starts every task at once. That is fine for a
 * handful of items and actively harmful for an unbounded event scan: see
 * `lib/reads/realm-tier.ts`, where one request fanned out to one RPC call per
 * `AssetMinted` event ever emitted by a realm. Worse, the fan-out grew with
 * realm popularity, so the realms most worth visiting were the cheapest to
 * overload, and `/api/realm/list` nested that fan-out once per realm.
 */

/** Default ceiling for RPC fan-out. Generous for latency, bounded for load. */
export const DEFAULT_CONCURRENCY = 8;

/**
 * Maps `items` through `fn` with at most `limit` tasks in flight, preserving
 * input order in the result (so it is a drop-in for `Promise.all(map)`).
 *
 * Rejection semantics match `Promise.all`: the first rejection propagates.
 * Tasks already in flight are allowed to settle, but no further ones start.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<R>,
  limit: number = DEFAULT_CONCURRENCY,
): Promise<R[]> {
  if (items.length === 0) return [];

  // A limit at or above the input size has no shared cursor to contend over,
  // so skip straight to the unbounded path.
  const workers = Math.max(1, Math.min(Math.floor(limit), items.length));
  const results = new Array<R>(items.length);

  // Shared cursor: each worker repeatedly claims the next index. This keeps
  // all workers busy when task durations vary, which a fixed chunk-per-worker
  // split would not (a slow chunk would idle the rest).
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}
