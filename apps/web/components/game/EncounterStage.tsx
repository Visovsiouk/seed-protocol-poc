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
 * Between-rooms (no active encounter) reuses the same stage so the screen
 * stays coherent — a calmer accent vignette instead of the hostile combat
 * tint, with the aftermath/transition prose as the focus.
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
import { presetForRealm, useElementLabel } from "@/lib/contracts/adapters";
import { creatureSpec } from "@/lib/art/creature";
import { familyFor } from "@/lib/art/families";
import { spriteFor } from "@/lib/art/sprites";
import { weaponLane } from "@/lib/art/archetypes";
import { CreatureSigil } from "@/components/art/CreatureSigil";
import { ImpactLayer } from "@/components/art/ImpactLayer";
import { elementColor } from "@/lib/ui/loot-visuals";
import { faceGhost, holdPulse, washShift, withReducedMotion } from "@/lib/ui/motion";
import { Chip } from "@/components/ui";

/**
 * How charged the stage is right now, derived from the live encounter. Drives
 * the reactive backdrop layers in `StageReactions` (all aria-hidden, behind
 * the centred content — never the content box itself, so the fixed-height
 * zero-jump guarantee holds).
 *   - calm   — no active combat (between rooms / aftermath)
 *   - engaged— a fight underway, the enemy still healthy
 *   - lowhp  — the enemy is nearly down (a kill is close); danger breathes
 *   - phase2 — a boss has turned; the kept reader surfaces, the wash shifts
 */
type Intensity = "calm" | "engaged" | "lowhp" | "phase2";

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
  // Monotonic count of *hits* (HP losses only, not heals). The creature sigil
  // re-keys its one-shot recoil off this, so it flinches on the same beat the
  // bar shakes — reusing the damage observation already happening here rather
  // than watching HP a second time.
  const [hitNonce, setHitNonce] = useState(0);
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
    if (hurt) setHitNonce((n) => n + 1);
    if (hurt && !reduced) {
      void controls.start({
        x: [0, -9, 8, -6, 4, 0],
        transition: { duration: 0.4, ease: "easeOut" },
      });
    }
  }, [value, controls, reduced]);

  return { controls, floats, hitNonce };
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

/**
 * Derive the enemy's generated likeness from the live encounter.
 *
 * Reads only *traits* off the monster — never `combat.monsterHp` — so the
 * sigil is stable for the whole fight and identical for every instance of a
 * species. The one state-derived input is the boss phase, and it selects
 * which traits apply (phase-2 attack die, `turned` variant) rather than
 * feeding state into the geometry. `creatureSpec` memoizes on those inputs,
 * so calling this on every render is a map lookup.
 */
function sigilFor(combat: CombatState, activePreset: Preset | null) {
  const monster = combat.monster;
  const isBoss = "bakedEffects" in monster;
  const turned = isBoss && (combat.bossPhase ?? 0) >= 2;
  const preset = activePreset ?? "fantasy";
  return {
    turned,
    // Authored art when this creature has it, otherwise null and the sigil
    // falls back to the generated silhouette. Converting the roster is
    // therefore incremental — no flag day, no half-drawn bestiary.
    sprite: spriteFor(preset, monster.id),
    spec: creatureSpec({
      preset,
      id: monster.id,
      family: familyFor(preset, monster.id),
      hp: isBoss ? monster.baseHp : monster.hp,
      attackDie: turned && isBoss ? monster.phase2AttackDie : monster.attackDie,
      ac: monster.ac,
      element: monster.element,
      weakTo: monster.weakTo,
      resistTo: monster.resistTo,
      isBoss,
      variant: turned ? ("turned" as const) : ("base" as const),
    }),
  };
}

/**
 * What the stage needs to know about the player's weapon to draw its blows.
 * Structurally a subset of an engine `AssetCard`, so a call site can pass one
 * straight through.
 */
export type StageWeapon = {
  readonly weaponType?: string;
  readonly element?: Element;
  readonly realm?: `0x${string}`;
  readonly realmPreset?: Preset;
};

/**
 * Archetype lane for the equipped weapon, for picking an impact gesture.
 *
 * Read against the weapon's **own** realm preset, not the realm being delved.
 * A fantasy `"sword"` is simply absent from the cyberpunk vocabulary, so
 * resolving it against the active realm would score every carried weapon as
 * lane 0 and make it swing like a bare fist the moment it left home.
 *
 * Using the source preset is also sufficient, not just necessary: lanes are
 * ordinals that the uint8 cast and the cross-realm adapters agree on
 * (`adapters.ts` translates by `weaponTypeIndex` → `weaponTypeFromIndex`), so
 * the ordinal is the same number whichever side of a hop you read it from. A
 * translated katana and the sword it came from land the same blow — correctly,
 * because the gesture describes the weapon's physicality, not its genre skin.
 */
function laneFor(weapon: StageWeapon | undefined): number {
  if (!weapon?.weaponType) return 0;
  const preset =
    weapon.realmPreset ??
    (weapon.realm ? presetForRealm(weapon.realm) : null) ??
    "fantasy";
  return weaponLane(preset, weapon.weaponType);
}

/** The hostile combat view: the monster, big, with a draining health bar. */
function CombatStage({
  combat,
  intro,
  activePreset,
  equippedWeapon,
}: {
  combat: CombatState;
  intro: string;
  activePreset: Preset | null;
  equippedWeapon?: StageWeapon;
}) {
  const reduced = useReducedMotion();
  const { controls, floats, hitNonce } = useHpFloats(combat.monsterHp, reduced);

  const monster = combat.monster;
  const isBoss = "bakedEffects" in monster;
  const maxHp = isBoss ? monster.baseHp : monster.hp;
  const pct = maxHp <= 0 ? 0 : Math.max(0, Math.min(100, (combat.monsterHp / maxHp) * 100));
  const { spec: sigil, sprite, turned } = sigilFor(combat, activePreset);

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
    <motion.div animate={controls} className="relative flex min-h-0 flex-1 flex-col gap-3">
      {/*
        Clamped to three lines. The room's flavor is scene-setting, but the
        bank's longest narrations run six lines and would otherwise starve the
        enemy down to a 36px postage stamp — on a screen whose whole job is to
        render the thing you are facing, big. The clamp is also what makes the
        sigil's min-height below safe: a bounded intro means the floor can
        never push content into an inner scroll.
      */}
      {intro && (
        <p className="line-clamp-3 shrink-0 text-sm italic leading-relaxed opacity-80">
          {intro}
        </p>
      )}

      {/*
        The enemy itself. `min-h-0 flex-1` lets it claim whatever vertical
        space the rest of the stage leaves and the SVG scales to fit rather
        than overflowing — that is what keeps the 22rem slot's zero-jump
        guarantee without anyone maintaining a pixel budget here. The
        min-height is a floor so it still reads as a creature in the tightest
        state rather than dwindling to a bullet point.

        The floor steps up with width, and that is load-bearing. A fixed 88px
        floor pushes ~26px past the box at 375px (a long boss name wraps to two
        lines) and ~11px at 660px — neither of which changes the slot's height.
        They silently start an inner scroll instead, which looks fine and
        isn't. Note `sm` is a double hit: the stage's own padding goes p-6 →
        sm:p-8 at the same breakpoint, so 16px of inner height disappears
        exactly where a bigger floor would land. Hence the real floor waits
        for `lg`; below that, flex is left to settle on its own, which never
        overflows.
      */}
      <div className="relative flex min-h-[3rem] flex-1 items-center justify-center sm:min-h-[3.5rem] lg:min-h-[5.5rem]">
        <CreatureSigil
          spec={sigil}
          sprite={sprite}
          element={monster.element}
          hitNonce={hitNonce}
          turned={turned}
          className="h-full max-h-full w-auto max-w-full"
        />
        {/*
          The blow, struck over the enemy. Absolute inside this row so it adds
          nothing to the flex measurement the comment above depends on — the
          impact cannot be what pushes content into an inner scroll. It is
          `relative` on the row (not the sigil) deliberately: the mark spans
          the full row width rather than the sigil's narrower aspect box, so a
          cleave reads as sweeping across the enemy instead of being boxed in.
        */}
        <ImpactLayer
          lane={laneFor(equippedWeapon)}
          element={equippedWeapon?.element}
          hitNonce={hitNonce}
        />
      </div>

      <div className="flex shrink-0 flex-col gap-2">
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

/**
 * A face suggested out of pure light — four stacked radial-gradients in the
 * realm's foreground ink (two eyes, a mouth, a soft skull halo) at low alpha.
 * NOT art: it reads as a presence half-surfacing through the wash, the kept
 * reader buried in the warden. Always behind the content, always aria-hidden.
 */
const GHOST_FACE = [
  "radial-gradient(7% 4.5% at 43% 41%, color-mix(in oklab, var(--color-preset-fg) 13%, transparent), transparent 70%)",
  "radial-gradient(7% 4.5% at 57% 41%, color-mix(in oklab, var(--color-preset-fg) 13%, transparent), transparent 70%)",
  "radial-gradient(15% 3.5% at 50% 57%, color-mix(in oklab, var(--color-preset-fg) 10%, transparent), transparent 75%)",
  "radial-gradient(34% 44% at 50% 47%, color-mix(in oklab, var(--color-preset-fg) 6%, transparent), transparent 72%)",
].join(",");

/**
 * The reactive backdrop. Every layer is an aria-hidden, -z-10 absolute sibling
 * sitting BEHIND the centred content box, so the stage's outer geometry never
 * shifts — the zero-jump guarantee survives every transition. Nothing here is
 * interactive or readable; it only makes the screen *feel* the fight escalate.
 */
function StageReactions({
  intensity,
  reduced,
  ghostReveal,
  showGhost,
}: {
  intensity: Intensity;
  reduced: boolean | null;
  ghostReveal: number;
  showGhost: boolean;
}) {
  const danger = intensity === "lowhp" || intensity === "phase2";
  return (
    <>
      {/* Wash shift: a hostile danger tint cross-fades up as the fight turns
          dire (low HP) or the warden turns (phase 2). Opacity-only fade so we
          never interpolate a `background` string. */}
      <AnimatePresence>
        {danger && (
          <motion.div
            key="danger-wash"
            aria-hidden
            className="absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(120% 95% at 50% 0%, color-mix(in oklab, var(--color-danger) 30%, transparent) 0%, transparent 58%)",
            }}
            variants={withReducedMotion(washShift, reduced)}
            initial="out"
            animate="in"
            exit="out"
          />
        )}
      </AnimatePresence>

      {/* Low-HP danger pulse: a vignette breathing up from the floor as the
          kill nears. Keyframe variant → guarded by !reduced. */}
      {danger && !reduced && (
        <motion.div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(100% 80% at 50% 100%, color-mix(in oklab, var(--color-danger) 24%, transparent) 0%, transparent 55%)",
          }}
          variants={holdPulse}
          initial="rest"
          animate="pulse"
        />
      )}

      {/* Kept-reader ghost: the face half-surfaces under the warden. Re-keyed
          on the reveal nonce and on the phase turn so it blooms again on
          boss-start and when the warden flips. Suppressed under reduced
          motion. */}
      {showGhost && !reduced && (
        <motion.div
          key={`ghost:${ghostReveal}:${intensity === "phase2" ? "p2" : "p1"}`}
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{ background: GHOST_FACE }}
          variants={faceGhost}
          initial="hidden"
          animate="bloom"
        />
      )}
    </>
  );
}

const KIND_LABEL: Record<NonNullable<EncounterState>["kind"], string> = {
  combat: "Encounter",
};

/** The calm view: between-rooms / aftermath prose. */
function QuietStage({ intro }: { intro: string }) {
  return (
    <p className="text-base leading-relaxed opacity-90">
      {intro || "Nothing moves ahead. The quiet has a held quality, like the page before the next line is written."}
    </p>
  );
}

export function EncounterStage({
  encounter,
  intro,
  activePreset = null,
  ghostReveal = 0,
  equippedWeapon,
}: {
  encounter: EncounterState | null;
  /** Narration line emitted when the room was generated. */
  intro: string;
  /** Active realm preset, for element-label vocabulary. */
  activePreset?: Preset | null;
  /**
   * The weapon the player descended with, for the shape and hue of its
   * impact marks. Absent → unarmed, which still shows a blow.
   */
  equippedWeapon?: StageWeapon;
  /**
   * A monotonically-bumped nonce. When it changes the kept-reader ghost blooms
   * again — the caller pulses it on boss-start so the face surfaces under the
   * warden's name. `0` (the default) means "never pulsed".
   */
  ghostReveal?: number;
}) {
  const reduced = useReducedMotion();
  const isCombat = encounter?.kind === "combat";
  const kindLabel = encounter ? KIND_LABEL[encounter.kind] : "Aftermath";

  // Read the live fight to pick the stage's emotional charge. `calm` between
  // rooms; otherwise the enemy's HP and a boss's phase decide whether the
  // backdrop merely simmers (engaged), breathes danger (lowhp), or turns
  // (phase2). The ghost only belongs to bosses.
  const combat = encounter?.kind === "combat" ? encounter.combat : null;
  const monster = combat?.monster;
  const isBoss = !!monster && "bakedEffects" in monster;
  let intensity: Intensity = "calm";
  if (combat && monster) {
    const maxHp = isBoss ? monster.baseHp : monster.hp;
    const pct = maxHp <= 0 ? 0 : (combat.monsterHp / maxHp) * 100;
    const phase2 = isBoss && (combat.bossPhase ?? 0) >= 2;
    intensity = phase2 ? "phase2" : pct <= 25 ? "lowhp" : "engaged";
  }

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
      <StageReactions
        intensity={intensity}
        reduced={reduced}
        ghostReveal={ghostReveal}
        showGhost={isBoss}
      />

      {/*
        The stage is locked to its parent's fixed height. Content centres
        within the box and scrolls internally if it overruns, so the slot's
        outer geometry never changes between rooms (short intro prose vs.
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
            equippedWeapon={equippedWeapon}
          />
        ) : (
          <QuietStage intro={intro} />
        )}
      </div>
    </section>
  );
}
