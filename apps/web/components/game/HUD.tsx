"use client";

/**
 * Player HUD rail. The run's "stakes
 * are visible" surface: HP/AC, the depth meter (how far toward the boss
 * floor), the carried-escrow-at-risk readout, and a full equipment
 * breakdown with element/effect chips.
 *
 * State source: the engine's `RunState` plus the active `CombatState`. We
 * pull HP/AC from the combat state when an encounter is live (so it
 * reflects mid-fight damage) and fall back to the realm-armor-baseline
 * between rooms. Built entirely on the shared kit — no inline panel styling.
 */

import type {
  AssetCard,
  CombatState,
  RunState,
} from "@/lib/engine/types";
import { useTranslatedCard } from "@/lib/contracts/adapters";
import { elementColor } from "@/lib/ui/loot-visuals";
import { Panel, Meter, Stat, ElementChip, EffectChip } from "@/components/ui";

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

// ─── HP meter ──────────────────────────────────────────────────────────────

function HpBar({ hp, max }: { hp: number; max: number }) {
  const pct = max <= 0 ? 0 : Math.round((hp / max) * 100);
  const color =
    pct > 60
      ? "var(--color-ok)"
      : pct > 33
        ? "var(--color-warn)"
        : "var(--color-danger)";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="opacity-40 uppercase tracking-widest text-[9px]">HP</span>
        <span className="tabular-nums font-bold text-sm">
          {hp}
          <span className="opacity-35 font-normal text-xs">/{max}</span>
        </span>
      </div>
      <Meter value={hp} max={max} color={color} />
    </div>
  );
}

// ─── boxed stat badge ──────────────────────────────────────────────────────

function StatBadge({ label, value }: { label: string; value: string | number }) {
  return (
    <Panel tone="glass-2" className="px-3 py-1.5">
      <Stat label={label} value={value} />
    </Panel>
  );
}

// ─── depth meter ───────────────────────────────────────────────────────────
// Segmented ticks 1 ··· bossDepth, descended nodes lit. Reads
// how far the player has pushed and how far the boss floor still is.

function DepthMeter({ depth, bossDepth }: { depth: number; bossDepth: number }) {
  return (
    <Panel tone="glass-2" className="flex flex-col gap-1 px-3 py-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="opacity-40 uppercase tracking-widest text-[9px]">Depth</span>
        <span className="tabular-nums text-xs font-bold leading-none">
          {depth}
          <span className="opacity-35 font-normal">/{bossDepth}</span>
        </span>
      </div>
      <Meter value={depth} max={bossDepth} segments={bossDepth} />
    </Panel>
  );
}

// ─── escrow-at-risk readout ───────────────────────────────────────────────────

/**
 * Carried-findings readout. Surfaces the count of unminted
 * loot the player is holding this run and whether it's at risk. On
 * permadeath realms the findings evaporate on a fall, so the badge runs
 * hot (danger); on seed-mercy starters they survive the rewind, so it stays
 * cool (accent).
 */
function EscrowBadge({ count, atRisk }: { count: number; atRisk: boolean }) {
  const color = atRisk ? "var(--color-danger)" : "var(--color-preset-accent)";
  return (
    <div
      className="flex flex-col gap-0.5 px-3 py-1.5 rounded-lg border"
      style={{
        background: `color-mix(in oklab, ${color} 12%, transparent)`,
        borderColor: `color-mix(in oklab, ${color} 30%, transparent)`,
      }}
    >
      <span className="opacity-50 uppercase tracking-widest text-[9px]">
        {atRisk ? "At risk" : "Carried"}
      </span>
      <span className="tabular-nums text-sm font-bold leading-none" style={{ color }}>
        {count} unminted
      </span>
    </div>
  );
}

// ─── equipment card ──────────────────────────────────────────────────────────

function SlotCard({
  label,
  card,
  currentRealm,
}: {
  label: string;
  card?: AssetCard;
  currentRealm: `0x${string}`;
}) {
  const { data: translated } = useTranslatedCard(card, currentRealm);
  const display = translated ?? card;

  // Tint the card border toward the element color when equipped.
  const el =
    display?.element && display.element !== "none" ? display.element : null;
  const elColor = el ? elementColor(el) : null;
  const borderColor = elColor
    ? `color-mix(in oklab, ${elColor} 30%, var(--border-1))`
    : "var(--border-1)";

  const hasEffects =
    display &&
    (display.catalogEffects.length > 0 ||
      (display.element && display.element !== "none") ||
      (display.resistElement && display.resistElement !== "none"));

  return (
    <div
      className="flex flex-col rounded-lg overflow-hidden flex-1 bg-[var(--surface-1)] border"
      style={{ borderColor, minWidth: 174 }}
    >
      {/* header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-1)]">
        <span className="opacity-40 uppercase tracking-widest text-[9px]">{label}</span>
        {display && (
          <span className="px-1.5 py-px rounded text-[10px] font-bold tabular-nums bg-[var(--surface-3)]">
            T{display.tier}
          </span>
        )}
      </div>

      {/* name */}
      <div className="px-3 pt-2.5 pb-2">
        <span className="font-semibold text-sm leading-snug">
          {display?.name ?? (
            <span className="opacity-25 italic font-normal">empty</span>
          )}
        </span>
      </div>

      {/* core stats */}
      {display && (
        <div className="px-3 pb-2 flex flex-col gap-1">
          {display.damageDie != null && (
            <div className="flex justify-between items-center text-[11px]">
              <span className="opacity-40">Damage</span>
              <span className="font-semibold tabular-nums">d{display.damageDie}</span>
            </div>
          )}
          {display.attackBonus != null && display.attackBonus !== 0 && (
            <div className="flex justify-between items-center text-[11px]">
              <span className="opacity-40">Hit</span>
              <span className="font-semibold tabular-nums">{signed(display.attackBonus)}</span>
            </div>
          )}
          {display.damageBonus != null && display.damageBonus !== 0 && (
            <div className="flex justify-between items-center text-[11px]">
              <span className="opacity-40">Dmg bonus</span>
              <span className="font-semibold tabular-nums">{signed(display.damageBonus)}</span>
            </div>
          )}
          {display.acBonus != null && (
            <div className="flex justify-between items-center text-[11px]">
              <span className="opacity-40">AC</span>
              <span className="font-semibold tabular-nums">{signed(display.acBonus)}</span>
            </div>
          )}
          {display.hpBonus != null && display.hpBonus !== 0 && (
            <div className="flex justify-between items-center text-[11px]">
              <span className="opacity-40">HP</span>
              <span className="font-semibold tabular-nums">{signed(display.hpBonus)}</span>
            </div>
          )}
        </div>
      )}

      {/* effects — element + catalog effects */}
      {hasEffects && (
        <div className="px-3 py-2.5 flex flex-wrap gap-1 mt-auto border-t border-[var(--border-1)]">
          {display!.element && display!.element !== "none" && (
            <ElementChip element={display!.element} />
          )}
          {display!.resistElement && display!.resistElement !== "none" && (
            <ElementChip element={display!.resistElement} kind="resist" />
          )}
          {display!.catalogEffects.map((eff, i) => (
            <EffectChip key={i} effect={eff} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── main HUD ────────────────────────────────────────────────────────────────

export function HUD({
  run,
  combat,
}: {
  run: RunState;
  combat?: CombatState;
}) {
  const hp = combat?.playerHp ?? run.playerHp;
  const maxHp = combat?.playerMaxHp ?? run.playerMaxHp;
  const ac = combat?.playerAc ?? 10 + (run.equipped.armor?.acBonus ?? 0);

  return (
    <Panel
      as="section"
      tone="glass-1"
      className="flex gap-4 px-4 py-3"
      aria-label="Player HUD"
    >
      {/* vitals column */}
      <div
        className="flex flex-col justify-center gap-3 pr-4 shrink-0 border-r border-[var(--border-1)]"
        style={{ minWidth: 170 }}
      >
        <HpBar hp={hp} max={maxHp} />
        <div className="flex gap-2">
          <StatBadge label="AC" value={ac} />
          {combat?.bossPhase && (
            <StatBadge label="Boss" value={`P${combat.bossPhase}`} />
          )}
        </div>
        <DepthMeter depth={run.depth} bossDepth={run.bossDepth} />
        {run.escrow.length > 0 && (
          <EscrowBadge count={run.escrow.length} atRisk={run.defeatMode === "permadeath"} />
        )}
      </div>

      {/* equipment column */}
      <div className="flex gap-2 flex-1 min-w-0">
        <SlotCard label="Weapon" card={run.equipped.weapon} currentRealm={run.realm} />
        <SlotCard label="Armor"  card={run.equipped.armor}  currentRealm={run.realm} />
      </div>
    </Panel>
  );
}
