/**
 * Dock panel open event — lets a surface anywhere in the app open one of the
 * dock's popovers.
 *
 * `CornerDock` is mounted once in `app/providers.tsx` and owns its `open`
 * state privately, which is the right shape: a single state is what makes the
 * panels mutually exclusive, and nothing outside needed to reach it. The Book
 * changed that. It was discoverable only as an icon-only pill in the corner —
 * a player finished a whole page without knowing the artifact existed — so the
 * Base now carries a card that opens it, and that card is rendered by a
 * component three levels down a different tree.
 *
 * An event rather than lifting the state through the hub: lifting would put
 * the dock's internals in the hands of every page that happens to host a
 * trigger, and the dock would stop being self-contained. Same shape and same
 * reasoning as `components/hub/station-event.ts`.
 */

export type DockPanel = "codex" | "inventory" | "audio" | "book";

const EVENT = "seed-poc:dock-open";

export function emitDockOpen(panel: DockPanel): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<DockPanel>(EVENT, { detail: panel }));
}

/** Subscribe; returns the unsubscribe cleanup for useEffect. */
export function onDockOpen(cb: (panel: DockPanel) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<DockPanel>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
