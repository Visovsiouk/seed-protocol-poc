"use client";

/**
 * Renders the player's action set for the current encounter:
 *
 *   - combat (non-boss) → Attack (one button)
 *   - combat (boss)     → Attack + Secondary (Dodge/Brace/Steady/Reflect/Focus,
 *                         resolved from equipped armor via `secondaryFor`)
 *   - trial             → DC + bonus banner + Attempt button
 *   - ledger            → suppress effect A / suppress effect B / skip
 *
 * The component itself never touches engine state — it dispatches an
 * `ActionChoice` upward and lets `<EncounterFrame/>` step the engine.
 *
 * Keyboard nav (arrows + Enter) is provided by the shared `<ChoiceRow/>`.
 */

import { secondaryFor } from "@/lib/engine/combat";
import type {
  ActionChoice,
  AssetCard,
  EncounterState,
} from "@/lib/engine/types";
import { ChoiceRow, type Choice } from "./ChoiceRow";

type Props = {
  encounter: EncounterState;
  equipped: { weapon?: AssetCard; armor?: AssetCard };
  disabled?: boolean;
  onChoose: (choice: ActionChoice) => void;
};

export function ActionChoices({
  encounter,
  equipped,
  disabled,
  onChoose,
}: Props) {
  if (encounter.kind === "combat") {
    // Rebalance: Secondary used to be boss-only, which made the depth-1
    // through depth-5 climb a single-button auto-pilot. Now every
    // combat exposes both actions — the player can Focus → next-Attack
    // crit a trash mob, or Dodge a heavy swing on a low-HP turn. The
    // engine resolver handled all five Secondary flavors regardless of
    // the monster type already (`resolveRound` in combat.ts); the only
    // change is surfacing the button.
    const sec = secondaryFor(equipped.armor);
    const choices: Choice[] = [
      {
        key: "attack",
        label: "Attack",
        variant: "primary",
        onClick: () => onChoose({ kind: "attack" }),
      },
      {
        key: "secondary",
        label: sec.label,
        onClick: () => onChoose({ kind: "secondary" }),
      },
    ];
    return (
      <ChoiceRow
        choices={choices}
        disabled={disabled}
        ariaLabel="Combat actions"
      />
    );
  }

  if (encounter.kind === "trial") {
    // Trial setup (prompt + intent + stakes + check line) is rendered in
    // the empty CombatLog above this row, so the player sees one coherent
    // beat. This row only needs the action button.
    const choices: Choice[] = [
      {
        key: "attempt",
        label: "Attempt",
        variant: "primary",
        onClick: () => onChoose({ kind: "trial" }),
      },
    ];
    return (
      <ChoiceRow
        choices={choices}
        disabled={disabled}
        ariaLabel="Trial actions"
      />
    );
  }

  if (encounter.kind === "rest") {
    const choices: Choice[] = [
      {
        key: "rest",
        label: encounter.actionLabel,
        variant: "primary",
        onClick: () => onChoose({ kind: "rest" }),
      },
    ];
    return (
      <ChoiceRow
        choices={choices}
        disabled={disabled}
        ariaLabel="Rest action"
      />
    );
  }

  if (encounter.kind === "ledger") {
    const [a, b] = encounter.effects;
    const choices: Choice[] = [
      {
        key: `strike-${a}`,
        label: `Strike ${a.replace(/_/g, " ")}`,
        variant: "primary",
        onClick: () => onChoose({ kind: "ledger", suppress: a }),
      },
      {
        key: `strike-${b}`,
        label: `Strike ${b.replace(/_/g, " ")}`,
        variant: "primary",
        onClick: () => onChoose({ kind: "ledger", suppress: b }),
      },
      {
        key: "skip",
        label: "Skip",
        onClick: () => onChoose({ kind: "ledger", suppress: null }),
      },
    ];
    return (
      <div className="flex flex-col gap-2" aria-label="Ledger action">
        <div className="text-sm">
          {encounter.bossName} carries: {a.replace(/_/g, " ")} & {b.replace(/_/g, " ")}.
          Strike one from the ledger?
        </div>
        <ChoiceRow
          choices={choices}
          disabled={disabled}
          ariaLabel="Ledger actions"
        />
      </div>
    );
  }

  return null;
}
