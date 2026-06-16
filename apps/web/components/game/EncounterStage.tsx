"use client";

/**
 * EncounterStage — the dramatic centrepiece of `/play/[preset]`.
 *
 * This is the "screen you're staring at" while you delve: the thing you are
 * facing, rendered big. It replaces the old flat `<RoomNarration/>` text
 * block + thin monster line with a framed, realm-tinted stage where the
 * enemy dominates:
 *
 *   - a vignette/atmosphere backdrop keyed to the realm palette (and the
 *     enemy's element when one is present),
 *   - the monster name at display scale with a thick HP bar that DRAINS and
 *     SHAKES + throws a floating damage number when it's struck,
 *   - threat chips (attacks / weak / resists),
 *   - the room's flavor line woven in as scene-setting prose.
 *
 * Non-combat rooms (trial / ledger / rest / between-rooms) reuse the same
 * stage so the screen stays coherent — a calmer accent vignette instead of
 * the hostile combat tint, with the room's prompt/flavor as the focus.
 *
 * Inert: it never drives the engine. It only renders the live encounter and
 * animates HP deltas it observes via its `combat` prop.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "framer-motion";
import type {
  CombatState,
  Element,
  EncounterState,
  Preset,
} from "@/lib/engine/types";
import { useElementLabel } from "@/lib/contracts/adapters";
import { elementColor } from "@/lib/ui/loot-visuals";
import { Chip } from "@/components/ui";

type DamageFloat = { id: number; text: string; color: string };

/**
 * Watch an HP value and surface transient combat feedback: a shake-trigger
 * counter (bumped on any change so the caller can react) and a queue of
 * rising +/- numbers that auto-expire. Decreases read as damage (rose),
 * increases as heals (green).
 */
function useHpFloats(value: number, reduced: boolean | null) {
  const controls = useAnimationControls();
  const prev = useRef(value);
  const idRef = useRef(0);
  const [floats, setFloats] = useState<DamageFloat[]>([]);
  // Each float owns its own expiry timer. We keep them in a ref and clear
  // them only on unmount — NOT in an effect-cleanup, because that cleanup
  // runs on every HP change and would cancel the *previous* float's removal,
  // leaving stale numbers stuck on the bar.
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current.clear();
    },
    [],
  );

  useEffect(() => {
    const delta = value - prev.current;
    prev.current = value;
    if (delta === 0) return;
    const id = ++idRef.current;
    const hurt = delta < 0;
    setFloats((f) => [
      ...f,
      {
        id,
        text: hurt ? `${delta}` : `+${delta}`,
        color: hurt ? "var(--color-danger)" : "var(--color-ok)",
      },
    ]);
    const t = setTimeout(() => {
      setFloats((f) => f.filter((x) => x.id !== id));
      timers.current.delete(t);
    }, 950);
    timers.current.add(t);
    if (hurt && !reduced) {
      void controls.start({
        x: [0, -9, 8, -6, 4, 0],
        transition: { duration: 0.4, ease: "easeOut" },
      });
    }
  }, [value, controls, reduced]);

  return { controls, floats };
}

function FloatLayer({ floats }: { floats: DamageFloat[] }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-full mb-1 flex justify-center">
      <AnimatePresence>
        {floats.map((f) => (
          <motion.span
            key={f.id}
            className="absolute bottom-0 font-[family-name:var(--font-display)] text-4xl font-bold tabular-nums drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
            style={{ color: f.color }}
            initial={{ opacity: 0, y: 8, scale: 0.6 }}
            animate={{ opacity: 1, y: -44, scale: 1 }}
            exit={{ opacity: 0, y: -72, scale: 0.9 }}
            transition={{ duration: 0.95, ease: [0.22, 1, 0.36, 1] }}
          >
            {f.text}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}

function ThreatChip({
  element,
  label,
  preset,
}: {
  element: Exclude<Element, "none">;
  label: string;
  preset: Preset | null;
}) {
  const elementLabel = useElementLabel(element, preset);
  return <Chip color={elementColor(element)} label={label} sub={elementLabel} />;
}

/** The hostile combat view: the monster, big, with a draining health bar. */
function CombatStage({
  combat,
  intro,
  activePreset,
}: {
  combat: CombatState;
  intro: string;
  activePreset: Preset | null;
}) {
  const reduced = useReducedMotion();
  const { controls, floats } = useHpFloats(combat.monsterHp, reduced);

  const monster = combat.monster;
  const isBoss = "bakedEffects" in monster;
  const maxHp = isBoss ? monster.baseHp : monster.hp;
  const pct = maxHp <= 0 ? 0 : Math.max(0, Math.min(100, (combat.monsterHp / maxHp) * 100));

  const element =
    monster.element && monster.element !== "none" ? monster.element : undefined;
  const weakTo =
    monster.weakTo && monster.weakTo !== "none" ? monster.weakTo : undefined;
  const resistTo =
    monster.resistTo && monster.resistTo !== "none" ? monster.resistTo : undefined;

  // Bar hue: bosses read pure danger; lesser foes glow in their element so
  // each fight has a colour identity, falling back to a hostile rose.
  const barColor = isBoss
    ? "var(--color-danger)"
    : element
      ? elementColor(element)
      : "var(--color-danger)";

  return (
    <motion.div animate={controls} className="relative flex flex-col gap-4">
      {intro && (
        <p className="text-sm italic leading-relaxed opacity-80">{intro}</p>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-end justify-between gap-4">
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-bold leading-none sm:text-4xl">
            {monster.name}
          </h2>
          <span className="shrink-0 font-mono text-sm tabular-nums opacity-70">
            {combat.monsterHp}
            <span className="opacity-65">/{maxHp}</span> · AC {monster.ac}
            {isBoss && combat.bossPhase ? ` · P${combat.bossPhase}` : ""}
          </span>
        </div>

        {/*
          Thick enemy health bar with element/danger glow. The damage
          float is anchored to this bar (not the stage centre) so the hit
          feedback always pops on the bar — the fixed-height/centred stage
          would otherwise leave it drifting above or below the rail.
        */}
        <div className="relative">
          <FloatLayer floats={floats} />
          <div className="relative h-3.5 w-full overflow-hidden rounded-full bg-[color-mix(in_oklab,#000_45%,transparent)] ring-1 ring-[var(--border-1)]">
            <motion.div
              className="h-full rounded-full"
              style={{
                background: barColor,
                boxShadow: `0 0 16px -2px ${barColor}`,
              }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: reduced ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </div>

        {(element || weakTo || resistTo) && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {element && (
              <ThreatChip element={element} label="attacks" preset={activePreset} />
            )}
            {weakTo && (
              <ThreatChip element={weakTo} label="weak" preset={activePreset} />
            )}
            {resistTo && (
              <ThreatChip element={resistTo} label="resists" preset={activePreset} />
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

const KIND_LABEL: Record<NonNullable<EncounterState>["kind"], string> = {
  combat: "Encounter",
  trial: "Trial",
  ledger: "Ledger",
  rest: "Safe Room",
};

/** The calm view: trial prompt, rest, ledger framing, or between-rooms prose. */
function QuietStage({
  encounter,
  intro,
}: {
  encounter: EncounterState | null;
  intro: string;
}) {
  if (encounter?.kind === "trial") {
    return (
      <div className="flex flex-col gap-3">
        {intro && (
          <p className="text-sm italic leading-relaxed opacity-80">{intro}</p>
        )}
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold leading-tight sm:text-3xl">
          {encounter.prompt}
        </h2>
        <p className="text-base leading-relaxed opacity-90">
          <span className="opacity-70">You attempt:</span> {encounter.intent}
        </p>
        <p className="text-sm leading-relaxed opacity-80">{encounter.stakes}</p>
        <p className="font-mono text-xs uppercase tracking-widest opacity-70">
          {encounter.ability === "agility" ? "Agility" : "Endurance"} check —
          d20+{encounter.bonus} vs DC {encounter.dc}
        </p>
      </div>
    );
  }

  return (
    <p className="text-base leading-relaxed opacity-90">
      {intro || "The way ahead is quiet."}
    </p>
  );
}

export function EncounterStage({
  encounter,
  intro,
  activePreset = null,
}: {
  encounter: EncounterState | null;
  /** Narration line emitted when the room was generated. */
  intro: string;
  /** Active realm preset, for element-label vocabulary. */
  activePreset?: Preset | null;
}) {
  const isCombat = encounter?.kind === "combat";
  const kindLabel = encounter ? KIND_LABEL[encounter.kind] : "Aftermath";

  // Combat runs hot (danger-tinted vignette); everything else takes a calm
  // accent wash so the stage still reads as "in the world" between fights.
  const wash = isCombat
    ? "radial-gradient(120% 90% at 50% 0%, color-mix(in oklab, var(--color-danger) 22%, transparent) 0%, transparent 60%)"
    : "radial-gradient(120% 90% at 50% 0%, color-mix(in oklab, var(--color-preset-accent) 18%, transparent) 0%, transparent 62%)";

  return (
    <section
      aria-label={isCombat ? "Enemy" : "Room"}
      className="relative isolate flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--border-1)] bg-[var(--surface-1)] p-6 shadow-[inset_0_1px_0_0_var(--border-1),0_24px_60px_-32px_rgba(0,0,0,0.8)] sm:p-8"
    >
      {/* atmosphere: realm-tinted vignette + the preset texture grain */}
      <div aria-hidden className="absolute inset-0 -z-10" style={{ background: wash }} />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-40"
        style={{ backgroundImage: "var(--preset-texture)" }}
      />

      {/*
        The stage is locked to its parent's fixed height. Content centres
        within the box and scrolls internally if it overruns, so the slot's
        outer geometry never changes between rooms (short trial prompt vs.
        tall combat stage) — that constancy is the zero-jump guarantee.
      */}
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-4 overflow-y-auto overflow-x-clip">
        <p className="font-mono text-[10px] uppercase tracking-[0.4em] opacity-65">
          {isCombat ? `— ${kindLabel} —` : kindLabel}
        </p>

        {isCombat && encounter.kind === "combat" ? (
          <CombatStage
            combat={encounter.combat}
            intro={intro}
            activePreset={activePreset}
          />
        ) : (
          <QuietStage encounter={encounter} intro={intro} />
        )}
      </div>
    </section>
  );
}
