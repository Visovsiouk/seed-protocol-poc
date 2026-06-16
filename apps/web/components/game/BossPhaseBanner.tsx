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
      className="rounded-lg px-5 py-3 flex items-center gap-3 transition-opacity duration-[var(--dur-slow)] border backdrop-blur-sm bg-[color-mix(in_oklab,var(--color-danger)_28%,var(--color-preset-bg))] border-[color-mix(in_oklab,var(--color-danger)_70%,transparent)] shadow-[0_12px_32px_-10px_color-mix(in_oklab,var(--color-danger)_55%,transparent)]"
    >
      <span
        className="text-xs uppercase tracking-widest font-[family-name:var(--font-display)]"
        style={{ color: "var(--color-danger)" }}
      >
        Phase 2
      </span>
      <span className="font-semibold">
        {bossName} grows more dangerous.
      </span>
    </div>
  );
}
