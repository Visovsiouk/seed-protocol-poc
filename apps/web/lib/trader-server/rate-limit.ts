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

/**
 * Resolves the caller IP from a Next.js request. `x-forwarded-for` is the
 * first hop in front of Vercel; falls back to "unknown" if not present
 * (e.g. local dev).
 */
export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
