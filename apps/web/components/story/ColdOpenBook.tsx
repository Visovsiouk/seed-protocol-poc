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
   * the mistake read as somebody else's. Refusing is now a real option, and
   * it is the better beat: the card is *already* signed, in their hand,
   * dated tonight. That is the hook from page one paying itself off, and a
   * player who refuses gets a stronger scene than one who complies.
   */
  const [refused, setRefused] = useState(false);

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

        const perform = (declined = false) => {
          if (act) setDone((d) => ({ ...d, [act]: true }));
          if (declined) setRefused(true);
          satisfyGate();
        };

        // What the book does once the signing act is resolved. Both paths end
        // at the same place — the line gets signed either way — which is the
        // point: refusing proves the loop was already closed.
        //
        // The countersign then gets its meaning. `fin.` is the word printed
        // at the end of a finished work, written under a borrower who has
        // only just started: a verdict, not a signature. It is the thesis the
        // whole game argues against, and the ending (pressing a signet into a
        // blank quire) is literally writing past it. Stated as description —
        // the Book never explains, and nobody is named here.
        const signingAftermath =
          act === "sign" && !gated ? (
            <div className="flex flex-col gap-2">
              {refused ? (
                <Body>
                  You close it. When you look again the line is signed, in your
                  hand, dated tonight. It was always signed.
                </Body>
              ) : (
                <Body>Your hand knows the shape of it before you do.</Body>
              )}
              <Body>
                Something writes one word underneath, in a hand that is not
                yours. Fin. What gets printed at the end of a finished book.
              </Body>
              <Body>
                Your entry is closed. You have not taken a step yet.
              </Body>
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

            {signingAftermath}

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
                    // decoration would be worse than not offering it.
                    <Button
                      intent="ghost"
                      size="md"
                      onClick={() => perform(true)}
                    >
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
