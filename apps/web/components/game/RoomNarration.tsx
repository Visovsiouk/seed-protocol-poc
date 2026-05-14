"use client";

/**
 * The room/encounter-intro block at the top of `<EncounterFrame/>`. Holds
 * the narration string that was drawn from the preset's flavor bank when
 * the encounter was generated, plus the monster/boss banner when combat.
 *
 * This component is intentionally inert — it doesn't drive the engine.
 * Action choices live in `<ActionChoices/>`.
 */

import type { CombatState, EncounterState } from "@/lib/engine/types";

function MonsterBanner({ combat }: { combat: CombatState }) {
  const monster = combat.monster;
  const isBoss = "bakedEffects" in monster;
  const maxHp = isBoss ? monster.baseHp : monster.hp;
  const pct = Math.max(0, Math.round((combat.monsterHp / maxHp) * 100));
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
