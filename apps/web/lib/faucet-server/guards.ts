import { z } from "zod";

import { addressSchema } from "@/lib/validation/schemas";
import {
  createSlidingWindowLimiter,
  type SlidingWindowLimiter,
} from "@/lib/server/rate-limit";

/**
 * Pure faucet guards — no `server-only`, no RPC, no env. Kept dependency-free
 * so the validation + rate-limit logic is unit-testable without a live chain
 * or a parsed environment. The route (index.ts) supplies env-derived values.
 */

/** The only chain the faucet is ever allowed to run against. */
export const FAUCET_CHAIN_ID = 31337; // anvil

/** Faucet runs against the local anvil chain only — never a real testnet. */
export function isFaucetChainId(chainId: number): boolean {
  return chainId === FAUCET_CHAIN_ID;
}

export const faucetBodySchema = z.object({
  address: addressSchema,
});
export type FaucetBody = z.infer<typeof faucetBodySchema>;

/**
 * Per-IP faucet rate limit. Window and key-eviction mechanics come from
 * `lib/server/rate-limit.ts` (shared with the trader and realm routes), but
 * the faucet keeps its OWN limiter instance so faucet calls don't share a
 * budget with trader calls. `max` is still passed in (from env) to keep this
 * module env-free and testable.
 *
 * The bucket this replaced pruned timestamps within a key but never dropped
 * the keys themselves, so the Map grew for the life of the process.
 */
export class FaucetRateLimitError extends Error {
  constructor() {
    super("Faucet rate limit exceeded");
    this.name = "FaucetRateLimitError";
  }
}

// `max` arrives per call (the route reads it from env), so it is passed to
// `allow` rather than baked in at construction. Rebuilding the limiter when
// the ceiling changed would drop every bucket and hand a fresh budget to
// everyone currently throttled.
const limiter: SlidingWindowLimiter = createSlidingWindowLimiter({ max: 0 });

export function enforceFaucetRateLimit(ip: string, max: number): void {
  if (!limiter.allow(ip, max)) throw new FaucetRateLimitError();
}

/** Test-only: clears the rate-limit buckets between cases. */
export function __resetFaucetRateLimit(): void {
  limiter.reset();
}
