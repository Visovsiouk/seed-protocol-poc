import "server-only";

import { NextResponse } from "next/server";

import { getStoryAiEnv } from "@/lib/env";
import { getClientIp } from "./client-ip";
import { createSlidingWindowLimiter } from "./rate-limit";

/**
 * Guards for `/api/story/*`: per-IP rate limit plus a catch-all that
 * guarantees a JSON body on every response.
 *
 * Shaped after `withRealmGuards` (read its docblock first) with one decisive
 * difference: **its own limiter instance.** The realm budget protects routes
 * that spend gas from a server-held key; this one protects a route that spends
 * money at an external API. Sharing a bucket would mean a player dying
 * repeatedly could throttle their own ability to mint loot, and a tampered
 * client hammering narration could starve the signing routes. Separate budgets
 * make each failure local.
 *
 * Narrow env accessor, not `getServerEnv()` — same reasoning as the realm
 * guards: narration must keep working on an install that has never provisioned
 * a trader key.
 */

const limiter = createSlidingWindowLimiter({ max: 0 });

/** Test/diagnostic: drops the story bucket. */
export function __resetStoryRateLimit(): void {
  limiter.reset();
}

export function withStoryGuards<Rest extends unknown[]>(
  handler: (req: Request, ...rest: Rest) => Promise<Response>,
): (req: Request, ...rest: Rest) => Promise<Response> {
  return async (req, ...rest) => {
    try {
      const max = getStoryAiEnv().STORY_AI_RATE_LIMIT_PER_IP_PER_10MIN;

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
      // Nothing escapes: an unhandled throw makes Next return a bodyless 500,
      // which clients report as "Unexpected end of JSON input" rather than a
      // real reason.
      console.error("[story] unhandled in route:", e);
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
