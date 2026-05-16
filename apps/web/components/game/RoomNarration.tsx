"use client";

/**
 * The room/encounter-intro block at the top of `<EncounterFrame/>`. Holds
 * the narration string that was drawn from the preset's flavor bank when
 * the encounter was generated, plus the monster/boss banner when combat.
 *
 * This component is intentionally inert — it doesn't drive the engine.
 * Action choices live in `<ActionChoices/>`.
 */

import type { CombatState, Element, EncounterState } from "@/lib/engine/types";

/** Per-element accent colours, kept local to this banner (mirror of the
 * inventory AssetCard's palette). Engine doesn't know about presentation;
 * these are pure UI tokens. */
const ELEMENT_COLOR: Record<Exclude<Element, "none">, { bg: string; fg: string }> = {
  fire: { bg: "rgba(255,120,40,0.18)", fg: "#ffb38a" },
  ice: { bg: "rgba(120,200,255,0.18)", fg: "#a8dcff" },
  shock: { bg: "rgba(255,230,80,0.18)", fg: "#ffeb8a" },
  holy: { bg: "rgba(255,220,140,0.18)", fg: "#ffd97a" },
  unholy: { bg: "rgba(180,120,255,0.18)", fg: "#caa6ff" },
};

function ElementTag({
  element,
  label,
}: {
  element: Exclude<Element, "none">;
  label: string;
}) {
  const c = ELEMENT_COLOR[element];
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider font-semibold"
      style={{
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.fg}55`,
      }}
    >
      {label}: {element}
    </span>
  );
}

function MonsterBanner({ combat }: { combat: CombatState }) {
  const monster = combat.monster;
  const isBoss = "bakedEffects" in monster;
  const maxHp = isBoss ? monster.baseHp : monster.hp;
  const pct = Math.max(0, Math.round((combat.monsterHp / maxHp) * 100));
  const element = monster.element && monster.element !== "none" ? monster.element : undefined;
  const weakTo = monster.weakTo && monster.weakTo !== "none" ? monster.weakTo : undefined;
  const resistTo = monster.resistTo && monster.resistTo !== "none" ? monster.resistTo : undefined;
  const hasElementInfo = element || weakTo || resistTo;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-semibold">{monster.name}</h2>
        <span className="text-xs tabular-nums opacity-70">
          {combat.monsterHp}/{maxHp} HP · AC {monster.ac}
        </span>
      </div>
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ background: "rgba(255,255,255,0.08)" }}
      >
        <div
          className="h-full transition-all"
          style={{
            width: `${pct}%`,
            background: isBoss ? "#d44" : "var(--color-preset-accent)",
          }}
        />
      </div>
      {hasElementInfo && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {element && <ElementTag element={element} label="attacks" />}
          {weakTo && <ElementTag element={weakTo} label="weak" />}
          {resistTo && <ElementTag element={resistTo} label="resists" />}
        </div>
      )}
    </div>
  );
}

export function RoomNarration({
  encounter,
  intro,
}: {
  encounter: EncounterState | null;
  /** Narration line(s) emitted when the encounter was generated. */
  intro: string;
}) {
  return (
    <section
      className="flex flex-col gap-4 p-5 rounded-md"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
      aria-label="Room narration"
    >
      <p className="text-base leading-relaxed opacity-90">{intro}</p>
      {encounter?.kind === "combat" && <MonsterBanner combat={encounter.combat} />}
      {encounter?.kind === "hazard" && (
        <p className="text-xs uppercase tracking-wide opacity-50">Hazard</p>
      )}
      {encounter?.kind === "discovery" && (
        <p className="text-xs uppercase tracking-wide opacity-50">Discovery</p>
      )}
    </section>
  );
}
