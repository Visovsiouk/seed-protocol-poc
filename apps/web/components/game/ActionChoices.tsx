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
 */

import { secondaryFor } from "@/lib/engine/combat";
import type {
  ActionChoice,
  AssetCard,
  BossDef,
  EncounterState,
  MonsterDef,
} from "@/lib/engine/types";

type Props = {
  encounter: EncounterState;
  equipped: { weapon?: AssetCard; armor?: AssetCard };
  disabled?: boolean;
  onChoose: (choice: ActionChoice) => void;
};

function Button({
  children,
  onClick,
  disabled,
  variant = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "primary";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md px-4 py-2.5 text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        background:
          variant === "primary"
            ? "var(--color-preset-accent)"
            : "rgba(255,255,255,0.06)",
        color:
          variant === "primary"
            ? "var(--color-preset-bg)"
            : "var(--color-preset-fg)",
        border:
          variant === "primary"
            ? "none"
            : "1px solid rgba(255,255,255,0.1)",
      }}
    >
      {children}
    </button>
  );
}

function isBossMonster(monster: MonsterDef | BossDef): monster is BossDef {
  return "bakedEffects" in monster;
}

export function ActionChoices({
  encounter,
  equipped,
  disabled,
  onChoose,
}: Props) {
  if (encounter.kind === "combat") {
    const boss = isBossMonster(encounter.combat.monster);
    const sec = secondaryFor(equipped.armor);
    return (
      <div className="flex flex-wrap gap-2" aria-label="Combat actions">
        <Button
          variant="primary"
          disabled={disabled}
          onClick={() => onChoose({ kind: "attack" })}
        >
          Attack
        </Button>
        {boss && (
          <Button disabled={disabled} onClick={() => onChoose({ kind: "secondary" })}>
            {sec.label}
          </Button>
        )}
      </div>
    );
  }

  if (encounter.kind === "trial") {
    return (
      <div className="flex flex-col gap-2" aria-label="Trial action">
        <div className="text-xs" style={{ color: "var(--color-preset-fg-dim)" }}>
          {encounter.flavor}
        </div>
        <div className="text-sm">
          {encounter.ability === "agility" ? "Agility" : "Endurance"} check —
          roll d20+{encounter.bonus} vs DC {encounter.dc}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            disabled={disabled}
            onClick={() => onChoose({ kind: "trial" })}
          >
            Attempt
          </Button>
        </div>
      </div>
    );
  }

  if (encounter.kind === "ledger") {
    const [a, b] = encounter.effects;
    return (
      <div className="flex flex-col gap-2" aria-label="Ledger action">
        <div className="text-sm">
          {encounter.bossName} carries: {a.replace(/_/g, " ")} & {b.replace(/_/g, " ")}.
          Strike one from the ledger?
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            disabled={disabled}
            onClick={() => onChoose({ kind: "ledger", suppress: a })}
          >
            Strike {a.replace(/_/g, " ")}
          </Button>
          <Button
            variant="primary"
            disabled={disabled}
            onClick={() => onChoose({ kind: "ledger", suppress: b })}
          >
            Strike {b.replace(/_/g, " ")}
          </Button>
          <Button
            disabled={disabled}
            onClick={() => onChoose({ kind: "ledger", suppress: null })}
          >
            Skip
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
