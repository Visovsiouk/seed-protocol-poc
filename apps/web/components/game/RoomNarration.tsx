"use client";

/**
 * The room/encounter-intro block at the top of `<EncounterFrame/>`. Holds
 * the narration string that was drawn from the preset's flavor bank when
 * the encounter was generated, plus the monster/boss banner when combat.
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

/** Per-element accent colours, kept local to this banner (mirror of the
 * inventory AssetCard's palette). Engine doesn't know about presentation;
 * these are pure UI tokens. Hue is enum-index-keyed, so
 * fire / plasma / incendiary share a colour, etc. */
const EMBER = { bg: "rgba(255,120,40,0.18)", fg: "#ffb38a" };
const FROST = { bg: "rgba(120,200,255,0.18)", fg: "#a8dcff" };
const SPARK = { bg: "rgba(255,230,80,0.18)", fg: "#ffeb8a" };
const GOLD_LIGHT = { bg: "rgba(255,220,140,0.18)", fg: "#ffd97a" };
const VIOLET = { bg: "rgba(180,120,255,0.18)", fg: "#caa6ff" };
const ELEMENT_COLOR: Record<string, { bg: string; fg: string }> = {
  fire: EMBER, plasma: EMBER, incendiary: EMBER,
  ice: FROST, cryo: FROST, cryogenic: FROST,
  shock: SPARK, ion: SPARK, emp: SPARK,
  holy: GOLD_LIGHT, photon: GOLD_LIGHT, laser: GOLD_LIGHT,
  unholy: VIOLET, void: VIOLET, nano: VIOLET,
};
const ELEMENT_COLOR_FALLBACK = { bg: "rgba(180,180,180,0.18)", fg: "#cccccc" };

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
  const c = ELEMENT_COLOR[element] ?? ELEMENT_COLOR_FALLBACK;
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
      {encounter?.kind === "combat" && (
        <MonsterBanner combat={encounter.combat} activePreset={activePreset} />
      )}
      {encounter?.kind === "trial" && (
        <p className="text-xs uppercase tracking-wide opacity-50">Trial</p>
      )}
      {encounter?.kind === "ledger" && (
        <p className="text-xs uppercase tracking-wide opacity-50">Ledger</p>
      )}
    </section>
  );
}
