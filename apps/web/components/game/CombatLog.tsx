"use client";

/**
 * Rolling narration feed. Holds the last N lines emitted by the engine
 * across every step in the current encounter. New lines append at the
 * bottom; auto-scroll keeps them in view.
 *
 * Visually distinct from `<RoomNarration/>` (which is the static intro for
 * the current room) — this log accumulates as the player acts.
 */

import { useEffect, useRef } from "react";
import type { EncounterState, NarrationLine } from "@/lib/engine/types";

const MAX_LINES = 60;

const EMPHASIS_STYLES: Record<NonNullable<NarrationLine["emphasis"]>, string> = {
  info: "opacity-70",
  damage: "text-[var(--color-danger)]",
  heal: "text-[var(--color-ok)]",
  drama: "text-[var(--color-warn)] font-medium",
};

export function CombatLog({
  lines,
  encounter,
}: {
  lines: readonly NarrationLine[];
  encounter?: EncounterState | null;
}) {
  const tail = lines.slice(-MAX_LINES);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [tail.length]);

  const isTrial = encounter?.kind === "trial";

  return (
    <section
      ref={scrollerRef}
      aria-label="Combat log"
      className="h-64 overflow-y-auto px-4 py-3 rounded-lg border text-sm leading-relaxed flex flex-col gap-1 font-[family-name:var(--font-mono)] bg-[var(--surface-2)] border-[var(--border-1)]"
    >
      {isTrial && <TrialPreview encounter={encounter} hasLog={tail.length > 0} />}
      {tail.length === 0
        ? !isTrial && (
            <p className="opacity-50">The room is silent. Your move.</p>
          )
        : tail.map((l, i) => (
            <p
              key={i}
              className={l.emphasis ? EMPHASIS_STYLES[l.emphasis] : "opacity-90"}
            >
              {l.text}
            </p>
          ))}
    </section>
  );
}

/**
 * Sticky trial setup at the top of the log. Shown for the whole trial
 * encounter (not just the empty state) so the player keeps seeing the
 * prompt, intent, and stakes even when prior beats — e.g. the death +
 * respawn narration from a seed-mercy bounce — still sit in the log.
 */
function TrialPreview({
  encounter,
  hasLog,
}: {
  encounter: Extract<EncounterState, { kind: "trial" }>;
  hasLog: boolean;
}) {
  return (
    <>
      <p className="opacity-90">{encounter.prompt}</p>
      <p className="opacity-90">
        <span className="font-medium">You attempt:</span> {encounter.intent}
      </p>
      <p className="opacity-70">{encounter.stakes}</p>
      <p className="opacity-90">
        {encounter.ability === "agility" ? "Agility" : "Endurance"} check —
        roll d20+{encounter.bonus} vs DC {encounter.dc}
      </p>
      {hasLog && <hr className="my-1 border-0 h-px bg-[var(--border-1)]" />}
    </>
  );
}
