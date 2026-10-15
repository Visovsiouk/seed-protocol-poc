import "server-only";

import { getServerEnv } from "@/lib/env";

/**
 * Per-IP sliding-window rate limit. Stored in-process via a
 * Map keyed by IP; entries are tuples of timestamps. On Vercel this resets
 * per cold start, which is acceptable for a demo — the goal is to make
 * casual abuse painful, not to be DDoS-grade.
 */

const buckets = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;

export class RateLimitError extends Error {
  constructor() {
    super("Rate limit exceeded");
    this.name = "RateLimitError";
  }
}

export function enforceRateLimit(ip: string): void {
  const env = getServerEnv();
  const max = env.TRADER_RATE_LIMIT_PER_IP_PER_10MIN;
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  const history = buckets.get(ip) ?? [];
  const recent = history.filter((t) => t > cutoff);

  if (recent.length >= max) {
    throw new RateLimitError();
  }

  recent.push(now);
  buckets.set(ip, recent);
}

// Lives in ./client-ip.ts so the (security-relevant) XFF parsing rules stay
// unit-testable — `server-only` above makes this module unimportable from
// vitest. Re-exported so existing call sites keep their import path.
export { getClientIp } from "./client-ip";
