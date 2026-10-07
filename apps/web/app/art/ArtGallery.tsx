"use client";

/**
 * The gallery surface. Toggles `data-preset` / `data-theme` on a wrapper so
 * every combination of genre palette and CRT skin can be inspected without
 * navigating the real app — `globals.css` re-declares the surface tokens on
 * `[data-preset]` and `[data-theme]` elements precisely so this works on a
 * plain div.
 */

import { useState } from "react";
import {
  combatArmorTypesFor,
  combatElementsFor,
  combatWeaponTypesFor,
  type CombatState,
  type EncounterState,
  type Preset,
} from "@/lib/engine/types";
import { EncounterStage } from "@/components/game/EncounterStage";
import { getFlavorBank } from "@/lib/flavor";
import { familyFor, isTagged } from "@/lib/art/families";
import { creatureSpec } from "@/lib/art/creature";
import { ItemGlyph } from "@/components/art/ItemGlyph";
import { CreatureSigil } from "@/components/art/CreatureSigil";
import { PlayerSigil } from "@/components/art/PlayerSigil";

const PRESETS: readonly Preset[] = ["fantasy", "scifi", "cyberpunk"];
const TIERS = [1, 2, 3, 4, 5] as const;

/** Well-known local-chain addresses — handy, recognisable crest fodder. */
const ANVIL_ACCOUNTS = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
  "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
] as const;

/** Inert defaults for the per-turn combat flags the stage never reads. */
const QUIET: Pick<
  CombatState,
  | "bracedThisTurn" | "guaranteedDodgeThisTurn" | "regenDoubledThisTurn"
  | "thornsDoubledThisTurn" | "focusPrimed" | "phase2PlayerBuffed"
  | "bleedStacks" | "suppressedEffects" | "playerHp" | "playerMaxHp" | "playerAc"
> = {
  bracedThisTurn: false,
  guaranteedDodgeThisTurn: false,
  regenDoubledThisTurn: false,
  thornsDoubledThisTurn: false,
  focusPrimed: false,
  phase2PlayerBuffed: false,
  bleedStacks: 0,
  suppressedEffects: [],
  playerHp: 30,
  playerMaxHp: 30,
  playerAc: 12,
};

const LONG_INTRO =
  "The passage narrows until the walls are close enough to touch on both sides at once, and the air goes thick and still, carrying a smell like wet iron left out in the rain for a season. Something ahead has been waiting long enough to stop pacing.";

/**
 * The stage states that must all hold the same height: a fresh room, a fight
 * in progress, a near-kill, both boss phases, the longest narration in the
 * bank, and the between-rooms calm. If any of these differs from 352px or
 * scrolls internally, the zero-jump guarantee is broken.
 */
function stageCases(preset: Preset): {
  label: string;
  encounter: EncounterState | null;
  intro: string;
}[] {
  const bank = getFlavorBank(preset);
  const mob = Object.values(bank.monsters)[0]!;
  const tough = Object.values(bank.monsters).slice(-1)[0]!;
  const boss = Object.values(bank.bosses)[0]!;
  const fight = (
    monster: CombatState["monster"],
    monsterHp: number,
    bossPhase?: 1 | 2,
  ): EncounterState => ({
    kind: "combat",
    archetype: "combat",
    combat: { ...QUIET, monster, monsterHp, bossPhase, turn: 1 },
  });

  return [
    { label: "room 1 · pre-attack", encounter: fight(mob, mob.hp), intro: "The first room opens ahead." },
    { label: "mid-combat", encounter: fight(tough, Math.ceil(tough.hp * 0.6)), intro: "Steel finds steel." },
    { label: "low HP", encounter: fight(tough, 1), intro: "It staggers." },
    { label: "boss · phase 1", encounter: fight(boss, boss.baseHp, 1), intro: "The warden turns to face you." },
    { label: "boss · phase 2", encounter: fight(boss, Math.ceil(boss.baseHp * 0.3), 2), intro: "Something gives." },
    { label: "longest narration", encounter: fight(mob, mob.hp), intro: LONG_INTRO },
    { label: "between rooms", encounter: null, intro: "The quiet holds." },
  ];
}

function Cell({ children, caption }: { children: React.ReactNode; caption: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-[var(--border-1)] bg-[var(--surface-1)]">
        {children}
      </div>
      <span className="max-w-16 text-center font-mono text-[9px] leading-tight opacity-60">
        {caption}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.3em] opacity-70">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function ArtGallery() {
  const [preset, setPreset] = useState<Preset>("fantasy");
  const [crt, setCrt] = useState(true);
  const [element, setElement] = useState<string>("none");

  const weapons = combatWeaponTypesFor(preset);
  const armors = combatArmorTypesFor(preset);
  const elements = ["none", ...combatElementsFor(preset)];
  const bank = getFlavorBank(preset);

  return (
    <div
      data-preset={preset}
      data-theme={crt ? "crt" : undefined}
      className="min-h-screen bg-[var(--color-preset-bg)] p-8 text-[var(--color-preset-text)]"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <header className="flex flex-col gap-3">
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold">
            Art gallery
          </h1>
          <p className="text-sm opacity-70">
            Dev-only. Every generated glyph across presets, tiers, and elements.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPreset(p)}
                className="rounded border px-3 py-1 font-mono text-[11px] uppercase tracking-wider"
                style={{
                  borderColor:
                    p === preset ? "var(--color-preset-accent)" : "var(--border-1)",
                  background: p === preset ? "var(--surface-2)" : "transparent",
                }}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCrt((v) => !v)}
              className="rounded border px-3 py-1 font-mono text-[11px] uppercase tracking-wider"
              style={{
                borderColor: crt ? "var(--color-preset-accent)" : "var(--border-1)",
                background: crt ? "var(--surface-2)" : "transparent",
              }}
            >
              crt {crt ? "on" : "off"}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {elements.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setElement(e)}
                className="rounded border px-2 py-0.5 font-mono text-[10px] uppercase"
                style={{
                  borderColor:
                    e === element ? "var(--color-preset-accent)" : "var(--border-1)",
                  background: e === element ? "var(--surface-2)" : "transparent",
                }}
              >
                {e}
              </button>
            ))}
          </div>
        </header>

        <Section title={`Weapons · lanes × tiers · element: ${element}`}>
          <div className="flex flex-col gap-4">
            {weapons.map((type, lane) => (
              <div key={type} className="flex items-center gap-4">
                <span className="w-24 shrink-0 font-mono text-[10px] uppercase opacity-60">
                  {lane + 1} {type}
                </span>
                <div className="flex flex-wrap gap-3">
                  {TIERS.map((tier) => (
                    <Cell key={tier} caption={`T${tier}`}>
                      <ItemGlyph
                        identity={`gallery:${preset}:${type}:${tier}`}
                        preset={preset}
                        slot="weapon"
                        type={type}
                        tier={tier}
                        element={element}
                        effectCount={tier >= 4 ? 2 : tier >= 3 ? 1 : 0}
                        size={40}
                      />
                    </Cell>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title={`Armour · lanes × tiers · element: ${element}`}>
          <div className="flex flex-col gap-4">
            {armors.map((type, lane) => (
              <div key={type} className="flex items-center gap-4">
                <span className="w-24 shrink-0 font-mono text-[10px] uppercase opacity-60">
                  {lane + 1} {type}
                </span>
                <div className="flex flex-wrap gap-3">
                  {TIERS.map((tier) => (
                    <Cell key={tier} caption={`T${tier}`}>
                      <ItemGlyph
                        identity={`gallery:${preset}:${type}:${tier}`}
                        preset={preset}
                        slot="armor"
                        type={type}
                        tier={tier}
                        element={element}
                        effectCount={tier >= 4 ? 2 : tier >= 3 ? 1 : 0}
                        size={40}
                      />
                    </Cell>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Cross-realm — the same token in all three realms">
          <p className="max-w-prose text-xs opacity-70">
            One tokenId, rendered under each preset. Tier ornaments and element
            hue are invariant; the archetype silhouette is not. This is what the
            adapter does, drawn.
          </p>
          <div className="flex flex-wrap gap-6">
            {PRESETS.map((p) => (
              <Cell key={p} caption={p}>
                <ItemGlyph
                  identity="0xrealm:4242"
                  preset={p}
                  slot="weapon"
                  type={combatWeaponTypesFor(p)[2]}
                  tier={4}
                  element={combatElementsFor(p)[0]}
                  effectCount={2}
                  size={40}
                />
              </Cell>
            ))}
          </div>
        </Section>

        <Section title="Player crests — anvil accounts, plus the empty state">
          <p className="max-w-prose text-xs opacity-70">
            Read straight off the address nibbles, no hash. Every crest is
            mirrored about the vertical axis; all strokes are{" "}
            <code>currentColor</code>, so the same wallet keeps its shape and
            changes only hue between realms.
          </p>
          <div className="flex flex-wrap gap-4">
            {[...ANVIL_ACCOUNTS, null].map((addr) => (
              <div key={addr ?? "none"} className="flex w-24 flex-col items-center gap-1">
                <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-[var(--border-1)] bg-[var(--surface-1)]">
                  <PlayerSigil address={addr} size={64} />
                </div>
                <span className="break-all text-center font-mono text-[9px] opacity-55">
                  {addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "no wallet"}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Stage harness — the 22rem zero-jump check">
          <p className="max-w-prose text-xs opacity-70">
            The real <code>EncounterStage</code> in its real{" "}
            <code>h-[22rem]</code> slot across every combat state. Each box must
            measure exactly 352px and must not scroll internally — a silent
            inner scrollbar is the failure mode that looks fine but isn&apos;t.
          </p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {stageCases(preset).map(({ label, encounter, intro }) => (
              <div key={label} className="flex flex-col gap-1">
                <span className="font-mono text-[10px] uppercase tracking-wider opacity-60">
                  {label}
                </span>
                <div className="h-[22rem]" data-stage-case={label}>
                  <EncounterStage
                    encounter={encounter}
                    intro={intro}
                    activePreset={preset}
                  />
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Adversaries — the whole roster">
          <div className="flex flex-wrap gap-4">
            {[
              ...Object.values(bank.monsters).map((m) => ({ def: m, boss: false })),
              ...Object.values(bank.bosses).map((b) => ({ def: b, boss: true })),
            ].map(({ def, boss }) => {
              const hp = "baseHp" in def ? def.baseHp : def.hp;
              return (
                <div key={def.id} className="flex w-28 flex-col items-center gap-1">
                  <div
                    className="flex h-28 w-28 items-center justify-center rounded-lg border bg-[var(--surface-1)]"
                    style={{
                      borderColor: boss
                        ? "var(--color-danger)"
                        : "var(--border-1)",
                    }}
                  >
                    <CreatureSigil
                      spec={creatureSpec({
                        preset,
                        id: def.id,
                        family: familyFor(preset, def.id),
                        hp,
                        attackDie: def.attackDie,
                        ac: def.ac,
                        element: def.element,
                        weakTo: def.weakTo,
                        resistTo: def.resistTo,
                        isBoss: boss,
                        variant: "base",
                      })}
                      element={def.element}
                      className="h-full w-full"
                    />
                  </div>
                  <span className="text-center text-[10px] leading-tight opacity-80">
                    {def.name}
                  </span>
                  <span className="font-mono text-[9px] opacity-50">
                    {familyFor(preset, def.id)}
                    {isTagged(preset, def.id) ? "" : "*"} · {hp}hp d{def.attackDie} ac{def.ac}
                  </span>
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="Boss phase turn — base form vs turned">
          <div className="flex flex-wrap gap-6">
            {Object.values(bank.bosses).slice(0, 3).map((b) =>
              (["base", "turned"] as const).map((variant) => (
                <div key={`${b.id}:${variant}`} className="flex flex-col items-center gap-1">
                  <div className="flex h-28 w-28 items-center justify-center rounded-lg border border-[var(--border-1)] bg-[var(--surface-1)]">
                    <CreatureSigil
                      spec={creatureSpec({
                        preset,
                        id: b.id,
                        family: familyFor(preset, b.id),
                        hp: b.baseHp,
                        attackDie:
                          variant === "turned" ? b.phase2AttackDie : b.attackDie,
                        ac: b.ac,
                        element: b.element,
                        weakTo: b.weakTo,
                        resistTo: b.resistTo,
                        isBoss: true,
                        variant,
                      })}
                      element={b.element}
                      turned={variant === "turned"}
                      className="h-full w-full"
                    />
                  </div>
                  <span className="font-mono text-[9px] opacity-60">
                    {b.name} · {variant}
                  </span>
                </div>
              )),
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}
