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
 * ── Deliberately NOT persisted ─────────────────────────────────────────────
 * The epitaph's id goes into the margins store (that's how a death joins the
 * collected notes), but the *text* does not: the bank is deterministic in the
 * run seed, so the note recomposes identically forever without storing a word.
 * A generated upgrade is therefore transient by design — it belongs to the
 * moment the player died, and the canonical note is the one the book can
 * always rewrite from the seed.
 */
export function useEpitaph(facts: EpitaphFacts | undefined): MarginNote | undefined {
  // Keyed on the identity of the death, so a re-render never re-fetches and a
  // *new* death always does. Stringified rather than object-compared because
  // `facts` is rebuilt by the caller's `useMemo` on unrelated state changes.
  const key = facts
    ? `${facts.runSeed}:${facts.depth}:${facts.killedBy}:${facts.turns}:${facts.carried}`
    : "";

  const [generated, setGenerated] = useState<{ key: string; text: string } | null>(
    null,
  );
  const askedRef = useRef<string>("");

  useEffect(() => {
    if (!facts || !storyAiClientHint) return;
    // One request per death, even under strict-mode double-invocation.
    if (askedRef.current === key) return;
    askedRef.current = key;

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
            runSeed: facts.runSeed,
            preset: facts.preset,
            depth: facts.depth,
            killedBy: facts.killedBy,
            wasBookmark: facts.wasBookmark,
            turns: facts.turns,
            carried: facts.carried,
          }),
          signal: ctrl.signal,
        });
        if (!res.ok) return;

        const json = (await res.json()) as Partial<EpitaphResponse>;
        // `source: "bank"` means the server already fell back, and it fell
        // back to the exact text this hook is rendering — so there is nothing
        // to swap in. Checked explicitly to make that a no-op rather than a
        // pointless state update that re-renders the overlay.
        if (json.source !== "model") return;

        const clean = sanitizeEpitaph(json.text);
        if (clean) setGenerated({ key, text: clean });
      } catch {
        // Abort, offline, parse failure — all the same non-event. The player
        // has a note either way, and a death screen must never surface a
        // narration error.
      } finally {
        window.clearTimeout(timer);
      }
    })();

    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [facts, key]);

  if (!facts) return undefined;

  const base = epitaphFallback(facts);
  // Guard on `key`: a generated line from the *previous* death must never
  // survive into the next one's overlay.
  if (generated && generated.key === key) {
    return { ...base, text: generated.text };
  }
  return base;
}
