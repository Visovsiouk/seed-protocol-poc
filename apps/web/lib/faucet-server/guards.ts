import { z } from "zod";

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
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
});
export type FaucetBody = z.infer<typeof faucetBodySchema>;

/**
 * Per-IP sliding-window rate limit, mirroring lib/trader-server/rate-limit.ts
 * but with its own in-process bucket so faucet calls don't share a budget with
 * trader calls. `max` is passed in (from env) to keep this module env-free.
 */
const buckets = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;

export class FaucetRateLimitError extends Error {
  constructor() {
    super("Faucet rate limit exceeded");
    this.name = "FaucetRateLimitError";
  }
}

export function enforceFaucetRateLimit(ip: string, max: number): void {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  const history = buckets.get(ip) ?? [];
  const recent = history.filter((t) => t > cutoff);

  if (recent.length >= max) {
    throw new FaucetRateLimitError();
  }

  recent.push(now);
  buckets.set(ip, recent);
}

/** Test-only: clears the rate-limit buckets between cases. */
export function __resetFaucetRateLimit(): void {
  buckets.clear();
}
