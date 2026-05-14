"use client";

/**
 * Renders the player's action set for the current encounter:
 *   combat-tactical → Strike / Brace / Flank
 *   - combat-flavor  → 3 flavor-equivalent verbs from the preset bank
 *                      (all map to Strike in the engine)
 *   - hazard         → single "Continue" button (engine rolls automatically)
 *   - discovery      → two flavor options the player picks between
 *
 * The component itself never touches engine state — it dispatches an
 * `ActionChoice` upward and lets `<EncounterFrame/>` step the engine.
 */

import type { ActionChoice, EncounterState } from "@/lib/engine/types";

type Props = {
  encounter: EncounterState;
  combatVerbs: readonly string[];
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

export function ActionChoices({
  encounter,
  combatVerbs,
  disabled,
  onChoose,
}: Props) {
  if (encounter.kind === "combat") {
    if (encounter.choice === "tactical") {
      return (
        <div className="flex flex-wrap gap-2" aria-label="Tactical actions">
          <Button
            variant="primary"
            disabled={disabled}
            onClick={() => onChoose({ kind: "tactical", option: "strike" })}
          >
            Strike
          </Button>
          <Button
            disabled={disabled}
            onClick={() => onChoose({ kind: "tactical", option: "brace" })}
          >
            Brace
          </Button>
          <Button
            disabled={disabled}
            onClick={() => onChoose({ kind: "tactical", option: "flank" })}
          >
            Flank
          </Button>
        </div>
      );
    }
    // flavor: present two preset-flavored verbs; both resolve to Strike.
    // Picking only two of the bank's verbs keeps the surface tight; the
    // engine doesn't distinguish them.
    const verbs = combatVerbs.slice(0, 2);
    return (
      <div className="flex flex-wrap gap-2" aria-label="Flavor actions">
        {verbs.map((v, i) => (
          <Button
            key={v}
            variant={i === 0 ? "primary" : "default"}
            disabled={disabled}
            onClick={() =>
              onChoose({ kind: "flavor", verb: v, index: i as 0 | 1 })
            }
          >
            {v[0]!.toUpperCase() + v.slice(1)}
          </Button>
        ))}
      </div>
    );
  }

  if (encounter.kind === "hazard") {
    return (
      <div className="flex flex-wrap gap-2" aria-label="Hazard action">
        <Button
          variant="primary"
          disabled={disabled}
          onClick={() => onChoose({ kind: "tactical", option: "strike" })}
        >
          Press on
        </Button>
      </div>
    );
  }

  if (encounter.kind === "discovery") {
    return (
      <div className="flex flex-wrap gap-2" aria-label="Discovery options">
        <Button
          variant="primary"
          disabled={disabled}
          onClick={() => onChoose({ kind: "discovery", index: 0 })}
        >
          {encounter.options[0]}
        </Button>
        <Button
          disabled={disabled}
          onClick={() => onChoose({ kind: "discovery", index: 1 })}
        >
          {encounter.options[1]}
        </Button>
      </div>
    );
  }

  return null;
}
