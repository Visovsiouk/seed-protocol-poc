"use client";

/**
 * `/play/[preset]` — the run room.
 *
 *: everything below is in-memory. The engine drives the run, the
 * tutorial overlay uses `emptyTutorialProgress()` until the BossCleared
 * event-reader lands in 2C, and `pendingLoot` is converted to a mock
 * `AssetCard` and stashed in local state so the inventory drawer has
 * something to show. will swap:
 *   - The hardcoded `STARTER_REALM_BY_PRESET` table for a
 *     RealmRegistry read.
 *   - The empty tutorial progress for the on-chain BossCleared union.
 *   - The local inventory accumulator for `fetchInventory()` against the
 *     player's address.
 *
 * `data-preset` is set on the document body via effect so Tailwind's
 * per-preset CSS variables (see globals.css) kick in. We restore the
 * attribute on unmount so navigating back to `/bazaar` doesn't keep the
 * realm's palette glued to the chrome.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import type {
  AssetCard as AssetCardType,
  LootRoll,
  Preset,
  RunState,
} from "@/lib/engine/types";
import { startRun } from "@/lib/engine";
import type { RealmSchemas } from "@/lib/engine/loot";
import { assembleLootName, getFlavorBank } from "@/lib/flavor";
import { EncounterFrame } from "@/components/game/EncounterFrame";
import { InventoryDrawer } from "@/components/inventory/InventoryDrawer";
import { TutorialOverlay } from "@/components/tutorial/TutorialOverlay";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { emptyTutorialProgress } from "@/lib/tutorial/progress";

const VALID_PRESETS: ReadonlySet<Preset> = new Set(["fantasy", "scifi", "cyberpunk"]);

const STARTER_REALM_BY_PRESET: Record<Preset, { realm: `0x${string}`; bossId: string }> = {
  //: the dev-deployed `EcosystemTemplate` for each preset will
  // replace these zero addresses; the bossId lives on-chain as part of the
  // realm's metadata.
  fantasy: { realm: "0x0000000000000000000000000000000000000a01", bossId: "forest_hag" },
  scifi: { realm: "0x0000000000000000000000000000000000000a02", bossId: "ai_core" },
  cyberpunk: { realm: "0x0000000000000000000000000000000000000a03", bossId: "black_ice" },
};

// PoC: canonical schema ids per preset. Real schemas come from the realm
// contract; the engine only needs (schemaId, declared catalog effects).
const CANONICAL_SCHEMAS: Record<Preset, RealmSchemas> = {
  fantasy: {
    weapon: { schemaId: 101, catalogEffects: [] },
    armor: { schemaId: 102, catalogEffects: [] },
  },
  scifi: {
    weapon: { schemaId: 201, catalogEffects: [] },
    armor: { schemaId: 202, catalogEffects: [] },
  },
  cyberpunk: {
    weapon: { schemaId: 301, catalogEffects: [] },
    armor: { schemaId: 302, catalogEffects: [] },
  },
};

/**
 * Draw a 256-bit hex seed from the browser's CSPRNG. replaces this
 * with the on-chain commitment `keccak256(playerAddr ‖ blockhash ‖ id)`.
 */
function fallbackSeed(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return ("0x" +
    Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")) as `0x${string}`;
}

/** Mock AssetCard built from a LootRoll, used to populate the local 2B inventory. */
let nextMockTokenId = 1n;
function lootRollToMockCard(
  loot: LootRoll,
  preset: Preset,
  realm: `0x${string}`,
): AssetCardType {
  const bank = getFlavorBank(preset);
  return {
    tokenId: nextMockTokenId++,
    schemaId: loot.schemaId,
    realm,
    realmName:
      preset === "fantasy"
        ? "The Hollow Reach"
        : preset === "scifi"
          ? "Drift Station Ker-7"
          : "Black Ice District",
    slot: loot.slot,
    tier: loot.tier,
    name: assembleLootName(bank, loot.slot as "weapon" | "armor", loot.nameSeed),
    damageDie: loot.damageDie,
    attackBonus: loot.attackBonus,
    acBonus: loot.acBonus,
    hpBonus: loot.hpBonus,
    catalogEffects: loot.catalogEffects,
    extraFields: loot.extraFields,
    metadataURI: "",
    preseed: false,
  };
}

export default function PlayPage() {
  const params = useParams<{ preset: string }>();
  const preset = params.preset as Preset;
  if (!VALID_PRESETS.has(preset)) notFound();

  const cfg = STARTER_REALM_BY_PRESET[preset];

  // Effect-only body palette toggle — keeps SSR pristine.
  useEffect(() => {
    const prev = document.body.getAttribute("data-preset");
    document.body.setAttribute("data-preset", preset);
    return () => {
      if (prev) document.body.setAttribute("data-preset", prev);
      else document.body.removeAttribute("data-preset");
    };
  }, [preset]);

  // startRun is deterministic from the seed — derive once and keep stable
  // across re-renders. A "Restart" button could bump a key to re-roll.
  const initial = useMemo(() => {
    return startRun({
      preset,
      realm: cfg.realm,
      rngSeed: fallbackSeed(),
      equipped: {},
      bossId: cfg.bossId,
      schemas: CANONICAL_SCHEMAS[preset],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const [inventory, setInventory] = useState<AssetCardType[]>([]);
  const [equipped, setEquipped] = useState<{
    weapon?: AssetCardType;
    armor?: AssetCardType;
  }>({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tutorialDismissed, setTutorialDismissed] = useState(false);

  const tutorial = emptyTutorialProgress();

  const handleLootMinted = (loot: LootRoll) => {
    const card = lootRollToMockCard(loot, preset, cfg.realm);
    setInventory((prev) => [...prev, card]);
    // Auto-equip nothing — equipping is a deliberate UI action.
  };

  const handleEquip = (
    slot: "weapon" | "armor",
    card: AssetCardType,
  ) => {
    setEquipped((prev) => ({ ...prev, [slot]: card }));
  };

  // EncounterFrame keeps its own RunState; we hand off `equipped` only at
  // run-start. A re-equip during a run won't retroactively change the
  // active CombatState.
  const initialStateWithEquipped: RunState = useMemo(
    () => ({ ...initial.state, equipped: { ...initial.state.equipped, ...equipped } }),
    // We intentionally do NOT depend on `equipped` here — see comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [initial.state],
  );

  return (
    <main className="min-h-screen px-6 py-8">
      <header className="mx-auto mb-6 flex max-w-4xl items-center justify-between">
        <Link href="/" className="text-sm opacity-70 hover:opacity-100">
          ← Realms
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {preset === "fantasy"
            ? "The Hollow Reach"
            : preset === "scifi"
              ? "Drift Station Ker-7"
              : "Black Ice District"}
        </h1>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="rounded-md px-3 py-1.5 text-sm transition"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            Inventory ({inventory.length})
          </button>
          <ConnectButton />
        </div>
      </header>

      <section className="mx-auto flex max-w-4xl flex-col gap-4">
        <TutorialOverlay
          progress={tutorial}
          dismissed={tutorialDismissed}
          onDismiss={() => setTutorialDismissed((v) => !v)}
        />
        <EncounterFrame
          initialState={initialStateWithEquipped}
          initialLines={initial.lines}
          bossId={cfg.bossId}
          onLootMinted={handleLootMinted}
        />
      </section>

      <InventoryDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        inventory={inventory}
        equipped={equipped}
        onEquip={handleEquip}
      />
    </main>
  );
}
