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

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useAccount, usePublicClient } from "wagmi";
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
import { RealmClearedInterstitial } from "@/components/game/RealmClearedInterstitial";
import { InventoryDrawer } from "@/components/inventory/InventoryDrawer";
import { TutorialOverlay } from "@/components/tutorial/TutorialOverlay";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { emptyTutorialProgress, type TutorialProgress } from "@/lib/tutorial/progress";
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
import { translateCardForRealm } from "@/lib/contracts/adapters";
import { loadEquipped, saveEquipped } from "@/lib/persistence/equipped";
import {
  REALM_ORDER,
  lockStateFor,
  lockTeaseFor,
} from "@/lib/story/progression";

export default function PlayPage() {
  const params = useParams<{ preset: string }>();
  const preset = params.preset as Preset;
  if (!VALID_PRESETS.has(preset)) notFound();

  // Starter realm address + bossId come from per-chain config
  // (`lib/contracts/starter-realms.ts`); deploy state + active flag come
  // from the on-chain registry via `useStarterRealm` below.
  const cfg = getStarterRealm(preset);
  const { address } = useAccount();
  const publicClient = usePublicClient();
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

  // Roguelike restart bookkeeping. `runEpoch` is bumped each time the
  // player dies and clicks "Step back in" — it doubles as the React key
  // on `<EncounterFrame/>` so the engine state (depth, encounter, defeated
  // flag) hard-resets without us having to thread a separate "reset"
  // signal into the frame. `restartSeed` overrides the commitment seed
  // for retry runs: re-pinning to a fresh blockhash would require a new
  // signature, which is bad UX for a death-retry loop. Trade-off
  // documented in the run-pinned-to-block footer (hidden on restart runs).
  const [runEpoch, setRunEpoch] = useState(0);
  const [restartSeed, setRestartSeed] = useState<`0x${string}` | null>(null);

  // The seed actually fed to `startRun` below. When connected, prefer
  // the on-chain commitment so the run is verifiable; while it's still
  // resolving, fall back to CSPRNG so play isn't blocked. After a
  // permadeath restart, `restartSeed` takes top priority so the retry
  // doesn't deterministically replay the death encounter.
  const rngSeed: `0x${string}` | null =
    restartSeed ?? commitment.data?.seed ?? csprngSeed ?? null;

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

  // Local inventory used in disconnected mode. When connected we read
  // from the chain via `onchain.data`; keeping the local accumulator
  // around lets the player play offline without losing drops.
  const [localInventory, setLocalInventory] = useState<AssetCardType[]>([]);
  // Equipped slots. Hydrated from localStorage on mount so gear earned in
  // one realm carries into the next (the play state is reset on every
  // mount, but the persistence layer survives). The initial useState falls
  // back to starter gear so SSR + first paint render a coherent HUD; the
  // post-mount effect below swaps in the saved snapshot if there is one.
  const [equipped, setEquipped] = useState<{
    weapon?: AssetCardType;
    armor?: AssetCardType;
  }>({ weapon: starterGear.weapon, armor: starterGear.armor });
  // The equipped state used at run-start. Captured once at hydration time
  // so subsequent equip changes (from drawer clicks or auto-equip on
  // mint) don't restart the run.
  const [runStartEquipped, setRunStartEquipped] = useState<{
    weapon?: AssetCardType;
    armor?: AssetCardType;
  } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tutorialDismissed, setTutorialDismissed] = useState(false);

  const initial = useMemo(() => {
    if (!rngSeed || !runStartEquipped) return null;
    return startRun({
      preset,
      realm: cfg.realm,
      rngSeed,
      equipped: {
        weapon: runStartEquipped.weapon,
        armor: runStartEquipped.armor,
      },
      bossId: cfg.bossId,
      // Starter realms cap rolls at T2 to preserve the seed-liquidity floor:
      // the bank should fill up with T1/T2 gear from tutorials, and T3+ is
      // reserved for player-authored realms. The server mirrors
      // this ceiling in `/api/realm/mint-loot`, so a tampered client roll
      // would be rejected at mint time anyway.
      schemas: { ...CANONICAL_SCHEMAS[preset], maxTier: 2 },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, rngSeed, runStartEquipped, runEpoch]);

  // Connected players wait briefly while we pin the run to a blockhash;
  // disconnected players go straight to the CSPRNG path. `mounted` keeps
  // SSR + first-paint inert so the hydration DOM matches.
  const seedReady =
    mounted && !!initial && (!walletConnected || !!commitment.data);

  // One-shot hydration: read the persisted snapshot, swap it into both the
  // live equipped state and the run-start snapshot. Guarded so it only
  // fires on first mount — re-running would clobber drawer equip choices.
  useEffect(() => {
    if (runStartEquipped !== null) return;
    const stored = loadEquipped();
    const initial = stored ?? {
      weapon: starterGear.weapon,
      armor: starterGear.armor,
    };
    setEquipped(initial);
    setRunStartEquipped(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist every equip change so the next mount (same preset reload OR
  // navigation to a different /play/[preset]) picks the snapshot back up.
  useEffect(() => {
    if (runStartEquipped === null) return; // hydration not done yet
    saveEquipped(equipped);
  }, [equipped, runStartEquipped]);

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

  // Reconcile stale equipped gear against the current inventory. After
  // Anvil restart (or a wallet swap), the localStorage snapshot can
  // reference tokenIds that no longer exist on this chain. Drop any such
  // card back to starter gear so the HUD/combat stop fighting with ghost
  // stats. Starter gear is `tokenId === 0n` and never gets reconciled
  // away.
  //
  // Gated on `onchain.isSuccess` when connected so we don't wipe during
  // the initial inventory fetch. Also gated on `!onchain.isFetching` so
  // the post-`mintLoot` invalidation window can't reconcile against the
  // *previous* snapshot — that would clobber the freshly-equipped, just-
  // minted card before the refetch surfaces it. When disconnected,
  // `localInventory` is the only source of truth and is reset on every
  // mount — any persisted equipped card is by definition stale until
  // re-equipped.
  useEffect(() => {
    if (runStartEquipped === null) return;
    if (walletConnected && (!onchain.isSuccess || onchain.isFetching)) return;
    const ownedIds = new Set(inventory.map((c) => c.tokenId));
    const isStale = (card?: AssetCardType) =>
      !!card && card.tokenId !== 0n && !ownedIds.has(card.tokenId);
    if (!isStale(equipped.weapon) && !isStale(equipped.armor)) return;
    const reconciled = {
      weapon: isStale(equipped.weapon) ? starterGear.weapon : equipped.weapon,
      armor: isStale(equipped.armor) ? starterGear.armor : equipped.armor,
    };
    setEquipped(reconciled);
    setRunStartEquipped(reconciled);
  }, [
    walletConnected,
    onchain.isSuccess,
    onchain.isFetching,
    inventory,
    runStartEquipped,
    equipped,
    starterGear,
  ]);

  const handleLootMinted = async (loot: LootRoll, ctx: { depth: number }) => {
    let newCard: AssetCardType;
    if (chainMintAvailable && initial) {
      // Real path — fire the tx and let the inventory query reconcile.
      // `useMintLoot` invalidates `inventoryCards(player)` on success.
      // `ctx.depth` is the live engine depth (the page only sees the
      // frozen `initial.state.depth` of 1 from `startRun`).
      const { tokenId } = await mintLoot({
        realm: cfg.realm,
        preset,
        runSeed: initial.state.rngSeed,
        depth: ctx.depth,
        loot,
        realmLabel: cfg.name,
      });
      // Build the equipped-side card with the real on-chain tokenId so the
      // inventory drawer's "selected" highlight matches once the chain
      // query refetches and surfaces the canonical card.
      newCard = lootRollToMockCard(loot, preset, cfg.realm, cfg.name, { tokenId });
    } else {
      // Disconnected OR realm-not-ready — keep the local accumulator alive.
      newCard = lootRollToMockCard(loot, preset, cfg.realm, cfg.name);
      setLocalInventory((prev) => [...prev, newCard]);
    }
    // Auto-equip the freshly-minted card — the prompt's CTA is literally
    // "Mint and equip", so honor that. Per-slot replacement matches the
    // drawer's equip path. Per spec the active CombatState's stats
    // stay frozen until the next room, so this can't yank gear mid-fight.
    if (newCard.slot === "weapon" || newCard.slot === "armor") {
      setEquipped((prev) => ({ ...prev, [newCard.slot as "weapon" | "armor"]: newCard }));
    }
  };

  // Per-(tokenId, targetRealm) translation cache. The drawer fires
  // `onEquip` synchronously; rather than await inside the click handler
  // (which would block the React tree on a chain read), we kick off the
  // translation and pop the translated card into `equipped` when it
  // resolves. The cache keys off the foreign tokenId so re-equipping the
  // same card costs nothing past the first hop.
  const [translationCache] = useState<Map<string, AssetCardType>>(() => new Map());

  const handleEquip = (
    slot: "weapon" | "armor",
    card: AssetCardType,
  ) => {
    // Native cards equip immediately. Foreign cards (different source
    // preset) need the on-chain adapter translation; we equip with the
    // native stats first so the drawer's selection state reconciles
    // instantly, then swap in the translated card when it lands.
    setEquipped((prev) => ({ ...prev, [slot]: card }));
    if (!publicClient) return;
    const key = `${card.tokenId.toString()}::${cfg.realm.toLowerCase()}`;
    const cached = translationCache.get(key);
    if (cached) {
      setEquipped((prev) => ({ ...prev, [slot]: cached }));
      return;
    }
    void translateCardForRealm({
      card,
      targetRealm: cfg.realm,
      publicClient,
    })
      .then((translated) => {
        // No-op if translation returned the same card (native, missing
        // adapter, or revert — see `translateCardForRealm` fallbacks).
        if (translated === card) return;
        translationCache.set(key, translated);
        // Only apply if this slot still holds the card the user picked —
        // they may have clicked something else in the meantime.
        setEquipped((prev) =>
          prev[slot]?.tokenId === card.tokenId ? { ...prev, [slot]: translated } : prev,
        );
      })
      .catch(() => {
        // translateCardForRealm already swallows view-call reverts; this
        // catches only programming errors. Silent — the card stays
        // equipped with native stats.
      });
  };

  // Set the moment the engine emits BossCleared for this run, drives
  // the inline story interstitial in the run-over panel. We *don't*
  // wait for the on-chain receipt — the narrative beat is engine-truth
  // and should land instantly.
  const [bossClearedThisRun, setBossClearedThisRun] = useState(false);

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

  // Roguelike restart. Bumps `runEpoch` (which keys EncounterFrame so its
  // local engine state hard-resets), draws a fresh CSPRNG seed so the
  // retry doesn't deterministically replay the death encounter, and
  // clears clear-receipt/boss-cleared state from the prior run. Gear in
  // `equipped` is retained per the engine's death contract — death
  // surrenders progress, not inventory.
  const handleRestart = useCallback(() => {
    setRestartSeed(fallbackSeed());
    setBossClearedThisRun(false);
    setClearReceipt(undefined);
    setRunEpoch((e) => e + 1);
  }, []);

  // Mint the on-chain clearReceipt the moment the engine emits
  // BossCleared. Disconnected / realm-not-ready runs surface a
  // "skipped" state — the tutorial overlay will simply not advance
  // past Act 3 until the player plays a connected run on a deployed
  // starter realm.
  const handleEngineEvent = (event: EngineEvent) => {
    if (event.type !== "BossCleared") return;
    if (!initial) return;
    setBossClearedThisRun(true);
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
      realm: cfg.realm,
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

  // Projected post-clear tutorial progress for the inline story beat.
  // We don't wait on the on-chain refetch — the player needs the next
  // step the moment the boss falls. Idempotent if the player has
  // already cleared this preset on a prior run.
  const projectedProgress: TutorialProgress = useMemo(() => {
    if (!bossClearedThisRun) return tutorial;
    if (tutorial.cleared.some((c) => c.preset === preset)) return tutorial;
    const cleared = [
      ...tutorial.cleared,
      { realm: cfg.realm, preset, ts: Math.floor(Date.now() / 1000) },
    ];
    const distinct = Math.min(3, cleared.length);
    const act: TutorialProgress["act"] = tutorial.hasSeed
      ? 5
      : distinct >= 3
        ? 4
        : distinct === 2
          ? 3
          : distinct === 1
            ? 2
            : 1;
    return {
      ...tutorial,
      cleared,
      distinctClears: distinct,
      act,
      eligibleForSeed: !tutorial.hasSeed && distinct >= 3,
    };
  }, [bossClearedThisRun, tutorial, preset, cfg.realm]);

  // EncounterFrame keeps its own RunState; we hand off the run state as
  // produced by `startRun` (which already has starter gear baked into
  // `equipped`). A re-equip during a run can't retroactively change the
  // active CombatState, and we
  // must pass the *exact* object `startRun` returned so the engine's
  // SCHEMA_STORE WeakMap lookup in `step()` resolves.
  const initialState: RunState | null = initial?.state ?? null;

  // Wallet gate. The play loop mints loot and clearReceipts the moment
  // they're earned; without a connected account those go nowhere visible
  // ("I just minted into I don't know where"). Block entry until the
  // player connects so every action has a destination. Gated on `mounted`
  // to keep SSR + first-paint stable while wagmi rehydrates.
  if (mounted && !walletConnected) {
    return (
      <main className="min-h-screen px-6 py-10">
        <header className="mx-auto mb-10 flex max-w-3xl items-center justify-between">
          <Link href="/" className="text-sm opacity-70 hover:opacity-100">
            ← Realms
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{cfg.name}</h1>
          <ConnectButton />
        </header>
        <section
          aria-label="Wallet required"
          className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-md p-6 text-center"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <h2 className="text-lg font-semibold">Connect a wallet to play</h2>
          <p className="text-sm opacity-75 leading-relaxed">
            Runs are pinned to an on-chain commitment, loot is minted to
            your wallet, and boss clears mint a receipt under your address.
            Connect to start — testnet ETH is enough.
          </p>
          <ConnectButton />
        </section>
      </main>
    );
  }

  // Realm-chain gate. The starter realms unlock linearly: each preset is
  // sealed until the previous realm's on-chain clearReceipt is in the
  // player's wallet (`useTutorialProgress` -> `fetchBossClears` scans
  // AssetMinted with the clearReceipt schemaId). Wait for the tutorial
  // query to land before gating so the gate doesn't flash sealed while
  // `emptyTutorialProgress()` is the placeholder.
  const lockState = lockStateFor(preset, tutorial);
  if (mounted && tutorialQuery.isSuccess && lockState === "locked-pre-prev") {
    const prevPreset =
      REALM_ORDER[Math.max(0, REALM_ORDER.indexOf(preset) - 1)]!;
    const prevName = getStarterRealm(prevPreset).name;
    return (
      <main className="min-h-screen px-6 py-10">
        <header className="mx-auto mb-10 flex max-w-3xl items-center justify-between">
          <Link href="/" className="text-sm opacity-70 hover:opacity-100">
            ← Realms
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{cfg.name}</h1>
          <ConnectButton />
        </header>
        <section
          aria-label="Realm sealed"
          className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-md p-6 text-center"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px dashed rgba(255,255,255,0.18)",
          }}
        >
          <h2 className="text-lg font-semibold">Sealed</h2>
          <p className="text-sm opacity-75 leading-relaxed">
            {lockTeaseFor(preset)}
          </p>
          <p className="text-xs opacity-60 leading-relaxed">
            Clear <strong>{prevName}</strong> first — its clearReceipt is
            the key to this door.
          </p>
          <Link
            href={`/play/${prevPreset}`}
            className="rounded-md px-4 py-2 text-sm transition"
            style={{
              background: "var(--color-preset-accent, rgba(255,255,255,0.1))",
              color: "var(--color-preset-bg, #fff)",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            Go to {prevName} →
          </Link>
        </section>
      </main>
    );
  }

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
              key={runEpoch}
              initialState={initialState}
              initialLines={initial.lines}
              bossId={cfg.bossId}
              equipped={equipped}
              activePreset={preset}
              onEvent={handleEngineEvent}
              onLootMinted={handleLootMinted}
              onRestart={handleRestart}
              clearReceipt={clearReceipt}
              interstitial={
                bossClearedThisRun ? (
                  <RealmClearedInterstitial
                    justCleared={preset}
                    projected={projectedProgress}
                    onClaimSeed={handleClaimSeed}
                  />
                ) : null
              }
            />
            {commitment.data && !restartSeed && (
              <p className="text-[11px] opacity-50 font-mono break-all">
                Run committed against block {commitment.data.blockNumber.toString()}{" "}
                · seed {commitment.data.seed.slice(0, 10)}…
              </p>
            )}
            {restartSeed && (
              <p className="text-[11px] opacity-50 font-mono break-all">
                Retry run · seed {restartSeed.slice(0, 10)}… (not chain-pinned)
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
        activeRealm={cfg.realm}
      />
    </main>
  );
}
