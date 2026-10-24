"use client";

/**
 * `<ColdOpenBook/>` — the opening. Rendered on `/` when
 * `progress.starterClears === 0` and the `COLD_OPEN_STORAGE_KEY` flag isn't
 * set. Walking past the final page sets the flag so returning visitors don't
 * read it twice.
 *
 * ── What this frame adds over a click-through ──────────────────────────────
 * Three of the beats carry `gate: "interaction"`, and this component supplies
 * the acts: **pull the card**, **read your own handwriting on it**, **sign
 * it**. While a gate is unmet the beat player disarms Enter and refuses to
 * auto-advance, so the page cannot be skimmed past — the trap closes on
 * something the player did.
 *
 * The acts are also *sticky*, tracked here rather than in the player's
 * per-beat gate state: once the card is out of the pocket it stays on screen
 * for the rest of the opening, filling in as the player acts on it. That is
 * the whole design of the story's delivery in miniature — an artifact the
 * player handles, not a modal that describes one — and it means the final
 * beat lands with the evidence still in view.
 *
 * Beats live in `lib/story/coldOpen.ts`; the card is `CardEntries`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Panel, Body, Button, Footnote, Rule, Stamp } from "@/components/ui";
import {
  CinematicBeatPlayer,
  type RenderFrameArgs,
} from "@/components/story/CinematicBeatPlayer";
import { CardEntries } from "@/components/story/CardEntries";
import { MarginSignature } from "@/components/story/voices";
import { COLD_OPEN_BOOK, COLD_OPEN_STORAGE_KEY } from "@/lib/story/coldOpen";

/** The three acts, in the order their gated beats appear. */
type Act = "pull" | "read" | "sign";
const ACTS: readonly Act[] = ["pull", "read", "sign"];

export function ColdOpenBook({
  /**
   * Where the final button routes when no `onWake` is given. Defaults to the
   * pocket-realm hub at `/`. Note `router.push("/")` is a no-op when the book
   * is already rendered at `/`, so the hub passes `onWake` instead to flip its
   * own cold-open gate in place — `wakeHref` is the fallback for mounts on a
   * different route (e.g. tests).
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

  // Sticky record of what the player has done to the card. Separate from the
  // player's `gateMet`, which resets every beat by design.
  const [done, setDone] = useState<Record<Act, boolean>>({
    pull: false,
    read: false,
    sign: false,
  });

  /**
   * Whether the player declined to sign.
   *
   * Signing used to be the only button, which meant the story asserted the
   * player had made a mistake at the exact moment it gave them no say — so
   * the mistake read as somebody else's. Refusing is a real option now, and
   * the card turns out to be *already* signed either way, in their hand,
   * dated tonight. That is the hook from page one paying itself off.
   *
   * The two paths deliberately print the same lines (`afterGate` in
   * coldOpen.ts). An earlier version branched the prose, which quietly made
   * refusal the interesting choice and signing the dull one — when the beat
   * is that the choice was never load-bearing. Hence no `refused` state here:
   * the frame records *that* an act happened, never which button did it.
   */

  /**
   * Today's date for the borrower's own row.
   *
   * Read after mount, never during render: `CardEntries` is server-rendered
   * on the first pass and a clock read would differ between the server and
   * hydration. Same mismatch class the play page documents. Until this
   * lands the row reads "tonight", which is correct rather than a flash of
   * wrong content.
   */
  const [today, setToday] = useState<string | undefined>(undefined);
  useEffect(() => {
    setToday(new Date().toISOString().slice(0, 10));
  }, []);

  /**
   * Beat index → which act it gates.
   *
   * Derived by walking the beats rather than hardcoding indices, so inserting
   * or reordering a *narrative* beat can't silently repoint an act at the
   * wrong page. Only the relative order of the gated beats matters.
   */
  const actByIndex = useMemo(() => {
    const map = new Map<number, Act>();
    let n = 0;
    COLD_OPEN_BOOK.forEach((beat, i) => {
      if (beat.gate === "interaction" && n < ACTS.length) {
        map.set(i, ACTS[n]!);
        n += 1;
      }
    });
    return map;
  }, []);

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
      renderFrame={({
        beat,
        index,
        total,
        isLast,
        children,
        advance,
        gated,
        satisfyGate,
      }: RenderFrameArgs) => {
        const act = actByIndex.get(index);

        const perform = () => {
          if (act) setDone((d) => ({ ...d, [act]: true }));
          satisfyGate();
        };

        /**
         * The consequence of a gated act, once performed.
         *
         * Generic over any beat carrying `afterGate` rather than special-cased
         * to the signing page, and the prose itself lives in `coldOpen.ts`.
         * Both of those are deliberate: written as JSX here it was invisible
         * to `coldOpen.test.ts`'s word budget, which is how this beat came to
         * put ~74 words on screen against a ceiling of 25.
         *
         * There is no longer a refused/signed fork — the two buttons resolve
         * to the same lines, which is the beat rather than a shortcut past it.
         */
        const aftermath =
          !gated && beat.afterGate?.length ? (
            <div className="flex flex-col gap-2">
              {beat.afterGate.map((line) => (
                <Body key={line}>{line}</Body>
              ))}
            </div>
          ) : null;

        return (
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

            {/* Once out of the pocket, the card stays for the rest of the
                opening and fills in as the player acts on it. */}
            {done.pull && (
              <CardEntries
                freshRow={done.read}
                signed={done.sign}
                freshDate={today}
                className="mt-1"
              />
            )}

            {aftermath}

            {beat.footnote && (
              <>
                <Rule tone="muted" />
                {/* A margin beat's footnote is the borrower's signature, so it
                    renders in their hand rather than as a stamped caption. */}
                {beat.voice === "margin" ? (
                  <MarginSignature>{beat.footnote}</MarginSignature>
                ) : (
                  <Footnote>{beat.footnote}</Footnote>
                )}
              </>
            )}

            <footer className="flex items-center justify-end gap-2 pt-1">
              {gated ? (
                // The act itself. Deliberately not also the page turn: doing
                // the thing and choosing to move on stay two decisions, so
                // the player gets a beat to look at what they just did.
                <>
                  {act === "sign" && (
                    // The refusal has to be a real button, weighted like a
                    // real option — a ghost CTA the player assumes is a
                    // decoration would be worse than not offering it. It
                    // resolves exactly as signing does; see `afterGate`.
                    <Button intent="ghost" size="md" onClick={perform}>
                      Close the book
                    </Button>
                  )}
                  <Button intent="primary" size="md" onClick={() => perform()}>
                    {beat.cta}
                  </Button>
                </>
              ) : (
                <Button
                  intent="primary"
                  size={isLast ? "lg" : "md"}
                  onClick={advance}
                >
                  {act ? "Go on" : beat.cta} →
                </Button>
              )}
            </footer>
          </Panel>
        );
      }}
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
