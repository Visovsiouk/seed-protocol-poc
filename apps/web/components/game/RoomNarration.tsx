"use client";

/**
 * The room/encounter-intro block at the top of `<EncounterFrame/>`. Holds
 * the narration string that was drawn from the preset's flavor bank when
 * the encounter was generated, plus the monster/boss banner when combat.
 *
 * Reads as a ledger page (parchment Panel + stamped eyebrow); the monster
 * banner uses the kit `Meter` for the enemy HP bar so it stays in visual
 * lockstep with the player HUD.
 *
 * This component is intentionally inert — it doesn't drive the engine.
 * Action choices live in `<ActionChoices/>`.
 */

import type {
  CombatState,
  Element,
  EncounterState,
  Preset,
} from "@/lib/engine/types";
import { useElementLabel } from "@/lib/contracts/adapters";
import { elementChip } from "@/lib/ui/loot-visuals";
import { Panel, Stamp, Meter } from "@/components/ui";

function ElementTag({
  element,
  label,
  preset,
}: {
  element: Exclude<Element, "none">;
  label: string;
  /** Active-realm preset whose vocabulary should name the element.
   * `null` falls back to the canonical name via `useElementLabel`. */
  preset: Preset | null;
}) {
  const c = elementChip(element);
  const elementLabel = useElementLabel(element, preset);
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider font-semibold"
      style={{
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.fg}55`,
      }}
    >
      {label}: {elementLabel}
    </span>
  );
}

function MonsterBanner({
  combat,
  activePreset,
}: {
  combat: CombatState;
  activePreset: Preset | null;
}) {
  const monster = combat.monster;
  const isBoss = "bakedEffects" in monster;
  const maxHp = isBoss ? monster.baseHp : monster.hp;
  const element = monster.element && monster.element !== "none" ? monster.element : undefined;
  const weakTo = monster.weakTo && monster.weakTo !== "none" ? monster.weakTo : undefined;
  const resistTo = monster.resistTo && monster.resistTo !== "none" ? monster.resistTo : undefined;
  const hasElementInfo = element || weakTo || resistTo;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-semibold font-[family-name:var(--font-display)]">
          {monster.name}
        </h2>
        <span className="text-xs tabular-nums opacity-70">
          {combat.monsterHp}/{maxHp} HP · AC {monster.ac}
        </span>
      </div>
      <Meter
        value={combat.monsterHp}
        max={maxHp}
        size="sm"
        color={isBoss ? "var(--color-danger)" : "var(--color-preset-accent)"}
      />
      {hasElementInfo && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {element && (
            <ElementTag element={element} label="attacks" preset={activePreset} />
          )}
          {weakTo && (
            <ElementTag element={weakTo} label="weak" preset={activePreset} />
          )}
          {resistTo && (
            <ElementTag element={resistTo} label="resists" preset={activePreset} />
          )}
        </div>
      )}
    </div>
  );
}

const KIND_LABEL: Partial<Record<NonNullable<EncounterState>["kind"], string>> = {
  trial: "Trial",
  ledger: "Ledger",
  rest: "Safe Room",
};

export function RoomNarration({
  encounter,
  intro,
  activePreset = null,
}: {
  encounter: EncounterState | null;
  /** Narration line(s) emitted when the encounter was generated. */
  intro: string;
  /**
   * Preset of the realm the player is currently in. Threaded down to
   * the monster banner's element tags so they render the current
   * realm's vocabulary (e.g. cyberpunk shows "nano" instead of the
   * canonical "unholy"). `null` falls back to canonical names.
   */
  activePreset?: Preset | null;
}) {
  const kindLabel = encounter ? KIND_LABEL[encounter.kind] : undefined;
  return (
    <Panel
      as="section"
      tone="parchment"
      className="flex flex-col gap-4 p-5"
      aria-label="Room narration"
    >
      {kindLabel && <Stamp tone="muted">{kindLabel}</Stamp>}
      <p className="text-base leading-relaxed opacity-90">{intro}</p>
      {encounter?.kind === "combat" && (
        <MonsterBanner combat={encounter.combat} activePreset={activePreset} />
      )}
    </Panel>
  );
}
