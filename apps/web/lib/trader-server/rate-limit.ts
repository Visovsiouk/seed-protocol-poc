import "server-only";

import { getServerEnv } from "@/lib/env";
import {
  createSlidingWindowLimiter,
  type SlidingWindowLimiter,
} from "@/lib/server/rate-limit";

/**
 * Per-IP trader rate limit.
 *
 * The window and key-eviction mechanics live in `lib/server/rate-limit.ts`,
 * shared with the faucet and the realm routes — this module only binds them to
 * `TRADER_RATE_LIMIT_PER_IP_PER_10MIN` and keeps the `RateLimitError` type
 * that `withTraderGuards` already maps to a 429.
 *
 * The previous hand-rolled bucket here pruned timestamps within a key but
 * never dropped the keys, so the Map grew for the life of the process.
 */

export class RateLimitError extends Error {
  constructor() {
    super("Rate limit exceeded");
    this.name = "RateLimitError";
  }
}

let limiter: SlidingWindowLimiter | undefined;

export function enforceRateLimit(ip: string): void {
  // Read env on every call so missing/invalid TRADER_* env still surfaces as
  // a config error from this guard (withTraderGuards maps ZodError -> 503
  // not_configured), exactly as it did before. The limiter itself is built
  // once; `max` cannot change afterwards because getServerEnv() is cached.
  const max = getServerEnv().TRADER_RATE_LIMIT_PER_IP_PER_10MIN;
  limiter ??= createSlidingWindowLimiter({ max });

  if (!limiter.allow(ip)) throw new RateLimitError();
}

/** Test-only: drops all trader buckets between cases. */
export function __resetRateLimit(): void {
  limiter?.reset();
}
