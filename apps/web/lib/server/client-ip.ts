/**
 * Caller-IP resolution, shared by every rate-limited surface: trader, faucet,
 * and the realm routes via `./realm-guards.ts`.
 *
 * Deliberately NOT marked `server-only` and free of env / RPC imports, so the
 * parsing rules below are unit-testable without a live chain or a parsed
 * environment — the same split as `lib/trader-server/hail-guards.ts` and
 * `lib/faucet-server/guards.ts`.
 */

/**
 * Resolves the caller IP from a request.
 *
 * `X-Forwarded-For` is a comma-separated trail, appended to left-to-right:
 * `<client-claimed>, <...>, <peer seen by our proxy>`. Everything except the
 * LAST entry originates from the caller and is therefore forgeable — Caddy
 * (deploy/Caddyfile) appends the real peer rather than replacing the header,
 * so a request carrying `X-Forwarded-For: 1.2.3.4` arrives at the app as
 * `1.2.3.4, <real ip>`.
 *
 * Reading the FIRST entry (as this did) let anyone reset their own rate-limit
 * bucket by rotating one header value, which silently neutered both the trader
 * and faucet limits. Take the last entry: the hop our own trusted proxy
 * appended. The Caddyfile now also overwrites the header outright, so this is
 * the inner of two independent defenses.
 *
 * This assumes exactly ONE trusted proxy in front of the app, which matches
 * both supported deployments (Caddy → :3000, and Vercel's edge). Adding a
 * second reverse proxy means skipping back one more entry.
 */
export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd !== null) {
    const hops = fwd
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);
    // A present-but-unusable XFF (empty, only separators) must NOT fall
    // through to `x-real-ip` — that header is purely caller-supplied, so
    // treating a blanked XFF as "no proxy" would hand back the very spoofing
    // channel this function closes. Bucketing as "unknown" fails closed:
    // such callers share one budget instead of minting fresh ones.
    return hops[hops.length - 1] ?? "unknown";
  }
  // No XFF at all — no proxy in front (local dev / direct hit). `x-real-ip`
  // is not set by Caddy, so it is only ever caller-supplied; it is safe to
  // consult solely because reaching here means there was no proxy to spoof
  // past in the first place.
  return req.headers.get("x-real-ip") ?? "unknown";
}
