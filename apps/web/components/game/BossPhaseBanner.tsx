"use client";

/**
 * Pops a banner when the boss flips from phase 1 → phase 2 (
 *). The transition itself is detected by `boss.ts`; this component
 * just renders the dramatic flourish.
 *
 * Visibility is driven by a prop, not internal state, so the parent
 * (`<EncounterFrame/>`) can dismiss it on the next room change.
 */

import { useEffect, useState } from "react";

export function BossPhaseBanner({
  show,
  bossName,
}: {
  show: boolean;
  bossName: string;
}) {
  // Auto-fade after a few seconds so it doesn't loiter once the player
  // engages phase 2.
  const [visible, setVisible] = useState(show);
  useEffect(() => {
    setVisible(show);
    if (!show) return;
    const t = window.setTimeout(() => setVisible(false), 4000);
    return () => window.clearTimeout(t);
  }, [show]);

  if (!visible) return null;

  return (
    <div
      role="alert"
      className="rounded-md px-5 py-3 flex items-center gap-3 transition-opacity duration-500"
      style={{
        background: "rgba(212, 68, 68, 0.15)",
        border: "1px solid rgba(212, 68, 68, 0.5)",
      }}
    >
      <span className="text-rose-200 text-xs uppercase tracking-widest">
        Phase 2
      </span>
      <span className="font-semibold">
        {bossName} grows more dangerous.
      </span>
    </div>
  );
}
