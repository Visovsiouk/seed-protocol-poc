"use client";

/**
 * Player HUD. Renders HP/AC/depth + a
 * full equipment breakdown including catalog effects.
 *
 * State source: the engine's `RunState` plus the active `CombatState`. We
 * pull HP/AC from the combat state when an encounter is live (so it
 * reflects mid-fight damage) and fall back to the realm-armor-baseline
 * between rooms.
 */

import type {
  AssetCard,
  CatalogEffect,
  CatalogEffectName,
  CombatState,
  RunState,
} from "@/lib/engine/types";
import { useTranslatedCard } from "@/lib/contracts/adapters";

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

// ─── element colors (all three preset vocabularies) ──────────────────────────

const ELEMENT_COLORS: Record<string, string> = {
  // fantasy
  fire:       "#e85d04",
  ice:        "#4cc9f0",
  shock:      "#f8c020",
  holy:       "#fffbcc",
  unholy:     "#9d4edd",
  // scifi
  plasma:     "#c77dff",
  cryo:       "#48cae4",
  ion:        "#f8c020",
  photon:     "#eeeeee",
  void:       "#7b2fff",
  // cyberpunk
  incendiary: "#e85d04",
  cryogenic:  "#4cc9f0",
  emp:        "#f8c020",
  laser:      "#ff6b6b",
  nano:       "#6a994e",
};

function elementColor(el: string): string {
  return ELEMENT_COLORS[el.toLowerCase()] ?? "rgba(255,255,255,0.5)";
}

// ─── catalog effect display config ───────────────────────────────────────────

type EffectMeta = { label: string; color: string; format: (v: number) => string };

const EFFECT_META: Record<CatalogEffectName, EffectMeta> = {
  lifesteal:        { label: "Lifesteal",  color: "#e05252", format: v => `+${v} HP/hit` },
  armor_pierce:     { label: "Pierce",     color: "#e8a020", format: ()  => "ignores AC" },
  crit_chance:      { label: "Crit",       color: "#f8c020", format: v  => `${v}%`       },
  multi_hit:        { label: "Multi-Hit",  color: "#c77dff", format: v  => `×${v + 1}`   },
  bleed:            { label: "Bleed",      color: "#c1121f", format: v  => `${v}/turn`   },
  regen:            { label: "Regen",      color: "#4cc9f0", format: v  => `+${v}/turn`  },
  thorns:           { label: "Thorns",     color: "#6a994e", format: v  => `${v} reflect` },
  dodge_chance:     { label: "Dodge",      color: "#9b5de5", format: v  => `${v}%`       },
  damage_reduction: { label: "DR",         color: "#4361ee", format: v  => `-${v} dmg`   },
};

// ─── chips ───────────────────────────────────────────────────────────────────

function Chip({
  color,
  label,
  sub,
}: {
  color: string;
  label: string;
  sub?: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold"
      style={{
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`,
        color,
      }}
    >
      <span className="uppercase tracking-wide leading-none">{label}</span>
      {sub && <span style={{ opacity: 0.75 }} className="font-normal leading-none">{sub}</span>}
    </span>
  );
}

function EffectChip({ effect }: { effect: CatalogEffect }) {
  const meta = EFFECT_META[effect.name];
  if (!meta) return null;
  return <Chip color={meta.color} label={meta.label} sub={meta.format(effect.value)} />;
}

function ElementChip({ element, prefix }: { element: string; prefix?: string }) {
  const color = elementColor(element);
  return <Chip color={color} label={prefix ? `${prefix} ${element}` : element} />;
}

// ─── HP bar ──────────────────────────────────────────────────────────────────

function HpBar({ hp, max }: { hp: number; max: number }) {
  const pct = max <= 0 ? 0 : clamp(Math.round((hp / max) * 100), 0, 100);
  const barColor =
    pct > 60
      ? "var(--color-preset-accent)"
      : pct > 33
      ? "#e8a020"
      : "#d44";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="opacity-40 uppercase tracking-widest text-[9px]">HP</span>
        <span className="tabular-nums font-bold text-sm">
          {hp}
          <span className="opacity-35 font-normal text-xs">/{max}</span>
        </span>
      </div>
      <div
        className="h-2 rounded-full overflow-hidden"
        style={{ background: "rgba(255,255,255,0.07)" }}
      >
        <div
          className="h-full transition-all duration-200 rounded-full"
          style={{
            width: `${pct}%`,
            background: barColor,
            boxShadow: `0 0 8px ${barColor}70`,
          }}
        />
      </div>
    </div>
  );
}

// ─── compact stat badge ───────────────────────────────────────────────────────

function StatBadge({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded"
      style={{
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <span className="opacity-40 uppercase tracking-widest text-[9px]">{label}</span>
      <span className="tabular-nums text-base font-bold leading-none">{value}</span>
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

  // Tint the card border toward the element color when equipped
  const el =
    display?.element && display.element !== "none" ? display.element : null;
  const elColor = el ? elementColor(el) : null;
  const borderColor = elColor
    ? `color-mix(in srgb, ${elColor} 22%, rgba(255,255,255,0.08))`
    : "rgba(255,255,255,0.08)";

  const hasEffects =
    display &&
    (display.catalogEffects.length > 0 ||
      (display.element && display.element !== "none") ||
      (display.resistElement && display.resistElement !== "none"));

  return (
    <div
      className="flex flex-col rounded-lg overflow-hidden flex-1"
      style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${borderColor}`, minWidth: 174 }}
    >
      {/* header */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <span className="opacity-40 uppercase tracking-widest text-[9px]">{label}</span>
        {display && (
          <span
            className="px-1.5 py-px rounded text-[10px] font-bold tabular-nums"
            style={{ background: "rgba(255,255,255,0.1)" }}
          >
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
        <div
          className="px-3 py-2.5 flex flex-wrap gap-1 mt-auto"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          {display!.element && display!.element !== "none" && (
            <ElementChip element={display!.element} />
          )}
          {display!.resistElement && display!.resistElement !== "none" && (
            <ElementChip element={display!.resistElement} prefix="resists" />
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
    <section
      className="flex gap-4 px-4 py-3 rounded-lg"
      style={{
        background: "rgba(0,0,0,0.30)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
      aria-label="Player HUD"
    >
      {/* vitals column */}
      <div
        className="flex flex-col justify-center gap-3 pr-4 shrink-0"
        style={{ borderRight: "1px solid rgba(255,255,255,0.07)", minWidth: 150 }}
      >
        <HpBar hp={hp} max={maxHp} />
        <div className="flex gap-2">
          <StatBadge label="AC" value={ac} />
          <StatBadge label="Depth" value={run.depth} />
          {combat?.bossPhase && (
            <StatBadge label="Boss" value={`P${combat.bossPhase}`} />
          )}
        </div>
      </div>

      {/* equipment column */}
      <div className="flex gap-2 flex-1 min-w-0">
        <SlotCard label="Weapon" card={run.equipped.weapon} currentRealm={run.realm} />
        <SlotCard label="Armor"  card={run.equipped.armor}  currentRealm={run.realm} />
      </div>
    </section>
  );
}
