/**
 * Hub station navigation event — lets globally-mounted chrome (the floating
 * Codex widget) walk the player to a base station.
 *
 * The hub reads `?station=` from the URL on mount only (SSR-safe, no
 * useSearchParams Suspense boundary), so a client-side <Link> to
 * `/?station=market` from WITHIN the hub page never re-runs that read — the
 * component instance persists across same-route query navigations. Widget
 * CTAs therefore emit this event alongside the Link: off the hub, the fresh
 * mount reads the URL; on the hub, the event switches the station live.
 */

export type HubStation = "doors" | "market" | "altar" | "forge";

const EVENT = "seed-poc:hub-station";

export function emitHubStation(station: HubStation): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<HubStation>(EVENT, { detail: station }));
}

/** Subscribe; returns the unsubscribe cleanup for useEffect. */
export function onHubStation(cb: (station: HubStation) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<HubStation>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
