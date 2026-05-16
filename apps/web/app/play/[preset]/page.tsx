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
  EngineEvent,
  LootRoll,
  Preset,
  RunState,
} from "@/lib/engine/types";
import { startRun } from "@/lib/engine";
import {
  CANONICAL_SCHEMAS,
  VALID_PRESETS,
  fallbackSeed,
  lootRollToMockCard,
  makeStarterGear,
} from "@/lib/engine/runtime";
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
import { useMintClearReceipt } from "@/lib/contracts/boss-cleared";
import { useClaimSeed } from "@/lib/contracts/seed-claim";
import { useRunSeedCommitment } from "@/lib/contracts/run-seed";
import { getStarterRealm, isStarterRealmDeployed } from "@/lib/contracts/starter-realms";

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
  const { mintClearReceipt } = useMintClearReceipt();
  const onchain = useInventoryCards(address);
  const starter = useStarterRealm(preset);
  const tutorialQuery = useTutorialProgress(address);
  const bossClears = useBossClears(address);
  const { claimSeed, isPending: claimPending } = useClaimSeed();

  // Run-start nonce (ms since epoch). Stable across re-renders so the
  // `useRunSeedCommitment` query key doesn't shift; bump via remount to
  // restart with a fresh commitment.
  const [runNonce] = useState<bigint>(() => BigInt(Date.now()));
  const commitment = useRunSeedCommitment(runNonce);

  // CSPRNG fallback for disconnected play. We *cannot* generate the seed
  // during initial render (lazy `useState` initialiser runs on both SSR
  // and hydration, with different `crypto.getRandomValues` results — the
  // monster pick diverges and React throws a hydration mismatch). Instead
  // initialise to null and fill in via effect after mount; render gates
  // on `mounted` so SSR + first-paint produce the same DOM.
  const [csprngSeed, setCsprngSeed] = useState<`0x${string}` | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (csprngSeed === null) setCsprngSeed(fallbackSeed());
    setMounted(true);
  }, [csprngSeed]);

  // The seed actually fed to `startRun` below. When connected, prefer
  // the on-chain commitment so the run is verifiable; while it's still
  // resolving, fall back to CSPRNG so play isn't blocked. May be null
  // during SSR / first paint — the EncounterFrame is gated on `seedReady`
  // so `startRun` is only invoked once we have a real seed.
  const rngSeed: `0x${string}` | null =
    commitment.data?.seed ?? csprngSeed ?? null;

  // Effect-only body palette toggle — keeps SSR pristine.
  useEffect(() => {
    const prev = document.body.getAttribute("data-preset");
    document.body.setAttribute("data-preset", preset);
    return () => {
      if (prev) document.body.setAttribute("data-preset", prev);
      else document.body.removeAttribute("data-preset");
    };
  }, [preset]);

  // startRun is deterministic from the seed. While connected and the
  // on-chain commitment is still resolving, we gate the EncounterFrame
  // (see render below) so the seed only ever swaps once — at the
  // moment commitment lands — and the player never sees a re-rolled
  // run mid-play.
  const starterGear = useMemo(
    () => makeStarterGear(preset, cfg.realm, cfg.name),
    [preset, cfg.realm],
  );

  const initial = useMemo(() => {
    if (!rngSeed) return null;
    return startRun({
      preset,
      realm: cfg.realm,
      rngSeed,
      equipped: { weapon: starterGear.weapon, armor: starterGear.armor },
      bossId: cfg.bossId,
      schemas: CANONICAL_SCHEMAS[preset],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, rngSeed]);

  // Connected players wait briefly while we pin the run to a blockhash;
  // disconnected players go straight to the CSPRNG path. `mounted` keeps
  // SSR + first-paint inert so the hydration DOM matches.
  const seedReady =
    mounted && !!initial && (!walletConnected || !!commitment.data);

  // Local inventory used in disconnected mode. When connected we read
  // from the chain via `onchain.data`; keeping the local accumulator
  // around lets the player play offline without losing drops.
  const [localInventory, setLocalInventory] = useState<AssetCardType[]>([]);
  // Starter gear is preselected so the drawer reflects what the engine
  // is actually using for combat. Players can swap to looted gear via
  // `handleEquip` once drops land.
  const [equipped, setEquipped] = useState<{
    weapon?: AssetCardType;
    armor?: AssetCardType;
  }>({ weapon: starterGear.weapon, armor: starterGear.armor });
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

  const handleLootMinted = async (loot: LootRoll, ctx: { depth: number }) => {
    if (chainMintAvailable && initial) {
      // Real path — fire the tx and let the inventory query reconcile.
      // `useMintLoot` invalidates `inventoryCards(player)` on success.
      // `ctx.depth` is the live engine depth (the page only sees the
      // frozen `initial.state.depth` of 1 from `startRun`).
      await mintLoot({
        realm: cfg.realm,
        preset,
        runSeed: initial.state.rngSeed,
        depth: ctx.depth,
        loot,
        realmLabel: cfg.name,
      });
    } else {
      // Disconnected OR realm-not-ready — keep the local accumulator alive.
      const card = lootRollToMockCard(loot, preset, cfg.realm, cfg.name);
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

  // Status of the clearReceipt mint that fires when the engine emits
  // BossCleared. The run-over panel in `<EncounterFrame/>` reads this
  // to render real on-chain feedback instead of a placeholder.
  const [clearReceipt, setClearReceipt] = useState<
    | { status: "pending" }
    | { status: "minted"; txHash: `0x${string}`; tokenId: bigint }
    | { status: "failed"; error: string }
    | { status: "skipped"; reason: string }
    | undefined
  >(undefined);

  // Mint the on-chain clearReceipt the moment the engine emits
  // BossCleared. Disconnected / realm-not-ready runs surface a
  // "skipped" state — the tutorial overlay will simply not advance
  // past Act 3 until the player plays a connected run on a deployed
  // starter realm.
  const handleEngineEvent = (event: EngineEvent) => {
    if (event.type !== "BossCleared") return;
    if (!initial) return;
    if (!chainMintAvailable) {
      setClearReceipt({
        status: "skipped",
        reason: walletConnected
          ? "Starter realm not yet deployed on this chain — receipt not minted."
          : "Wallet not connected — receipt not minted.",
      });
      return;
    }
    setClearReceipt({ status: "pending" });
    mintClearReceipt({
      preset,
      runSeed: initial.state.rngSeed,
      bossId: cfg.bossId,
      turns: event.turns,
      finalHp: event.finalHp,
      realmLabel: cfg.name,
    })
      .then(({ tokenId, txHash }) => {
        setClearReceipt({ status: "minted", tokenId, txHash });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setClearReceipt({ status: "failed", error: message });
        // eslint-disable-next-line no-console
        console.error("mintClearReceipt failed", err);
      });
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
          // Server independently rebuilds the proof from on-chain
          // events — we only pass identity via the wallet.
          await claimSeed();
        } catch (err) {
          // Surface the revert verbatim; the author
          // needs the raw text to debug proof-shape mismatches.
          // eslint-disable-next-line no-console
          console.error("claimSeed failed", err);
        }
      }
    : undefined;

  // EncounterFrame keeps its own RunState; we hand off the run state as
  // produced by `startRun` (which already has starter gear baked into
  // `equipped`). A re-equip during a run can't retroactively change the
  // active CombatState, and we
  // must pass the *exact* object `startRun` returned so the engine's
  // SCHEMA_STORE WeakMap lookup in `step()` resolves.
  const initialState: RunState | null = initial?.state ?? null;

  return (
    <main className="min-h-screen px-6 py-8">
      <header className="mx-auto mb-6 flex max-w-4xl items-center justify-between">
        <Link href="/" className="text-sm opacity-70 hover:opacity-100">
          ← Realms
        </Link>
        <div className="flex flex-col items-center gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {cfg.name}
          </h1>
          {isStarterRealmDeployed(cfg.realm) && (
            <Link
              href={`/realm/${cfg.realm}`}
              className="text-[11px] uppercase tracking-widest opacity-60 hover:opacity-100"
            >
              Realm details ↗
            </Link>
          )}
        </div>
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
        {seedReady && initialState && initial ? (
          <>
            <EncounterFrame
              initialState={initialState}
              initialLines={initial.lines}
              bossId={cfg.bossId}
              equipped={equipped}
              onEvent={handleEngineEvent}
              onLootMinted={handleLootMinted}
              clearReceipt={clearReceipt}
            />
            {commitment.data && (
              <p className="text-[11px] opacity-50 font-mono break-all">
                Run committed against block {commitment.data.blockNumber.toString()}{" "}
                · seed {commitment.data.seed.slice(0, 10)}…
              </p>
            )}
          </>
        ) : (
          <aside
            aria-label="Pinning run to chain"
            className="rounded-md p-4 text-sm opacity-80"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            Pinning run seed to the latest block…
          </aside>
        )}
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
