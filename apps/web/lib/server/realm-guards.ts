import "server-only";

import { NextResponse } from "next/server";

import { getRealmRateLimits } from "@/lib/env";
import { getClientIp } from "./client-ip";
import { createSlidingWindowLimiter } from "./rate-limit";

/**
 * Shared guards for the `/api/realm/*` routes: per-IP rate limit plus a
 * catch-all that guarantees a JSON body on every response.
 *
 * Why this exists: the trader surface has had `withTraderGuards` since it
 * shipped, but the realm routes never got an equivalent — so `mint-loot`,
 * `boss-cleared`, `claim-seed` and `register` each signed transactions from
 * server-held keys with NO ceiling on call volume. `mint-loot`'s own docblock
 * concedes that a tampered client picking bound-consistent values slips past
 * the catalog checks; without a rate limit that becomes unbounded minting at
 * the operator's gas expense. The bounds check and the rate limit are
 * complementary, and only one of them had shipped.
 *
 * Deliberately THINNER than `withTraderGuards`. That wrapper also owns body
 * parsing and maps a handler's return value into a response, which works
 * because all four trader actions share one success shape (`txHash` + optional
 * extra). The realm routes do not: they return `tokenId`+`txHash`, a `realm`
 * object, a `realms` array, and each carries its own route-specific `reason`
 * union across many early returns (`mint-loot` alone has ~10). Forcing them
 * into that mould would be a large, risky rewrite of the most
 * security-sensitive code in the app for no gain, so this wrapper adds only
 * what is missing and leaves each route's body parsing and reply shapes
 * untouched.
 *
 * Read and write budgets are separate limiter instances so UI polling of
 * `/list` or `/[address]/meta` can never exhaust the budget that protects the
 * signing routes.
 */

const writeLimiter = createSlidingWindowLimiter({ max: 0 });
const readLimiter = createSlidingWindowLimiter({ max: 0 });

/**
 * `"write"` for routes that sign a transaction or mutate the realm DB,
 * `"read"` for the public lookups.
 */
export type RealmRouteKind = "read" | "write";

/** Test/diagnostic: drops both realm buckets. */
export function __resetRealmRateLimits(): void {
  writeLimiter.reset();
  readLimiter.reset();
}

/**
 * Wraps a realm route handler. The handler keeps its native Next.js signature
 * — `(req)`, `(req, { params })`, or no args at all — because `Rest` is
 * inferred from it and forwarded untouched.
 */
export function withRealmGuards<Rest extends unknown[]>(
  kind: RealmRouteKind,
  handler: (req: Request, ...rest: Rest) => Promise<Response>,
): (req: Request, ...rest: Rest) => Promise<Response> {
  return async (req, ...rest) => {
    // Outer catch-all: nothing may escape. An unhandled throw makes Next
    // return a bodyless 500, which clients report as the useless "Unexpected
    // end of JSON input" rather than a real reason — the same failure mode
    // `withTraderGuards` guards against, and the one `claim-seed` hit on
    // receipt timeouts.
    try {
      // Narrow accessor, NOT getServerEnv() — see the docblock on
      // `getRealmRateLimits`. Reading the full server schema here would make
      // the two trader-key-free read routes fail on an install that hasn't
      // provisioned a trader.
      const limits = getRealmRateLimits();
      const limiter = kind === "write" ? writeLimiter : readLimiter;
      const max =
        kind === "write"
          ? limits.REALM_WRITE_RATE_LIMIT_PER_IP_PER_10MIN
          : limits.REALM_READ_RATE_LIMIT_PER_IP_PER_10MIN;

      if (!limiter.allow(getClientIp(req), max)) {
        return NextResponse.json(
          {
            ok: false as const,
            reason: "rate_limited" as const,
            message: "Too many requests — try again in a few minutes",
          },
          { status: 429 },
        );
      }

      return await handler(req, ...rest);
    } catch (e) {
      // Full detail to the server log; a stable shape to the client. Matches
      // the `{ ok, reason, message }` envelope every realm route already uses,
      // so this is indistinguishable from a route's own error reply.
      console.error(`[realm] unhandled in ${kind} route:`, e);
      return NextResponse.json(
        {
          ok: false as const,
          reason: "internal" as const,
          message: e instanceof Error ? e.message : String(e),
        },
        { status: 500 },
      );
    }
  };
}
