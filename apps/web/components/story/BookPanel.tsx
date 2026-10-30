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

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { Body, Stamp } from "@/components/ui";
import { DueDateCard } from "@/components/story/DueDateCard";
import { MarginLine, MarginSignature } from "@/components/story/voices";
import { useTutorialProgress } from "@/lib/reads/hooks";
import { emptyTutorialProgress } from "@/lib/tutorial/progress";
import { dueDateCard } from "@/lib/story/card";
import { PAGES } from "@/lib/story/canon";
import { REALM_ORDER } from "@/lib/story/progression";
import {
  marginHands,
  noteSignature,
  type MarginHandId,
  type MarginNote,
} from "@/lib/story/marginalia";
import type { MarginsCollection } from "@/lib/story/use-margins";
import type { Preset } from "@/lib/engine/types";
import { loadCrossings, type Crossing } from "@/lib/story/crossings-local";

type Tab = "card" | "margins" | "pages";

const TABS: { id: Tab; label: string }[] = [
  { id: "card", label: "Card" },
  { id: "margins", label: "Margins" },
  { id: "pages", label: "Pages" },
];

const NO_MARGINS: MarginsCollection = { found: new Map(), mine: [], count: 0 };

export function BookPanel({
  /** What the borrower has read, and where each note turned up. */
  margins = NO_MARGINS,
  /** Whether the borrower has signed the card (owned by the caller). */
  signed,
}: {
  margins?: MarginsCollection;
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

  /*
   * Crossings, read when the pages tab is actually opened — same reasoning as
   * `useFoundMargins`: a crossing is only ever written at a descent
   * threshold, and this panel is only ever read from the dock, so opening the
   * tab is exactly the moment the list can have changed. Reading in an effect
   * rather than during render keeps localStorage out of the server pass.
   */
  const [crossings, setCrossings] = useState<Crossing[]>([]);
  useEffect(() => {
    if (tab !== "pages") return;
    setCrossings(loadCrossings(address));
  }, [tab, address]);

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
              {t.id === "margins" && margins.count > 0 && (
                <span className="ml-1 opacity-70">{margins.count}</span>
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
        {tab === "margins" && <Margins margins={margins} />}
        {tab === "pages" && <Pages card={card} crossings={crossings} />}
      </div>
    </div>
  );
}

/**
 * The margins, as a correspondence rather than a log.
 *
 * ── What was wrong ─────────────────────────────────────────────────────────
 * This used to be one flat newest-first list of every note the player had
 * found. Thirty-nine fragments by three people across a hundred and thirty
 * years, shuffled into the order the player happened to clear rooms in, with
 * no indication of whose hand you were reading or what you were missing. The
 * notes were never the problem — each one is written to survive being read
 * first, cold, mid-run. The view threw away everything that made the
 * collection worth keeping afterwards.
 *
 * ── What it does now ───────────────────────────────────────────────────────
 * Groups by hand (`marginHands()`), keeps each hand's notes in the order that
 * hand wrote them, and renders the ones still missing as blank ruled lines —
 * so the shape of what you don't have is visible, and a hand is something you
 * can finish. Each found note also shows the page it turned up on, which is
 * the canon's own answer to how a note from 1911 is legible in 2041.
 *
 * ── Accordion, not a modal ─────────────────────────────────────────────────
 * One hand open at a time, because the dock popover is `max-h-[70dvh]` and six
 * hands' worth of notes and gaps is a multi-thousand-pixel scroll otherwise.
 * Plain buttons with `aria-expanded`/`aria-controls` and **no focus trap** —
 * the dock is explicit that its popovers are not modals and Tab must still
 * walk out of them.
 */
function Margins({
  margins,
}: {
  margins: MarginsCollection;
}) {
  const hands = marginHands();
  // `null` means every hand is closed, which is the honest starting state:
  // the player opened a tab, not a person.
  const [open, setOpen] = useState<MarginHandId | "mine" | null>(null);

  const total = hands.reduce((n, h) => n + h.notes.length, 0);

  if (margins.count === 0 && margins.mine.length === 0) {
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
    <div className="flex flex-col gap-2">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] opacity-55">
        {margins.count} of {total} read
      </p>

      {/* The player's own hand. Stored as rendered rather than as bank ids,
          so it has no entry in `marginHands()` and gets its own section —
          and it is the only hand with no gaps to show, because the book
          writes a new one each time rather than drawing from a bank. */}
      {margins.mine.length > 0 && (
        <Section
          id="mine"
          label="your own hand"
          meta={`${margins.mine.length} ${margins.mine.length === 1 ? "note" : "notes"}`}
          open={open === "mine"}
          onToggle={() => setOpen(open === "mine" ? null : "mine")}
        >
          <ul className="flex flex-col gap-4">
            {margins.mine.map((n) => (
              <FoundNote key={n.id} note={n} on={null} />
            ))}
          </ul>
        </Section>
      )}

      {hands.map((hand) => {
        const read = hand.notes.filter((n) => margins.found.has(n.id)).length;
        return (
          <Section
            key={hand.id}
            id={hand.id}
            label={hand.signature}
            meta={`${read} of ${hand.notes.length}${hand.year ? ` · ${hand.year}` : ""}`}
            open={open === hand.id}
            onToggle={() => setOpen(open === hand.id ? null : hand.id)}
          >
            <ul className="flex flex-col gap-4">
              {hand.notes.map((n) =>
                margins.found.has(n.id) ? (
                  <FoundNote
                    key={n.id}
                    note={n}
                    on={margins.found.get(n.id) ?? null}
                  />
                ) : (
                  <MissingNote key={n.id} />
                ),
              )}
            </ul>
          </Section>
        );
      })}
    </div>
  );
}

function Section({
  id,
  label,
  meta,
  open,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  meta: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-[var(--border-1)]/70 pt-2 first:border-t-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`margin-hand-${id}`}
        className="flex w-full items-baseline justify-between gap-3 py-1 text-left transition-opacity hover:opacity-100"
        style={{ opacity: open ? 1 : 0.75 }}
      >
        <span className="min-w-0 truncate font-[family-name:var(--font-margin)] text-[15px]">
          {label}
        </span>
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.16em] tabular-nums opacity-60">
          {meta}
        </span>
      </button>
      {open && (
        <div id={`margin-hand-${id}`} className="pb-2 pt-2">
          {children}
        </div>
      )}
    </div>
  );
}

function FoundNote({
  note,
  on,
}: {
  note: MarginNote;
  on: Preset | null;
}) {
  return (
    <li className="flex flex-col gap-1 border-l border-[var(--border-2)] pl-3">
      <MarginLine size="sm">{note.text}</MarginLine>
      <MarginSignature>
        {noteSignature(note)} · {note.date}
      </MarginSignature>
      {/* Where it surfaced, which is rarely where it was written. Absent for
          finds recorded before the store kept the page — see margins-local. */}
      {on && (
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] opacity-45">
          found on {PAGES[on].name}
        </span>
      )}
    </li>
  );
}

/**
 * A note this hand wrote that the player has not turned up.
 *
 * A ruled blank rather than a lock or a count: the page is there, the writing
 * on it simply hasn't been read yet. This is what turns the tab from a feed
 * into something with a shape you can see the end of.
 */
function MissingNote() {
  return (
    <li className="flex flex-col gap-1 border-l border-dashed border-[var(--border-1)] pl-3">
      <span className="sr-only">An unread note by this hand.</span>
      <span
        aria-hidden
        className="block h-[1px] w-full bg-[var(--border-2)] opacity-40"
        style={{ marginTop: "0.75rem", marginBottom: "0.75rem" }}
      />
    </li>
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
 *
 * A legible page also lists the pages whose writing the player has carried
 * into it. That is the canon's own answer to how a medieval sword works in
 * 2041 — the binding connects the pages and writing carries between them —
 * and this is the only place in the game it is recorded rather than asserted
 * once at a descent threshold and forgotten. See `crossings-local.ts`.
 */
function Pages({
  card,
  crossings,
}: {
  card: ReturnType<typeof dueDateCard>;
  crossings: readonly Crossing[];
}) {
  return (
    <ul className="flex flex-col gap-3">
      {REALM_ORDER.map((preset) => {
        const page = PAGES[preset];
        const slot = card.stamps.find((s) => s.preset === preset)!;
        const legible = slot.state !== "sealed";
        // Oldest first, so the list reads in the order the player carried.
        const carriedIn = crossings
          .filter((c) => c.to === preset)
          .map((c) => PAGES[c.from].name);

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

            {/* Only on a legible page: naming what you carried into a page you
                have never opened would hand you its name a beat early, which
                is the whole thing the blur above protects. */}
            {legible && carriedIn.length > 0 && (
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] opacity-55">
                Your writing from {carriedIn.join(" · ")} is legible here.
              </p>
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
