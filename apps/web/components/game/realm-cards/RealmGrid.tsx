"use client";

import { Fragment, type ReactNode } from "react";
import { useRovingGrid } from "@/lib/ui/useRovingGrid";
import { KbdHint } from "@/components/game/ChoiceRow";

/**
 * A grid of realm cards with roving-focus keyboard navigation: the first
 * enabled (playable) card is highlighted on load, arrow keys move across the
 * grid skipping sealed realms, and Enter selects the highlighted realm via
 * the card's native button/link. Used by both the pre-arc base and the
 * post-Genesis open picker so keyboard selection reads identically.
 */
export type RealmCell = {
  key: string;
  enabled: boolean;
  render: (cellProps: {
    cellRef: (el: HTMLElement | null) => void;
    tabIndex: number;
  }) => ReactNode;
};

export function RealmGrid({ cells }: { cells: RealmCell[] }) {
  const { containerProps, getCellProps } = useRovingGrid({
    count: cells.length,
    isEnabled: (i) => cells[i]?.enabled ?? false,
    columns: 3,
    sig: cells.map((c) => c.key).join("|"),
  });
  return (
    <div className="flex flex-col gap-3">
      <div
        role="toolbar"
        aria-label="Realm cards"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        {...containerProps}
      >
        {cells.map((c, i) => {
          const cp = getCellProps(i);
          return (
            <Fragment key={c.key}>
              {c.render({ cellRef: cp.ref, tabIndex: cp.tabIndex })}
            </Fragment>
          );
        })}
      </div>
      {cells.length > 0 && <KbdHint multi />}
    </div>
  );
}
