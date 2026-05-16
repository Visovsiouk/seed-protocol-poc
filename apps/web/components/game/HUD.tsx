"use client";

/**
 * Player HUD. Renders HP/AC/depth + a
 * thumbnail of the equipped weapon and armor.
 *
 * State source: the engine's `RunState` plus the active `CombatState`. We
 * pull HP/AC from the combat state when an encounter is live (so it
 * reflects mid-fight damage) and fall back to the realm-armor-baseline
 * between rooms.
 */

import type { AssetCard, CombatState, RunState } from "@/lib/engine/types";

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function HpBar({ hp, max }: { hp: number; max: number }) {
  const pct = max <= 0 ? 0 : clamp(Math.round((hp / max) * 100), 0, 100);
  return (
    <div className="flex flex-col gap-1 min-w-[140px]">
      <div className="flex items-baseline justify-between text-xs opacity-80">
        <span>HP</span>
        <span className="tabular-nums">
          {hp}/{max}
        </span>
      </div>
      <div
        className="h-2 rounded-full overflow-hidden"
        style={{ background: "rgba(255,255,255,0.08)" }}
      >
        <div
          className="h-full transition-all"
          style={{
            width: `${pct}%`,
            background: pct > 33 ? "var(--color-preset-accent)" : "#d44",
          }}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-0.5 text-xs">
      <span className="opacity-60">{label}</span>
      <span className="tabular-nums text-sm font-semibold">{value}</span>
    </div>
  );
}

function SlotChip({
  label,
  card,
}: {
  label: string;
  card?: AssetCard;
}) {
  return (
    <div
      className="flex flex-col gap-0.5 px-2 py-1.5 rounded text-xs"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <span className="opacity-50 uppercase tracking-wide text-[10px]">{label}</span>
      <span className="font-medium truncate max-w-[140px]">
        {card?.name ?? "— empty —"}
      </span>
      {card && (
        <span className="opacity-60">
          T{card.tier}
          {card.damageDie
            ? ` · d${card.damageDie}` +
              (card.attackBonus ? ` +${card.attackBonus} hit` : "") +
              (card.damageBonus ? ` +${card.damageBonus} dmg` : "")
            : ""}
          {card.acBonus !== undefined ? ` · AC+${card.acBonus} HP+${card.hpBonus ?? 0}` : ""}
        </span>
      )}
    </div>
  );
}

export function HUD({
  run,
  combat,
}: {
  run: RunState;
  combat?: CombatState;
}) {
  const hp = combat?.playerHp ?? 25 + (run.equipped.armor?.hpBonus ?? 0);
  const maxHp = combat?.playerMaxHp ?? 25 + (run.equipped.armor?.hpBonus ?? 0);
  const ac = combat?.playerAc ?? 10 + (run.equipped.armor?.acBonus ?? 0);

  return (
    <section
      className="flex items-end justify-between gap-6 px-4 py-3 rounded-md"
      style={{
        background: "rgba(0,0,0,0.25)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
      aria-label="Player HUD"
    >
      <div className="flex items-end gap-6">
        <HpBar hp={hp} max={maxHp} />
        <Stat label="AC" value={ac} />
        <Stat label="Depth" value={run.depth} />
        {combat?.bossPhase && (
          <Stat label="Boss" value={`Phase ${combat.bossPhase}`} />
        )}
      </div>
      <div className="flex gap-2">
        <SlotChip label="Weapon" card={run.equipped.weapon} />
        <SlotChip label="Armor" card={run.equipped.armor} />
      </div>
    </section>
  );
}
