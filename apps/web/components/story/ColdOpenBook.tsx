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

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LedgerBody,
  LedgerFootnote,
  LedgerRule,
  LedgerStamp,
} from "@/components/ledger/Ledger";
import {
  COLD_OPEN_BOOK,
  COLD_OPEN_STORAGE_KEY,
} from "@/lib/story/coldOpen";

export function ColdOpenBook({
  /**
   * Where the final "Wake" button routes. Defaults to the first realm
   * in the canonical order; passed in by the landing page so tests can
   * override without stubbing the router.
   */
  wakeHref = "/play/fantasy",
}: {
  wakeHref?: string;
}) {
  const router = useRouter();
  const [pageIdx, setPageIdx] = useState(0);
  const isLast = pageIdx === COLD_OPEN_BOOK.length - 1;
  const beat = COLD_OPEN_BOOK[pageIdx]!;

  const advance = useCallback(() => {
    if (isLast) {
      try {
        window.localStorage.setItem(COLD_OPEN_STORAGE_KEY, "1");
      } catch {
        // localStorage unavailable (private mode / SSR) — proceed anyway.
      }
      router.push(wakeHref);
      return;
    }
    setPageIdx((i) => i + 1);
  }, [isLast, router, wakeHref]);

  return (
    <article
      aria-label="Cold open"
      className="mx-auto flex w-full max-w-2xl flex-col gap-5 rounded-md p-6"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.10)",
      }}
    >
      <header className="flex items-center justify-between gap-3">
        <LedgerStamp>{beat.stamp}</LedgerStamp>
        <span
          className="font-mono text-[10px] uppercase opacity-45"
          style={{ letterSpacing: "0.3em" }}
        >
          {String(pageIdx + 1).padStart(2, "0")} / {String(COLD_OPEN_BOOK.length).padStart(2, "0")}
        </span>
      </header>

      <LedgerRule />

      <div className="flex flex-col gap-3">
        {beat.body.map((line, i) => (
          <LedgerBody key={i}>{line}</LedgerBody>
        ))}
      </div>

      {beat.footnote && (
        <>
          <LedgerRule tone="muted" />
          <LedgerFootnote>{beat.footnote}</LedgerFootnote>
        </>
      )}

      <footer className="flex items-center justify-end pt-1">
        <button
          type="button"
          onClick={advance}
          className="rounded-md px-3 py-1.5 text-sm transition"
          style={{
            background: "var(--color-preset-bg, rgba(255,255,255,0.08))",
            color: "var(--color-preset-fg, #fff)",
            border:
              "1px solid var(--color-preset-accent, rgba(255,255,255,0.18))",
          }}
        >
          {beat.cta} →
        </button>
      </footer>
    </article>
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
