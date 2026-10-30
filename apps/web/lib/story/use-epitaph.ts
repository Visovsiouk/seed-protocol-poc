"use client";

import { useEffect, useRef, useState } from "react";

import { storyAiClientHint } from "@/lib/env";
import { epitaphFallback, type EpitaphFacts } from "./epitaph-bank";
import { sanitizeEpitaph, type EpitaphResponse } from "./epitaph-wire";
import type { MarginNote } from "./marginalia";

/**
 * The note the book writes about this death — bank first, model second.
 *
 * ── The shape of this hook is the whole design ─────────────────────────────
 * It returns a complete, correct `MarginNote` **synchronously on the first
 * render**, from `epitaphFallback`. There is no loading state, no spinner, and
 * no empty slot, because the defeat overlay must never wait on narration to
 * tell a player what happened to them. If a generated line arrives it swaps in
 * underneath; if it never arrives, nothing happened.
 *
 * With `NEXT_PUBLIC_STORY_AI` unset — the default — no request is made at all
 * and this is a pure function of the run's facts.
 *
 * ── Why the client re-sanitises ────────────────────────────────────────────
 * The route already ran `sanitizeEpitaph`, and in production that is the same
 * code. Running it again is cheap insurance against the one case that matters:
 * a response from a stale deployment, a proxy, or a route someone has since
 * edited. The rule the filter encodes — generated prose is never shown
 * unreviewed — is worth enforcing at the point of render too.
 *
 * ── Why it reports `settled` ───────────────────────────────────────────────
 * The note is *persisted* by the caller (`epitaphs-local.ts` keeps the note as
 * rendered, so the Book never shows a player different words than the ones
 * they died to). That write therefore has to happen after this hook has
 * stopped changing its mind, or it records the bank line and the player reads
 * the generated one — a margin note that rewrites itself between readings,
 * which is the exact failure the store was built to avoid. `settled` is that
 * signal: true when nothing further will arrive, immediately so on the default
 * flag-off path.
 */
export function useEpitaph(facts: EpitaphFacts | undefined): {
  note: MarginNote | undefined;
  settled: boolean;
} {
  // Keyed on the identity of the death, so a re-render never re-fetches and a
  // *new* death always does. Stringified rather than object-compared because
  // `facts` is rebuilt by the caller's `useMemo` on unrelated state changes.
  // Covers every field the request body sends, so two deaths that differ only
  // in `preset` or `wasBookmark` cannot share an answer.
  const key = facts
    ? `${facts.runSeed}:${facts.preset}:${facts.depth}:${facts.killedBy}:${facts.wasBookmark}:${facts.turns}:${facts.carried}`
    : "";

  const [generated, setGenerated] = useState<{ key: string; text: string } | null>(
    null,
  );
  // The key whose request has reached a terminal state. State rather than a
  // ref because the caller gates a write on it and so has to re-render.
  const [settledKey, setSettledKey] = useState<string | null>(null);

  // Read inside the request effect instead of depended on. `facts` is an
  // object identity the caller rebuilds on unrelated state changes, and
  // depending on it meant every such change tore down an in-flight request —
  // which, paired with a latch that was set before the fetch and never
  // cleared, discarded the answer permanently. `key` is the real identity of
  // the work, and it encodes every field the request body reads.
  //
  // Assigned in an effect rather than during render: a render React discards
  // must not be able to leave anything behind, and this hook is mounted inside
  // a strict-mode double-invoke. Declared above the request effect so it has
  // already run by the time that one fires on the same commit.
  const factsRef = useRef(facts);
  useEffect(() => {
    factsRef.current = facts;
  }, [facts]);

  useEffect(() => {
    const current = factsRef.current;
    if (!current || !storyAiClientHint) return;

    const ctrl = new AbortController();
    // The server has its own (tighter) ceiling; this one exists for the case
    // where the request never reaches it. Aborting is a non-event — the bank
    // note is already on screen.
    const timer = window.setTimeout(() => ctrl.abort(), 10_000);

    (async () => {
      try {
        const res = await fetch("/api/story/epitaph", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            runSeed: current.runSeed,
            preset: current.preset,
            depth: current.depth,
            killedBy: current.killedBy,
            wasBookmark: current.wasBookmark,
            turns: current.turns,
            carried: current.carried,
          }),
          signal: ctrl.signal,
        });
        if (!res.ok) {
          setSettledKey(key);
          return;
        }

        const json = (await res.json()) as Partial<EpitaphResponse>;
        // `source: "bank"` means the server already fell back, and it fell
        // back to the exact text this hook is rendering — so there is nothing
        // to swap in. Checked explicitly to make that a no-op rather than a
        // pointless state update that re-renders the overlay.
        if (json.source !== "model") {
          setSettledKey(key);
          return;
        }

        const clean = sanitizeEpitaph(json.text);
        if (clean) setGenerated({ key, text: clean });
        // Settled either way: a rejected answer means the bank note is final.
        setSettledKey(key);
      } catch {
        // Abort, offline, parse failure — all the same non-event. The player
        // has a note either way, and a death screen must never surface a
        // narration error.
        //
        // Deliberately does NOT settle. An abort is the one outcome that is
        // not an answer: strict mode aborts the first of its two mounts, and
        // settling here would both mark a death final before its real request
        // landed and let the caller persist a bank note it is about to
        // replace. Every genuine outcome settles above.
      } finally {
        window.clearTimeout(timer);
      }
    })();

    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [key]);

  if (!facts) return { note: undefined, settled: true };

  const base = epitaphFallback(facts);
  // Nothing is coming on the default path, so the bank note is final on the
  // first render — the overlay and the Book agree without waiting.
  const settled = !storyAiClientHint || settledKey === key;

  // Guard on `key`: a generated line from the *previous* death must never
  // survive into the next one's overlay.
  if (generated && generated.key === key) {
    return { note: { ...base, text: generated.text }, settled };
  }
  return { note: base, settled };
}
