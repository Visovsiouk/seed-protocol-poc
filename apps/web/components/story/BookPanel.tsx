"use client";

/**
 * `<BookPanel/>` — the Book, in the dock. The artifact the player carries.
 *
 * This is the spine of the story's delivery. The previous design put
 * narrative in modals that appear, get clicked through, and are gone; this
 * puts it in an object that is always within reach and fills in as the player
 * plays. Three tabs, because the book has three things in it:
 *
 *   - **Card** — the date-due card. Progress, as an object rather than a
 *     sentence: three stamp slots, the other borrowers' rows, the torn return
 *     column.
 *   - **Margins** — notes left by borrowers who got back out. Collected
 *     during runs (see `lib/story/marginalia.ts`), read here.
 *   - **Pages** — one per realm. A page the borrower hasn't stamped is
 *     rendered *illegible* rather than labelled "locked", which is both
 *     truer to the fiction and a better tease than lock copy ever was.
 *
 * ── Why tabs rather than three stacked sections ────────────────────────────
 * The dock popover is `max-h-[70dvh] w-[min(26rem,…)]`. Stacking the card,
 * every collected margin note and three pages into one column would be a
 * multi-thousand-pixel scroll inside a short popover. Tabs keep each view
 * glanceable, which is the point of a dock surface.
 *
 * ── A11y ───────────────────────────────────────────────────────────────────
 * Hand-rolled `role="tablist"` with arrow-key roving — `useRovingGrid` is
 * grid-shaped and overkill for three buttons. Deliberately NOT a modal: the
 * dock is explicit that its popovers have no focus trap, so this adds none.
 */

import { useCallback, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { Body, Stamp } from "@/components/ui";
import { DueDateCard } from "@/components/story/DueDateCard";
import { MarginLine, MarginSignature } from "@/components/story/voices";
import { useTutorialProgress } from "@/lib/reads/hooks";
import { emptyTutorialProgress } from "@/lib/tutorial/progress";
import { dueDateCard } from "@/lib/story/card";
import { PAGES } from "@/lib/story/canon";
import { REALM_ORDER } from "@/lib/story/progression";
import { noteSignature, type MarginNote } from "@/lib/story/marginalia";

type Tab = "card" | "margins" | "pages";

const TABS: { id: Tab; label: string }[] = [
  { id: "card", label: "Card" },
  { id: "margins", label: "Margins" },
  { id: "pages", label: "Pages" },
];

export function BookPanel({
  /** Notes the borrower has found, newest first. */
  margins = [],
  /** Whether the borrower has signed the card (owned by the caller). */
  signed,
}: {
  margins?: readonly MarginNote[];
  signed: boolean;
}) {
  const { address } = useAccount();
  // Same query key as the dock's `useCodexStatus` already warms, so this is a
  // cache read rather than a second fetch.
  const { data } = useTutorialProgress(address);
  const progress = data ?? emptyTutorialProgress();
  const card = dueDateCard({ progress, signed });

  const [tab, setTab] = useState<Tab>("card");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = useCallback((e: React.KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
    setTab(TABS[next]!.id);
    tabRefs.current[next]?.focus();
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <Stamp>The Book</Stamp>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] opacity-55">
          uncatalogued
        </span>
      </div>

      <div role="tablist" aria-label="The Book" className="flex gap-1">
        {TABS.map((t, i) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`book-tab-${t.id}`}
              aria-selected={active}
              aria-controls={`book-panel-${t.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={[
                "flex-1 rounded-[3px] border px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] transition-opacity",
                active
                  ? "border-[var(--border-2)] bg-[var(--surface-2)] opacity-100"
                  : "border-[var(--border-1)] opacity-60 hover:opacity-85",
              ].join(" ")}
            >
              {t.label}
              {t.id === "margins" && margins.length > 0 && (
                <span className="ml-1 opacity-70">{margins.length}</span>
              )}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`book-panel-${tab}`}
        aria-labelledby={`book-tab-${tab}`}
        tabIndex={0}
      >
        {tab === "card" && <DueDateCard card={card} address={address} />}
        {tab === "margins" && <Margins notes={margins} />}
        {tab === "pages" && <Pages card={card} />}
      </div>
    </div>
  );
}

function Margins({ notes }: { notes: readonly MarginNote[] }) {
  if (notes.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <Body size="sm">
          Nothing yet. Others wrote in here; the writing turns up where they
          left it, which is not where you would have put it.
        </Body>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {notes.map((n) => (
        <li
          key={n.id}
          className="flex flex-col gap-1 border-l border-[var(--border-2)] pl-3"
        >
          <MarginLine size="sm">{n.text}</MarginLine>
          <MarginSignature>
            {noteSignature(n)} · {n.date}
          </MarginSignature>
        </li>
      ))}
    </ul>
  );
}

/**
 * One row per page. A page the borrower hasn't been to is unreadable — real
 * blur over real text, rather than a lock icon and a tease.
 *
 * The blurred node is `aria-hidden` with an `sr-only` sibling carrying the
 * state in words: blur is a visual effect with no meaning in the
 * accessibility tree, and it is *not* motion, so `prefers-reduced-motion`
 * neither does nor should remove it.
 */
function Pages({ card }: { card: ReturnType<typeof dueDateCard> }) {
  return (
    <ul className="flex flex-col gap-3">
      {REALM_ORDER.map((preset) => {
        const page = PAGES[preset];
        const slot = card.stamps.find((s) => s.preset === preset)!;
        const legible = slot.state !== "sealed";

        return (
          <li
            key={preset}
            data-preset={preset}
            className="flex flex-col gap-1 border-l border-[var(--border-1)] pl-3"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span
                className="font-mono text-[10px] uppercase tracking-[0.18em]"
                style={{ color: "var(--color-preset-accent)" }}
              >
                {page.name}
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] opacity-50">
                {slot.state === "stamped" ? "stamped" : slot.state}
              </span>
            </div>

            {legible ? (
              <Body size="sm">{REVISION_NOTE[page.revision]}</Body>
            ) : (
              <>
                <span className="sr-only">
                  This page is unreadable. You have not been here yet.
                </span>
                <span
                  aria-hidden
                  className="select-none font-mono text-[13px] italic leading-[1.75] opacity-45 blur-[3px]"
                >
                  {REVISION_NOTE[page.revision]}
                </span>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * How far his revision has reached, in the Book's voice — description only,
 * never explanation. Read in play order these walk toward the finished edge,
 * because he works from the back of the book forward.
 */
const REVISION_NOTE: Record<string, string> = {
  unreached: "Still wet. Something is growing in it that nobody has pruned.",
  underway: "Half-set. Neon curing on wet concrete, and the edits are recent.",
  finished: "Sealed, and cold. Nothing moves. The last line is already written.",
};
