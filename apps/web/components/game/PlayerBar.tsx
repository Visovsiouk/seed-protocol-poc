"use client";

/**
 * PlayerBar — the persistent footer status bar for `/play/[preset]`.
 *
 * Reframes the old top-of-screen HUD card as a fighting-game life bar: the
 * enemy looms above on the `<EncounterStage/>`, and YOU sit along the bottom.
 * It carries the run's stakes at a glance:
 *
 *   - a bold HP bar that flashes + throws a floating number when you're hit,
 *   - AC, the depth pips toward the boss floor, and the carried-escrow
 *     "at risk" count (permadeath forfeits it),
 *   - compact equipped weapon/armor readouts with element/effect chips,
 *     doubling as the inventory affordance: the slots (and an explicit
 *     "Inventory (N)" button) open the drawer, so gear management lives in
 *     the HUD instead of the page top bar.
 *
 * Same data source as before (`RunState` + live `CombatState`); only the
 * presentation moved. Realm-translated gear names come through
 * `useTranslatedCard` exactly as the inventory drawer renders them.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { AssetCard, CombatState, RunState } from "@/lib/engine/types";
import { useTranslatedCard } from "@/lib/contracts/adapters";
import { elementColor } from "@/lib/ui/loot-visuals";
import { Button, ElementChip, EffectChip, Rule } from "@/components/ui";

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

// ─── HP rail (bold, with hit flash + floating number) ───────────────────────

function HpRail({ hp, max }: { hp: number; max: number }) {
  const reduced = useReducedMotion();
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (hp / max) * 100));
  const color =
    pct > 60
      ? "var(--color-ok)"
      : pct > 33
        ? "var(--color-warn)"
        : "var(--color-danger)";

  const prev = useRef(hp);
  const idRef = useRef(0);
  const [floats, setFloats] = useState<
    { id: number; text: string; color: string; lane: number }[]
  >([]);
  const [flash, setFlash] = useState(false);
  // Per-float expiry timers + a single flash timer, cleared only on unmount.
  // An effect-cleanup would run on every HP change and cancel the *previous*
  // float's removal, leaving stale numbers stuck above the bar.
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current.clear();
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  useEffect(() => {
    const delta = hp - prev.current;
    prev.current = hp;
    if (delta === 0) return;
    const id = ++idRef.current;
    const hurt = delta < 0;
    setFloats((f) => [
      ...f,
      {
        id,
        text: hurt ? `${delta}` : `+${delta}`,
        color: hurt ? "var(--color-danger)" : "var(--color-ok)",
        // Consecutive hits land in different lanes so back-to-back damage
        // numbers fan out to the left instead of stacking on the same
        // pixel (all floats were anchored `right-0`). Cycles every 3.
        lane: id % 3,
      },
    ]);
    const t = setTimeout(() => {
      setFloats((f) => f.filter((x) => x.id !== id));
      timers.current.delete(t);
    }, 900);
    timers.current.add(t);
    if (hurt) {
      setFlash(true);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(false), 320);
    }
  }, [hp]);

  return (
    <div className="relative flex min-w-[180px] flex-1 flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-70">
          Vitality
        </span>
        <span className="font-mono text-sm font-bold tabular-nums">
          {hp}
          <span className="text-xs font-normal opacity-65">/{max}</span>
        </span>
      </div>
      {/*
        The bar gets its own relative wrapper so the floating damage number
        can be anchored directly ABOVE the bar (bottom-full), rising up. The
        old `-top-2` anchor pinned it to the top of the whole rail — above
        the "Vitality" label, against the panel's top border, where it read
        as a clipped blob detached from the bar.
      */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 bottom-full mb-1 flex justify-end">
          <AnimatePresence>
            {floats.map((f) => (
              <motion.span
                key={f.id}
                className="absolute bottom-0 font-[family-name:var(--font-display)] text-xl font-bold tabular-nums"
                style={{ color: f.color, right: f.lane * 26 }}
                initial={{ opacity: 0, y: 4, scale: 0.7 }}
                animate={{ opacity: 1, y: -22, scale: 1 }}
                exit={{ opacity: 0, y: -36 }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              >
                {f.text}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
        <div className="relative h-3 w-full overflow-hidden rounded-full bg-[color-mix(in_oklab,#000_40%,transparent)] ring-1 ring-[var(--border-1)]">
          <motion.div
            className="h-full rounded-full"
            style={{ background: color, boxShadow: `0 0 12px -1px ${color}` }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: reduced ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
          />
          <AnimatePresence>
            {flash && (
              <motion.div
                className="absolute inset-0 bg-[var(--color-danger)]"
                initial={{ opacity: 0.55 }}
                animate={{ opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// ─── depth pips ─────────────────────────────────────────────────────────────

function DepthPips({ depth, bossDepth }: { depth: number; bossDepth: number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-70">
        Depth {depth}/{bossDepth}
      </span>
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: bossDepth }, (_, i) => {
          const lit = i < depth;
          const isBossFloor = i === bossDepth - 1;
          const color = isBossFloor ? "var(--color-danger)" : "var(--color-preset-accent)";
          return (
            <span
              key={i}
              className="h-2 w-5 rounded-full transition-[background,box-shadow]"
              style={{
                background: lit ? color : "var(--surface-3)",
                boxShadow: lit ? `0 0 8px -1px ${color}` : "none",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── compact stat ───────────────────────────────────────────────────────────

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-1">
      <span
        className="font-mono text-[10px] uppercase tracking-[0.2em]"
        style={{ color: tone === "danger" ? "var(--color-danger)" : undefined, opacity: tone ? 0.9 : 0.7 }}
      >
        {label}
      </span>
      <span
        className="font-mono text-lg font-bold tabular-nums leading-none"
        style={{ color: tone === "danger" ? "var(--color-danger)" : undefined }}
      >
        {value}
      </span>
    </div>
  );
}

// ─── compact gear slot ──────────────────────────────────────────────────────

function GearSlot({
  label,
  card,
  currentRealm,
  onClick,
}: {
  label: string;
  card?: AssetCard;
  currentRealm: `0x${string}`;
  /** Opens the inventory drawer to swap this slot. */
  onClick?: () => void;
}) {
  const { data: translated } = useTranslatedCard(card, currentRealm);
  const display = translated ?? card;

  const el = display?.element && display.element !== "none" ? display.element : null;
  const borderColor = el
    ? `color-mix(in oklab, ${elementColor(el)} 35%, var(--border-1))`
    : "var(--border-1)";

  const stat =
    display?.damageDie != null
      ? `d${display.damageDie}${display.attackBonus ? ` ${signed(display.attackBonus)}` : ""}`
      : display
        ? [
            display.acBonus != null ? `AC ${signed(display.acBonus)}` : null,
            display.hpBonus ? `HP ${signed(display.hpBonus)}` : null,
          ]
            .filter(Boolean)
            .join(" · ")
        : "";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={onClick ? `${label} — open inventory to change` : label}
      className="flex min-w-0 flex-1 flex-col gap-1 rounded-lg border bg-[var(--surface-1)] px-3 py-2 text-left transition enabled:hover:border-[var(--color-preset-accent)] enabled:hover:brightness-110 disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ borderColor, cursor: onClick ? "pointer" : "default" }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[9px] uppercase tracking-[0.25em] opacity-70">
          {label}
        </span>
        {display && (
          <span className="rounded bg-[var(--surface-3)] px-1.5 py-px font-mono text-[10px] font-bold tabular-nums">
            T{display.tier}
          </span>
        )}
      </div>
      <span className="truncate text-sm font-semibold leading-tight">
        {display?.name ?? <span className="italic font-normal opacity-25">empty</span>}
      </span>
      {display && (
        <div className="flex flex-wrap items-center gap-1">
          {stat && <span className="font-mono text-[11px] tabular-nums opacity-70">{stat}</span>}
          {display.element && display.element !== "none" && (
            <ElementChip element={display.element} />
          )}
          {display.resistElement && display.resistElement !== "none" && (
            <ElementChip element={display.resistElement} kind="resist" />
          )}
          {display.catalogEffects.map((eff, i) => (
            <EffectChip key={i} effect={eff} />
          ))}
        </div>
      )}
    </button>
  );
}

// ─── main bar ────────────────────────────────────────────────────────────────

export function PlayerBar({
  run,
  combat,
  inventoryCount,
  onOpenInventory,
  actions,
}: {
  run: RunState;
  combat?: CombatState;
  /** Owned-asset count, shown on the inventory affordance. */
  inventoryCount?: number;
  /** Opens the inventory drawer. When omitted the gear row is read-only. */
  onOpenInventory?: () => void;
  /**
   * The active run controls (combat actions, or the Descend/Extract row).
   * Rendered at the top of the bar — nearest the log — above the vitals, so
   * the play screen reads as three panes: Main · Log · Player. Omitted in
   * states with no owned action (the focal slot owns the outcome CTA then).
   */
  actions?: ReactNode;
}) {
  const hp = combat?.playerHp ?? run.playerHp;
  const maxHp = combat?.playerMaxHp ?? run.playerMaxHp;
  const ac = combat?.playerAc ?? 10 + (run.equipped.armor?.acBonus ?? 0);

  return (
    <section
      aria-label="Your status"
      className="flex flex-col gap-4 rounded-2xl border border-[var(--border-2)] bg-[var(--surface-2)] p-4 shadow-[0_-12px_40px_-28px_var(--glow)]"
    >
      {actions && (
        <>
          {actions}
          <Rule tone="muted" />
        </>
      )}

      {/* vitals row */}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <HpRail hp={hp} max={maxHp} />
        <div className="flex items-end gap-4">
          <MiniStat label="AC" value={String(ac)} />
          {run.escrow.length > 0 && (
            <MiniStat label="At risk" value={String(run.escrow.length)} tone="danger" />
          )}
        </div>
        <DepthPips depth={run.depth} bossDepth={run.bossDepth} />
      </div>

      {/* gear row */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-70">
            Loadout
          </span>
          {onOpenInventory && (
            <Button intent="ghost" size="sm" onClick={onOpenInventory}>
              Inventory
              {typeof inventoryCount === "number" ? ` (${inventoryCount})` : ""} →
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <GearSlot
            label="Weapon"
            card={run.equipped.weapon}
            currentRealm={run.realm}
            onClick={onOpenInventory}
          />
          <GearSlot
            label="Armor"
            card={run.equipped.armor}
            currentRealm={run.realm}
            onClick={onOpenInventory}
          />
        </div>
      </div>
    </section>
  );
}
