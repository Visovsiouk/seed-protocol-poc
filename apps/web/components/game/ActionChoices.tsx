"use client";

/**
 * Renders the player's action set for the current encounter. The run is
 * pure combat now, so there is one surface: Attack + Secondary
 * (Dodge/Brace/Steady/Reflect/Focus, resolved from equipped armor via
 * `secondaryFor`).
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
  // Combat is the only encounter kind. Every fight exposes both actions —
  // the player can Focus → next-Attack crit a trash mob, or Dodge a heavy
  // swing on a low-HP turn. The engine resolver handles all five Secondary
  // flavors regardless of monster type (`resolveRound` in combat.ts).
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
