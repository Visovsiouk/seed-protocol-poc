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
import { useTranslatedCard } from "@/lib/contracts/adapters";

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

// `+${n}` always prepends `+`, even for negatives — emit `+3` / `-2`
// without the broken `+-2` rendering.
function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
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
  currentRealm,
}: {
  label: string;
  card?: AssetCard;
  currentRealm: `0x${string}`;
}) {
  // Translate equipped gear into the realm the player is currently in,
  // mirroring the AssetCard pattern in the inventory drawer. When the
  // source preset matches the current preset the hook short-circuits
  // and returns the input card unchanged.
  const { data: translated } = useTranslatedCard(card, currentRealm);
  const display = translated ?? card;
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
        {display?.name ?? "— empty —"}
      </span>
      {display && (
        <span className="opacity-60">
          T{display.tier}
          {display.damageDie
            ? ` · d${display.damageDie}` +
              (display.attackBonus ? ` ${signed(display.attackBonus)} hit` : "") +
              (display.damageBonus ? ` ${signed(display.damageBonus)} dmg` : "") +
              (display.element && display.element !== "none" ? ` · ${display.element}` : "")
            : ""}
          {display.acBonus !== undefined
            ? ` · AC${signed(display.acBonus)} HP${signed(display.hpBonus ?? 0)}` +
              (display.resistElement && display.resistElement !== "none"
                ? ` · resists ${display.resistElement}`
                : "")
            : ""}
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
  // Combat HP wins during a fight (reflects ongoing damage). Outside
  // combat (trial / rest / between-room), read from the persistent
  // RunState pool so the bar reflects real carry-over HP — not a stale
  // 25+hpBonus fallback that predates HP persistence.
  const hp = combat?.playerHp ?? run.playerHp;
  const maxHp = combat?.playerMaxHp ?? run.playerMaxHp;
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
        <SlotChip label="Weapon" card={run.equipped.weapon} currentRealm={run.realm} />
        <SlotChip label="Armor" card={run.equipped.armor} currentRealm={run.realm} />
      </div>
    </section>
  );
}
