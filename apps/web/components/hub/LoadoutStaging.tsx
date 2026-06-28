"use client";

/**
 * Loadout staging — the second beat of the pocket-realm hub. The player
 * has picked a realm (the doorway shimmers); here they choose the gear
 * they'll carry through it *before* descending. Gear is locked once the
 * delve begins (there's no in-run equip path), so this is the only place
 * a loadout is set.
 *
 * The picker reads the player's owned cards (on-chain inventory when
 * connected) plus the realm's starter gear as the baseline option, and
 * previews each candidate translated into the target realm — the same
 * `targetRealm` translation strip the inventory drawer uses. The HP/AC
 * readout runs the engine's `playerStartHp` over the *translated* armor so
 * the numbers match what the run will actually boot with.
 *
 * Descend persists the chosen pair as the canonical *native* snapshot
 * (`saveEquipped`); the play page's hydration re-reads it and translates
 * per-realm exactly as before.
 */

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useAccount, usePublicClient } from "wagmi";
import type { AssetCard as AssetCardType, Preset } from "@/lib/engine/types";
import { playerStartHp } from "@/lib/engine";
import { makeStarterGear } from "@/lib/engine/runtime";
import { listStarterRealms } from "@/lib/contracts/starter-realms";
import { translateCardForRealm } from "@/lib/contracts/adapters";
import { loadEquipped, saveEquipped } from "@/lib/persistence/equipped";
import { useInventoryCards, usePlayerRealms } from "@/lib/reads/hooks";
import { AssetCard } from "@/components/inventory/AssetCard";
import { Panel, Button, Stamp, Rule } from "@/components/ui";
import { KbdHint } from "@/components/game/ChoiceRow";
import { useEnterToActivate } from "@/lib/ui/useEnterToActivate";
import type { RealmSelection } from "@/components/game/RealmSelector";

const STARTERS = listStarterRealms();

type Resolved = {
  preset: Preset;
  realm: `0x${string}`;
  name: string;
  /** Creator-chosen accent hex, or null to inherit the genre default. */
  accent: string | null;
};

type Loadout = { weapon?: AssetCardType; armor?: AssetCardType };

function dedupeByTokenId(cards: readonly AssetCardType[]): AssetCardType[] {
  const seen = new Set<string>();
  const out: AssetCardType[] = [];
  for (const c of cards) {
    const key = c.tokenId.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

function Slot({
  label,
  cards,
  selectedTokenId,
  onPick,
}: {
  label: string;
  cards: readonly AssetCardType[];
  selectedTokenId?: bigint;
  onPick: (card: AssetCardType) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-xs uppercase tracking-wider opacity-65">{label}</h4>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-2">
        {cards.map((c) => (
          // No `targetRealm` here on purpose: the picker shows each candidate
          // in its native form. The "what you carried changes shape"
          // translation beat is played once on the next screen
          // (GearTranslationScreen), so we don't surface the "Translated
          // from" strip while the player is still choosing.
          <AssetCard
            key={c.tokenId.toString()}
            card={c}
            selected={c.tokenId === selectedTokenId}
            onClick={() => onPick(c)}
          />
        ))}
      </div>
    </div>
  );
}

export function LoadoutStaging({
  selection,
  onBack,
}: {
  selection: RealmSelection;
  onBack: () => void;
}) {
  const router = useRouter();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const onchain = useInventoryCards(address);
  const playerRealms = usePlayerRealms();

  const resolved: Resolved | null = useMemo(() => {
    if (selection.kind === "starter") {
      const entry = STARTERS.find((s) => s.preset === selection.preset);
      if (!entry) return null;
      // Starter realms carry no custom accent — they inherit the genre default.
      return { preset: entry.preset, realm: entry.realm, name: entry.name, accent: null };
    }
    const meta = playerRealms.data?.get(selection.address.toLowerCase());
    if (!meta) return null;
    return {
      preset: meta.preset,
      realm: selection.address,
      name: meta.name,
      accent: meta.accent,
    };
  }, [selection, playerRealms.data]);

  const starterGear = useMemo(
    () =>
      resolved
        ? makeStarterGear(resolved.preset, resolved.realm, resolved.name)
        : null,
    [resolved],
  );

  const inventory: readonly AssetCardType[] = useMemo(
    () => onchain.data ?? [],
    [onchain.data],
  );

  // Highest tier first; the realm starter card (T1) sorts to the bottom.
  const weapons = useMemo(() => {
    if (!starterGear) return [];
    return dedupeByTokenId([
      starterGear.weapon,
      ...inventory.filter((c) => c.slot === "weapon"),
    ]).sort((a, b) => b.tier - a.tier);
  }, [starterGear, inventory]);

  const armors = useMemo(() => {
    if (!starterGear) return [];
    return dedupeByTokenId([
      starterGear.armor,
      ...inventory.filter((c) => c.slot === "armor"),
    ]).sort((a, b) => b.tier - a.tier);
  }, [starterGear, inventory]);

  // Default the loadout from the persisted snapshot, reconciled against
  // what this realm offers. A starter card (tokenId 0n) is realm-local, so
  // a starter persisted from another realm falls back to this realm's
  // starter; a real card the player no longer holds also falls back.
  const [selected, setSelected] = useState<Loadout | null>(null);
  useEffect(() => {
    if (!starterGear || selected) return;
    const stored = loadEquipped();
    const ownedIds = new Set(inventory.map((c) => c.tokenId.toString()));
    const pick = (
      card: AssetCardType | undefined,
      fallback: AssetCardType,
    ): AssetCardType => {
      if (!card) return fallback;
      if (card.tokenId === 0n) {
        return card.realm?.toLowerCase() === starterGear.weapon.realm?.toLowerCase()
          ? card
          : fallback;
      }
      return ownedIds.has(card.tokenId.toString()) ? card : fallback;
    };
    setSelected({
      weapon: pick(stored?.weapon, starterGear.weapon),
      armor: pick(stored?.armor, starterGear.armor),
    });
  }, [starterGear, selected, inventory]);

  // Translate the chosen armor into the target realm so the HP/AC preview
  // reflects the numbers the engine will boot with (the play page boots the
  // run against translated gear, not the native snapshot).
  const [previewArmor, setPreviewArmor] = useState<AssetCardType | undefined>();
  useEffect(() => {
    if (!selected || !resolved) return;
    let cancelled = false;
    const armor = selected.armor;
    if (!armor || !publicClient) {
      setPreviewArmor(armor);
      return;
    }
    void translateCardForRealm({
      card: armor,
      targetRealm: resolved.realm,
      publicClient,
    })
      .then((t) => {
        if (!cancelled) setPreviewArmor(t);
      })
      .catch(() => {
        if (!cancelled) setPreviewArmor(armor);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, resolved, publicClient]);

  // Enter descends from anywhere on the screen (the single forward action).
  // `descend` is hoisted; the hook reads the latest closure via a ref. Gated
  // so a held Enter from the realm pick doesn't auto-descend on mount.
  useEnterToActivate({
    onActivate: descend,
    enabled: !!selected && !!resolved,
    sig: resolved?.realm ?? "",
  });

  if (!resolved || !starterGear || !selected) {
    return (
      <Panel
        as="section"
        tone="glass-2"
        aria-label="Preparing loadout"
        className="mx-auto w-full max-w-md p-6 text-sm opacity-80"
      >
        Preparing the doorway…
      </Panel>
    );
  }

  const stats = playerStartHp({ weapon: undefined, armor: previewArmor });

  function pickSlot(slot: "weapon" | "armor", card: AssetCardType) {
    setSelected((prev) => ({ ...prev, [slot]: card }));
  }

  function descend() {
    if (!selected || !resolved) return;
    // Persist the native snapshot — the play page re-reads and translates.
    saveEquipped({ weapon: selected.weapon, armor: selected.armor });
    if (selection.kind === "starter") {
      router.push(`/play/${resolved.preset}`);
    } else {
      router.push(`/play/realm/${selection.address}`);
    }
  }

  return (
    <section
      aria-label="Stage your loadout"
      className="mx-auto flex w-full max-w-3xl flex-col gap-6"
      data-preset={resolved.preset}
      // A creator realm overrides the genre's default accent with its custom
      // hue, scoped to this staging surface (the realm dashboard / play route
      // apply the same accent via useRealmTheme). Starter realms pass null and
      // keep the genre default.
      style={
        resolved.accent
          ? ({ "--color-preset-accent": resolved.accent } as CSSProperties)
          : undefined
      }
    >
      <Panel
        as="article"
        tone="glass-2"
        glow="accent"
        aria-label="Loadout"
        className="flex flex-col gap-5 p-6"
      >
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Stamp tone="accent">The doorway holds</Stamp>
            <button
              type="button"
              onClick={onBack}
              className="text-xs uppercase tracking-widest opacity-70 hover:opacity-100"
            >
              ← Back to the base
            </button>
          </div>
          <Rule />
          <h2 className="font-mono text-2xl font-medium tracking-[-0.015em]">
            {resolved.name}
          </h2>
          <p className="max-w-[58ch] text-sm leading-relaxed opacity-75">
            Choose what crosses with you. Once you step through, the loadout
            is sealed for the whole delve — there is no changing gear in the
            dark.
          </p>
          <div className="flex flex-wrap items-center gap-4 text-sm tabular-nums">
            <span>
              <span className="opacity-65">HP </span>
              <span className="font-medium text-[var(--color-ok)]">
                {stats.hp}
              </span>
            </span>
            <span>
              <span className="opacity-65">AC </span>
              <span className="font-medium">{stats.ac}</span>
            </span>
          </div>
        </header>

        <Slot
          label="Weapon"
          cards={weapons}
          selectedTokenId={selected.weapon?.tokenId}
          onPick={(c) => pickSlot("weapon", c)}
        />
        <Slot
          label="Armor"
          cards={armors}
          selectedTokenId={selected.armor?.tokenId}
          onPick={(c) => pickSlot("armor", c)}
        />

        <footer className="flex flex-col gap-2 pt-1">
          <Button intent="primary" size="lg" block onClick={descend}>
            Descend into {resolved.name} →
          </Button>
          <KbdHint multi={false} />
        </footer>
      </Panel>
    </section>
  );
}
