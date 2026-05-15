"use client";

/**
 * `/play/[preset]` — the run room.
 *
 * Two operating modes, switched by wallet connection:
 *
 *   **Disconnected (fallback):** everything is in-memory. The
 *     engine drives the run, the tutorial overlay uses
 *     `emptyTutorialProgress()`, and `pendingLoot` is converted to a
 *     mock `AssetCard` and stashed in local state so the drawer has
 *     something to show.
 *
 *   **Connected:** the inventory drawer reads on-chain via
 *     `useInventoryCards(player)`, and Mint dispatches a real
 *     `EcosystemTemplate.mintAsset` tx through `useMintLoot`. The query
 *     invalidation reconciles the drawer.
 *
 * Still TODO for full 2C (deferred to later slices):
 *   - `STARTER_REALM_BY_PRESET` → `RealmRegistry.listRealms()` read.
 *   - `emptyTutorialProgress()` → on-chain BossCleared event union.
 *   - `fallbackSeed()` → `keccak256(playerAddr ‖ blockhash ‖ id)` commit.
 *   - Seed SBT claim wired to the tutorial overlay's CTA.
 *
 * `data-preset` is set on the document body via effect so Tailwind's
 * per-preset CSS variables (see globals.css) kick in. We restore the
 * attribute on unmount so navigating back to `/bazaar` doesn't keep the
 * realm's palette glued to the chrome.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useAccount } from "wagmi";
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
import {
  useInventoryCards,
  useStarterRealm,
  useTutorialProgress,
  useBossClears,
} from "@/lib/reads/hooks";
import { useMintLoot } from "@/lib/contracts/loot";
import { useClaimSeed } from "@/lib/contracts/seed-claim";
import { getStarterRealm } from "@/lib/contracts/starter-realms";

const VALID_PRESETS: ReadonlySet<Preset> = new Set(["fantasy", "scifi", "cyberpunk"]);

const PRESET_LABEL: Record<Preset, string> = {
  fantasy: "The Hollow Reach",
  scifi: "Drift Station Ker-7",
  cyberpunk: "Black Ice District",
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
    realmName: PRESET_LABEL[preset],
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

  // Starter realm address + bossId come from per-chain config
  // (`lib/contracts/starter-realms.ts`); deploy state + active flag come
  // from the on-chain registry via `useStarterRealm` below.
  const cfg = getStarterRealm(preset);
  const { address } = useAccount();
  const { mintLoot, walletConnected } = useMintLoot();
  const onchain = useInventoryCards(address);
  const starter = useStarterRealm(preset);
  const tutorialQuery = useTutorialProgress(address);
  const bossClears = useBossClears(address);
  const { claimSeed, isPending: claimPending } = useClaimSeed();

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

  // Local inventory used in disconnected mode. When connected we read
  // from the chain via `onchain.data`; keeping the local accumulator
  // around lets the player play offline without losing drops.
  const [localInventory, setLocalInventory] = useState<AssetCardType[]>([]);
  const [equipped, setEquipped] = useState<{
    weapon?: AssetCardType;
    armor?: AssetCardType;
  }>({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tutorialDismissed, setTutorialDismissed] = useState(false);

  // Until a wallet's connected (or the query is mid-flight) we render
  // the empty Act 1 progress — the overlay handles that fine and copy
  // doesn't reference any wallet state.
  const tutorial = tutorialQuery.data ?? emptyTutorialProgress();

  // Real on-chain mint requires both a wallet AND a deployed+active
  // starter realm. Until the starter-realm deploy
  // lands, `starter.data.ready` is false and we transparently fall back
  // to the disconnected-mode local accumulator so the player can still
  // collect drops within the session.
  const realmReady = starter.data?.ready === true;
  const chainMintAvailable = walletConnected && realmReady;
  const showRealmNotDeployedNotice =
    walletConnected && starter.isSuccess && !realmReady;

  // When the chain path is live, the drawer is the on-chain truth. When
  // we're falling back (disconnected OR connected-but-realm-not-ready)
  // we surface the in-session accumulator on top of whatever on-chain
  // holdings the player already has, so they keep visibility into both.
  const inventory: readonly AssetCardType[] = chainMintAvailable
    ? (onchain.data ?? [])
    : walletConnected
      ? [...(onchain.data ?? []), ...localInventory]
      : localInventory;

  const handleLootMinted = async (loot: LootRoll) => {
    if (chainMintAvailable) {
      // Real path — fire the tx and let the inventory query reconcile.
      // `useMintLoot` invalidates `inventoryCards(player)` on success.
      await mintLoot({
        realm: cfg.realm,
        preset,
        runSeed: initial.state.rngSeed,
        depth: initial.state.depth,
        loot,
        realmLabel: PRESET_LABEL[preset],
      });
    } else {
      // Disconnected OR realm-not-ready — keep the local accumulator alive.
      const card = lootRollToMockCard(loot, preset, cfg.realm);
      setLocalInventory((prev) => [...prev, card]);
    }
    // Auto-equip nothing — equipping is a deliberate UI action.
  };

  const handleEquip = (
    slot: "weapon" | "armor",
    card: AssetCardType,
  ) => {
    setEquipped((prev) => ({ ...prev, [slot]: card }));
  };

  // Act-4 Claim CTA wiring. The overlay only renders the button when
  // `progress.eligibleForSeed && onClaimSeed` are both set, so we leave
  // `onClaimSeed` undefined whenever the events aren't available yet —
  // the button hides cleanly instead of being un-clickable.
  const canClaim =
    walletConnected &&
    tutorial.eligibleForSeed &&
    (bossClears.data?.length ?? 0) > 0 &&
    !claimPending;

  const handleClaimSeed = canClaim
    ? async () => {
        try {
          await claimSeed({ events: bossClears.data ?? [] });
        } catch (err) {
          // Surface the revert verbatim; the author
          // needs the raw text to debug proof-shape mismatches.
          // eslint-disable-next-line no-console
          console.error("claimSeed failed", err);
        }
      }
    : undefined;

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
          {PRESET_LABEL[preset]}
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
          onClaimSeed={handleClaimSeed}
        />
        {showRealmNotDeployedNotice && (
          <aside
            aria-label="Realm not yet deployed"
            className="rounded-md p-3 text-sm"
            style={{
              background: "rgba(255,196,0,0.08)",
              border: "1px solid rgba(255,196,0,0.35)",
            }}
          >
            <strong>Heads up:</strong>{" "}
            {starter.data?.deployed === false
              ? "The starter realm for this preset isn't deployed on this chain yet."
              : "The starter realm isn't active in the registry yet."}{" "}
            Drops will accumulate in this session only and won&apos;t be
            minted on-chain.
          </aside>
        )}
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
