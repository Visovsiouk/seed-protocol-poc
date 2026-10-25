"use client";

/**
 * `<PageEntryBeat/>` — the book, describing the page you are about to go down.
 *
 * This prose already existed; nobody read it. It was an italic line in a
 * metadata aside stacked above a live fight, between a trial-mode warning and
 * `preset · final boss · max tier · owner`. A paragraph about who wrote this
 * page and what has been happening to it cannot compete with a monster's HP
 * bar two inches below it, and it is the only thing in the game that makes a
 * player-authored realm feel authored rather than configured.
 *
 * So it gets the same slot `GearTranslationScreen` occupies: a gated screen
 * before the run boots, sized and styled as that screen's sibling. The two
 * play in sequence on a cross-genre descent into a creator page — the book
 * describes where you are, then your gear re-shapes to it — which is also the
 * right order, since the second only makes sense once you know whose page is
 * doing the re-shaping.
 *
 * The dry metadata line stays where it was. A creator checking their own realm
 * wants the ids and the tier; that is a different reader with a different
 * question, and this beat is not for them.
 */

import { motion, useReducedMotion } from "framer-motion";
import type { Preset } from "@/lib/engine/types";
import { Body, Button, Rule, Stamp } from "@/components/ui";
import { KbdHint } from "@/components/game/ChoiceRow";
import { useEnterToActivate } from "@/lib/ui/useEnterToActivate";
import { warpCrossfade, withReducedMotion } from "@/lib/ui/motion";

export function PageEntryBeat({
  pageName,
  /** `RealmLore.pageText` — resolved server-side, so there is no empty state. */
  pageText,
  preset,
  onDescend,
}: {
  pageName: string;
  pageText: string;
  preset: Preset;
  onDescend: () => void;
}) {
  const reduced = useReducedMotion();

  // Enter goes down. Distinct `sig` from the gear screen that may follow, so a
  // held Enter can't carry through both — the shared gate disarms on mount and
  // on sig change, and these two screens are the exact cascade it exists for.
  useEnterToActivate({ onActivate: onDescend, sig: `page-entry:${pageName}` });

  return (
    <motion.section
      aria-label="The book, on this page"
      data-preset={preset}
      variants={withReducedMotion(warpCrossfade, reduced)}
      initial="enter"
      animate="center"
      className="mx-auto w-full max-w-2xl"
    >
      <div className="flex flex-col gap-4 p-5 rounded-md relative overflow-hidden bg-[linear-gradient(135deg,var(--surface-2),var(--surface-1))] border border-dashed border-[var(--color-preset-accent)]">
        <header className="flex items-baseline justify-between gap-3">
          <Stamp>The book, on this page</Stamp>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] opacity-55">
            added, not authorized
          </span>
        </header>
        <Rule />
        <h3 className="font-mono text-lg font-medium leading-snug text-[var(--color-preset-accent)]">
          {pageName}
        </h3>
        <Body size="sm">{pageText}</Body>

        <Rule tone="muted" />
        <footer className="flex items-center justify-between gap-3 pt-1">
          <KbdHint multi={false} />
          <Button intent="primary" size="md" onClick={onDescend}>
            Go down →
          </Button>
        </footer>
      </div>
    </motion.section>
  );
}
