"use client";

/**
 * `<ColdOpenBook/>` — five-page vignette that opens a new player's
 * arrival. Rendered on `/` when `progress.starterClears === 0` and the
 * `COLD_OPEN_STORAGE_KEY` flag isn't set. The final page routes to
 * `/play/fantasy` and sets the flag so returning visitors don't read
 * the book twice.
 *
 * Pure presentation — beats live in `lib/story/coldOpen.ts`.
 */

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { Panel, Button, Footnote, Rule, Stamp } from "@/components/ui";
import {
  CinematicBeatPlayer,
  type RenderFrameArgs,
} from "@/components/story/CinematicBeatPlayer";
import {
  COLD_OPEN_BOOK,
  COLD_OPEN_STORAGE_KEY,
} from "@/lib/story/coldOpen";

export function ColdOpenBook({
  /**
   * Where the final "Wake" button routes when no `onWake` is given. Defaults
   * to the pocket-realm hub at `/`. Note `router.push("/")` is a no-op when
   * the book is already rendered at `/`, so the hub passes `onWake` instead
   * to flip its own cold-open gate in place — `wakeHref` is the fallback for
   * mounts on a different route (e.g. tests).
   */
  wakeHref = "/",
  /**
   * Called once the player walks the final page, in lieu of navigating. The
   * hub uses this to reveal the base without a route change (the book lives
   * on `/`, so a push there wouldn't remount anything).
   */
  onWake,
}: {
  wakeHref?: string;
  onWake?: () => void;
}) {
  const router = useRouter();

  // Walking past the final page is the only place the cold-open is "consumed":
  // flip the localStorage gate so returning visitors don't re-read the Book,
  // then hand off (in-place reveal via `onWake`, or a route push as fallback).
  const handleComplete = useCallback(() => {
    try {
      window.localStorage.setItem(COLD_OPEN_STORAGE_KEY, "1");
    } catch {
      // localStorage unavailable (private mode / SSR) — proceed anyway.
    }
    if (onWake) onWake();
    else router.push(wakeHref);
  }, [onWake, router, wakeHref]);

  return (
    <CinematicBeatPlayer
      beats={COLD_OPEN_BOOK}
      onComplete={handleComplete}
      sigPrefix="cold-open"
      renderFrame={({ beat, index, total, isLast, children, advance }: RenderFrameArgs) => (
        <Panel
          as="article"
          tone="parchment"
          aria-label="Cold open"
          className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-8"
        >
          <header className="flex items-center justify-between gap-3">
            <Stamp>{beat.stamp}</Stamp>
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-60">
              {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
            </span>
          </header>

          <Rule />

          {children}

          {beat.footnote && (
            <>
              <Rule tone="muted" />
              <Footnote>{beat.footnote}</Footnote>
            </>
          )}

          <footer className="flex items-center justify-end pt-1">
            <Button intent="primary" size={isLast ? "lg" : "md"} onClick={advance}>
              {beat.cta} →
            </Button>
          </footer>
        </Panel>
      )}
    />
  );
}

/**
 * Returns true if the player has previously walked past the cold open.
 * Safe to call during SSR — returns false when `window` isn't around.
 */
export function hasConsumedColdOpen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(COLD_OPEN_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
