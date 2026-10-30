"use client";

/**
 * The date-due card, at a glance, on the Base — and the way into the Book.
 *
 * Two problems, one object. The Base was two sentences and a realm picker,
 * when it should be the room that matters: it is where the card lives, and the
 * card is the reason the player can't simply leave. And the Book was
 * undiscoverable — an icon-only pill in the far corner, with the dock's own
 * source asserting no first-time affordance was needed because "the player
 * already knows they have it". A player finished a whole page without knowing
 * it existed, so that assumption is simply false.
 *
 * Pressing the strip opens the Book's card tab. The strip is the summary; the
 * Book is the thing itself. Nothing here is a second source of truth: the
 * state comes from `dueDateCard()` — the same function `BookPanel` renders —
 * which maps `REALM_ORDER` through `lockStateFor()`, so the strip, the Book,
 * the realm picker and the Altar all answer "which pages are open?" from one
 * place and cannot drift.
 *
 * ── Compact on purpose ─────────────────────────────────────────────────────
 * This is not `<DueDateCard/>` moved onto the Base. That component carries the
 * other borrowers' rows and every stamp's date; mounting it here would put the
 * whole artifact above the picker and leave the Book with nothing left to
 * open. One row: three slots, the tear, and the one sentence about what three
 * stamps buy.
 */

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { PlayerSigil } from "@/components/art/PlayerSigil";
import { useTutorialProgress } from "@/lib/reads/hooks";
import { emptyTutorialProgress } from "@/lib/tutorial/progress";
import { dueDateCard, signetLine, type CardStamp } from "@/lib/story/card";
import { emitDockOpen } from "@/lib/ui/dock-bus";

/** Hand-pressed, not machine-set. Matches `DueDateCard`'s tilts. */
const TILT = ["-2.5deg", "1.8deg", "-1.2deg"];

export function CardStrip({
  /**
   * Whether the borrower has signed the card. Owned by the caller for the
   * same reason `BookPanel` takes it: the fact lives behind
   * `hasConsumedColdOpen()`, and `dueDateCard` is a pure module that refuses
   * to go and fetch it.
   */
  signed,
}: {
  signed: boolean;
}) {
  const { address } = useAccount();
  // Same React Query key the hub and dock already warm, so this is a cache
  // read rather than another fan-out.
  const { data } = useTutorialProgress(address);

  /*
   * Hydration hold. `dueDateCard` is pure, but `signed` is derived from
   * localStorage by the caller, so rendering the real state on the server
   * pass and a different one after mount would reflow the Base under the
   * player — the anti-pattern documented at `app/play/[preset]/page.tsx`.
   * The dock solves it the same way.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const card = dueDateCard({ progress: data ?? emptyTutorialProgress(), signed });

  return (
    // Stacks below `sm`. As a single row at 375px the three fixed-width slots
    // and the arrow left the prose about 110px to wrap in, which turned a
    // one-line strip into a 180px block of ragged mono — measured in a
    // browser, not guessed. Stacked, the slots keep their row and the sentence
    // gets the full width.
    <button
      type="button"
      onClick={() => emitDockOpen("book")}
      aria-label={`Your date-due card: ${card.stampCount} of ${card.stamps.length} stamped. Open the Book.`}
      className="group flex w-full flex-col gap-2 rounded-md border border-dashed border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3 text-left transition-colors hover:border-[var(--color-preset-accent)] hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-preset-accent)] sm:flex-row sm:items-center sm:gap-4"
    >
      {/* Three slots. Fixed-width so the row never reflows as stamps land,
          and `shrink-0` so the prose beside them is what gives first. */}
      <span aria-hidden className="flex shrink-0 items-center gap-2">
        {card.stamps.map((stamp) => (
          <Slot key={stamp.preset} stamp={stamp} address={address} />
        ))}
      </span>

      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] opacity-60">
          The date-due card
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] opacity-80">
          {card.stampCount} / {card.stamps.length} stamped · {signetLine(card)}
        </span>
        {/* The tear is why authorship is the only way on, so it never stops
            being visible — same rule as `DueDateCard`. */}
        {card.returnColumnTorn && (
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-danger)] opacity-70">
            Return column torn
          </span>
        )}
      </span>

      {/* Hidden when stacked: it's an affordance hint, and the whole strip is
          the button — on a touch viewport it costs a column and earns
          nothing. */}
      <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] opacity-50 transition-opacity group-hover:opacity-90 sm:ml-auto sm:block">
        Read →
      </span>
    </button>
  );
}

/**
 * One slot. The crest is the player's address drawn, so all three are the same
 * shape — the variety comes from ink and angle, exactly as on the full card:
 * `data-preset` re-resolves `--color-preset-accent` through the cascade and
 * `PlayerSigil` strokes in `currentColor`.
 */
function Slot({
  stamp,
  address,
}: {
  stamp: CardStamp;
  address?: `0x${string}`;
}) {
  const tilt = TILT[stamp.slot - 1] ?? "0deg";

  return (
    <span
      data-preset={stamp.preset}
      className="flex h-8 w-8 items-center justify-center rounded-[3px] border border-dashed border-current/35"
      style={{ color: "var(--color-preset-accent)" }}
    >
      {stamp.state === "stamped" ? (
        <span style={{ transform: `rotate(${tilt})` }} className="block">
          <PlayerSigil address={address} size={22} />
        </span>
      ) : (
        <span
          className="block h-[22px] w-[22px] rounded-full border border-dashed border-current/25"
          // A sealed slot is dimmer than an open one: the player can reach an
          // open page today and cannot reach a sealed one at all.
          style={{ opacity: stamp.state === "sealed" ? 0.4 : 1 }}
        />
      )}
    </span>
  );
}
