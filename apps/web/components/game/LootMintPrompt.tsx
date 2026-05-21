"use client";

/**
 * Loot-drop prompt that surfaces after a room clear. Renders the rolled
 * stats and lets the player "Mint and equip" (dispatches the on-chain
 * mint via the caller's `onMint`) or "Skip".
 *
 * Why a prompt and not auto-mint: the player should see what dropped
 * before paying gas.
 */

import { useState } from "react";
import type { Element, LootRoll, Preset } from "@/lib/engine/types";
import { assembleLootName } from "@/lib/flavor";
import type { FlavorBank } from "@/lib/flavor/types";
import { useElementLabel } from "@/lib/contracts/adapters";

type Props = {
  loot: LootRoll;
  bank: FlavorBank;
  /**
   * The preset whose vocabulary should label the element / resist
   * fields. The canonical element keys ("fire", "ice", …) flow
   * through the on-chain `elementLabel(preset, element)` view so the
   * drop reads in the current realm's voice — fire → incendiary in
   * cyberpunk, holy → divine-light in sci-fi, etc.
   */
  preset: Preset;
  onMint: () => Promise<void> | void;
  onSkip: () => void;
};

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="opacity-60">{label}</span>
      <span className="tabular-nums font-medium">{value}</span>
    </div>
  );
}

/**
 * Element value row. The canonical element key ("fire", "ice", …) is
 * the on-chain truth; the human-facing label is read live from the
 * adapter via `useElementLabel(preset, element)` so a fantasy "fire"
 * drop reads as "incendiary" in cyberpunk / "thermal" in sci-fi, etc.
 * The hook returns the canonical key as a synchronous placeholder
 * before the chain read resolves — so we never render a blank value.
 */
function ElementRow({
  label,
  element,
  preset,
}: {
  label: string;
  element: Element;
  preset: Preset;
}) {
  const vocab = useElementLabel(element, preset);
  return <StatRow label={label} value={vocab} />;
}

export function LootMintPrompt({ loot, bank, preset, onMint, onSkip }: Props) {
  const [minting, setMinting] = useState(false);
  // The engine's `pickSlot` only returns weapon|armor; the wider `Slot` type
  // on `LootRoll` is for type-surface consistency with `AssetCard`.
  const name = assembleLootName(
    bank,
    loot.slot as "weapon" | "armor",
    loot.nameSeed,
  );

  const handleMint = async () => {
    setMinting(true);
    try {
      await onMint();
    } finally {
      setMinting(false);
    }
  };

  return (
    <section
      aria-label="Loot drop"
      className="flex flex-col gap-4 p-5 rounded-md"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid var(--color-preset-accent)",
      }}
    >
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest opacity-50">
            Loot dropped
          </p>
          <h3 className="text-xl font-semibold">{name}</h3>
        </div>
        <span
          className="text-xs px-2 py-1 rounded font-semibold"
          style={{
            background: "var(--color-preset-accent)",
            color: "var(--color-preset-bg)",
          }}
        >
          Tier {loot.tier}
        </span>
      </header>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        <StatRow label="Slot" value={loot.slot} />
        <StatRow label="Schema" value={`#${loot.schemaId}`} />
        {loot.damageDie !== undefined && (
          <StatRow label="Damage" value={`d${loot.damageDie}`} />
        )}
        {loot.attackBonus !== undefined && (
          <StatRow label="Attack" value={`+${loot.attackBonus}`} />
        )}
        {loot.damageBonus !== undefined && (
          <StatRow label="Damage bonus" value={`+${loot.damageBonus}`} />
        )}
        {loot.acBonus !== undefined && (
          <StatRow label="AC" value={`+${loot.acBonus}`} />
        )}
        {loot.hpBonus !== undefined && (
          <StatRow label="HP" value={`+${loot.hpBonus}`} />
        )}
        {loot.element !== undefined && loot.element !== "none" && (
          <ElementRow label="Element" element={loot.element} preset={preset} />
        )}
        {loot.resistElement !== undefined && loot.resistElement !== "none" && (
          <ElementRow
            label="Resists"
            element={loot.resistElement}
            preset={preset}
          />
        )}
      </div>

      {loot.catalogEffects.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {loot.catalogEffects.map((e) => (
            <span
              key={e.name}
              className="text-xs px-2 py-1 rounded"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              {e.name.replace(/_/g, " ")} {e.value}
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2 mt-1">
        <button
          type="button"
          onClick={handleMint}
          disabled={minting}
          className="rounded-md px-4 py-2 text-sm font-medium transition disabled:opacity-50"
          style={{
            background: "var(--color-preset-accent)",
            color: "var(--color-preset-bg)",
          }}
        >
          {minting ? "Minting…" : "Mint and equip"}
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={minting}
          className="rounded-md px-4 py-2 text-sm transition disabled:opacity-50"
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "var(--color-preset-fg)",
          }}
        >
          Skip
        </button>
      </div>
    </section>
  );
}
