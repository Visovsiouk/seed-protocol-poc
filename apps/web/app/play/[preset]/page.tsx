"use client";

/**
 * `/play/[preset]` — the run room.
 *
 * Two operating modes, switched by wallet connection:
 *
 *   **Disconnected (fallback):** everything is in-memory. The
 *     engine drives the run, the tutorial overlay uses
 *     `emptyTutorialProgress()`, and the run's banked escrow is converted
 *     to mock `AssetCard`s and stashed in local state so the drawer has
 *     something to show.
 *
 *   **Connected:** the inventory drawer reads on-chain via
 *     `useInventoryCards(player)`, and extraction batch-mints the escrow
 *     via `EcosystemTemplate.mintAsset` through `useMintLoot`. The query
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
import { notFound, useParams, useRouter } from "next/navigation";
import { useAccount, usePublicClient } from "wagmi";
import type {
  AssetCard as AssetCardType,
  EngineEvent,
  EscrowEntry,
  Preset,
  RunState,
} from "@/lib/engine/types";
import { startRun } from "@/lib/engine";
import { useRealmTheme } from "@/lib/ui/useRealmTheme";
import {
  CANONICAL_SCHEMAS,
  VALID_PRESETS,
  fallbackSeed,
  lootRollToMockCard,
  makeStarterGear,
} from "@/lib/engine/runtime";
import { EncounterFrame } from "@/components/game/EncounterFrame";
import { RealmClearedInterstitial } from "@/components/game/RealmClearedInterstitial";
import { AppShell, Panel } from "@/components/ui";
import { emptyTutorialProgress, type TutorialProgress } from "@/lib/tutorial/progress";
import {
  useInventoryCards,
  useStarterRealm,
  useTutorialProgress,
} from "@/lib/reads/hooks";
import { useMintLoot } from "@/lib/contracts/loot";
import { useMintClearReceipt } from "@/lib/contracts/boss-cleared";
import { useRunSeedCommitment } from "@/lib/contracts/run-seed";
import { getStarterRealm } from "@/lib/contracts/starter-realms";
import { presetForRealm, translateCardForRealm } from "@/lib/contracts/adapters";
import { GearTranslationScreen } from "@/components/game/GearTranslationScreen";
import {
  type EquippedSnapshot,
  loadEquipped,
  saveEquipped,
} from "@/lib/persistence/equipped";
import {
  REALM_ORDER,
  isPlayable,
  lockStateFor,
} from "@/lib/story/progression";

export default function PlayPage() {
  const params = useParams<{ preset: string }>();
  const preset = params.preset as Preset;
  if (!VALID_PRESETS.has(preset)) notFound();
  const router = useRouter();

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
  // resolving, fall back to CSPRNG so play isn't blocked. Death ends the
  // descent and returns the player to the base (no in-place restart), so a
  // fresh run is always a fresh page mount with its own seed.
  const rngSeed: `0x${string}` | null =
    commitment.data?.seed ?? csprngSeed ?? null;

  // Effect-only body palette toggle — keeps SSR pristine. Starters have
  // no custom accent, so the genre default always wins. The "crt" skin
  // flips the play screen to the amber terminal look.
  useRealmTheme(preset, null, "crt");

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
  // Equipped slots — *native* cards. Hydrated from localStorage on mount
  // so gear earned in one realm carries into the next. This is the
  // canonical, persisted shape: we always store the native card (source
  // realm + native stats), never a translated copy. GearTranslationScreen
  // and InventoryDrawer read this directly — their AssetCard renders use
  // `targetRealm` to do the display-side translation, so they need the
  // native source to start from.
  const [equipped, setEquipped] = useState<{
    weapon?: AssetCardType;
    armor?: AssetCardType;
  }>({ weapon: starterGear.weapon, armor: starterGear.armor });
  // The equipped state used at run-start. Captured once at hydration time
  // from the loadout the player staged in the hub, then frozen for the
  // whole delve (gear is locked once you descend — there is no in-run
  // equip path). Holds *translated* cards so the engine is initialised
  // against the right numbers for this realm.
  const [runStartEquipped, setRunStartEquipped] = useState<{
    weapon?: AssetCardType;
    armor?: AssetCardType;
  } | null>(null);

  // Did the player carry gear from a *different* genre into this realm? If
  // so, the entry "your gear changes shape" beat plays once before the run
  // (see render). Starter gear is realm-local (its origin preset === this
  // realm's), so a first-ever descent with starter gear is native and shows
  // nothing. We read the *native* `equipped` cards' origin preset, not the
  // translated run-start snapshot.
  const [entryAck, setEntryAck] = useState(false);
  const crossGenre = useMemo(() => {
    return [equipped.weapon, equipped.armor].some((c) => {
      if (!c) return false;
      const origin = c.realmPreset ?? presetForRealm(c.realm);
      return !!origin && origin !== preset;
    });
  }, [equipped, preset]);

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
      // Per-realm narrative-mechanic surface (see `StarterRealm`). All
      // three starters ship `bossDepth: 5` (every realm is permadeath);
      // fantasy also forces the first weapon to "fire" so the Pilgrim's
      // Brand lands as story rather than coincidence.
      bossDepth: cfg.bossDepth,
      forcedFirstWeaponElement: cfg.forcedFirstWeaponElement,
      // Starter realms cap rolls at T2 to preserve the seed-liquidity floor:
      // the bank should fill up with T1/T2 gear from tutorials, and T3+ is
      // reserved for player-authored realms. The server mirrors
      // this ceiling in `/api/realm/mint-loot`, so a tampered client roll
      // would be rejected at mint time anyway.
      schemas: { ...CANONICAL_SCHEMAS[preset], maxTier: 2 },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, rngSeed, runStartEquipped]);

  // Connected players wait briefly while we pin the run to a blockhash;
  // disconnected players go straight to the CSPRNG path. `mounted` keeps
  // SSR + first-paint inert so the hydration DOM matches.
  const seedReady =
    mounted && !!initial && (!walletConnected || !!commitment.data);

  // Lock verdict, hoisted up so the hydration + save effects below can
  // bail before they ever persist a starter for a sealed preset. We
  // treat the verdict as definitive once either (a) the player isn't
  // connected (tutorial query is idle — falls back to empty progress
  // and the first realm in `REALM_ORDER` is the only playable one) or
  // (b) the tutorial query has resolved. Otherwise we wait — flashing
  // a redirect mid-load would be worse than a one-frame stall.
  // `tutorial` is shared with the overlay below — same fallback either
  // way (empty progress while the query is mid-flight or the player is
  // disconnected).
  const tutorial = tutorialQuery.data ?? emptyTutorialProgress();
  const lockState = lockStateFor(preset, tutorial);
  const lockResolved = mounted && (!walletConnected || tutorialQuery.isSuccess);
  const sealed = lockResolved && !isPlayable(lockState);

  // One-shot hydration: read the persisted snapshot (native cards),
  // translate each slot against the active realm's adapter, then pin
  // `equipped` (native), `equippedForEngine` (translated), and the
  // run-start snapshot together. Guarded so it only fires on first mount
  // — re-running would clobber drawer equip choices.
  //
  // We *await* the translations before pinning `runStartEquipped` so the
  // engine never boots a run against native stats it'll then drift away
  // from. While the translate calls are in flight, `seedReady` stays
  // false (it gates on `initial`, which gates on `runStartEquipped`), so
  // the player sees the "Pinning run seed…" placeholder instead of a
  // half-equipped HUD.
  //
  // Gated on `!sealed`: a locked preset must never run hydration —
  // otherwise its starter would be `setEquipped`'d and then persisted
  // by the save effect below, polluting the next playable realm's
  // localStorage snapshot.
  useEffect(() => {
    // Wait for the lock verdict before deciding to hydrate. Without
    // this, the first mount-cycle (mounted=false, lockResolved=false,
    // sealed=false) would fall through and persist starter gear for
    // sealed presets.
    if (!lockResolved) return;
    if (sealed) return;
    if (runStartEquipped !== null) return;
    let cancelled = false;
    const stored = loadEquipped();
    // A *starter* card (tokenId === 0n) is realm-local — it represents
    // the gear handed out by `makeStarterGear` for one specific preset.
    // If the persisted slot is a starter from a different realm (e.g.
    // the player loaded /play/cyberpunk first, which seeded its starter
    // into localStorage, then now lands on /play/fantasy), we discard
    // it and re-seed from this realm's `starterGear`. Real on-chain
    // cards (tokenId > 0n) keep travelling across realms — that's the
    // cross-preset translation story we want to preserve.
    const keepIfNative = (
      card: AssetCardType | undefined,
      fallback: AssetCardType,
    ): AssetCardType => {
      if (!card) return fallback;
      if (card.tokenId === 0n && card.realm?.toLowerCase() !== cfg.realm.toLowerCase()) {
        return fallback;
      }
      return card;
    };
    const nativeBaseline: EquippedSnapshot = stored
      ? {
          weapon: keepIfNative(stored.weapon, starterGear.weapon),
          armor: keepIfNative(stored.armor, starterGear.armor),
        }
      : { weapon: starterGear.weapon, armor: starterGear.armor };
    // Native baseline goes into `equipped` immediately so the drawer +
    // warp interstitial render against the right shape from frame one.
    setEquipped(nativeBaseline);

    const translateOne = async (
      slot: "weapon" | "armor",
      card: AssetCardType | undefined,
    ): Promise<AssetCardType | undefined> => {
      if (!card || !publicClient) return card;
      try {
        return await translateCardForRealm({
          card,
          targetRealm: cfg.realm,
          publicClient,
        });
      } catch {
        // Adapter missing / reverted — fall back to native stats. Same
        // policy as `handleEquip`'s catch arm.
        return card;
      }
    };

    void Promise.all([
      translateOne("weapon", nativeBaseline.weapon),
      translateOne("armor", nativeBaseline.armor),
    ]).then(([w, a]) => {
      if (cancelled) return;
      setRunStartEquipped({ weapon: w, armor: a });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockResolved, sealed]);

  // Persist every equip change so the next mount (same preset reload OR
  // navigation to a different /play/[preset]) picks the snapshot back up.
  // Skipped while sealed — saves only ever fire after a successful
  // hydration (which also bails on sealed presets), but the explicit
  // guard makes the invariant readable.
  useEffect(() => {
    if (runStartEquipped === null) return; // hydration not done yet
    if (sealed) return;
    saveEquipped(equipped);
  }, [equipped, runStartEquipped, sealed]);

  // (Tutorial / lock verdict are hoisted above so the hydration +
  // save effects can gate on `sealed`.)

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
  // we're falling back (the wallet is connected — the page gates entry on
  // that — but the realm isn't chain-ready) we surface the in-session
  // accumulator on top of whatever on-chain holdings the player already
  // has, so they keep visibility into both.
  const inventory: readonly AssetCardType[] = chainMintAvailable
    ? (onchain.data ?? [])
    : [...(onchain.data ?? []), ...localInventory];

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

  // Batch-bank the delve escrow at extraction or boss clear.
  // Replaces the old per-room mint: loot is carried unminted in
  // `state.escrow` and only commits here. Each entry mints under its own
  // `entry.depth` so the server validator bounds-checks it against the
  // difficulty band it rolled in. Escrow items are never auto-equipped —
  // the player descended with their real gear and gambled only with
  // findings.
  const handleBankEscrow = async (escrow: readonly EscrowEntry[]) => {
    if (chainMintAvailable && initial) {
      // Real path — loop the sponsored mint, one tx per finding. A batch
      // `mintAssetBatch` would collapse this to one tx; the
      // looped fallback needs no contract change. `useMintLoot` invalidates
      // `inventoryCards(player)` on each success, so the drawer reconciles.
      for (const entry of escrow) {
        await mintLoot({
          realm: cfg.realm,
          preset,
          runSeed: initial.state.rngSeed,
          depth: entry.depth,
          loot: entry.loot,
          realmLabel: cfg.name,
        });
      }
    } else {
      // Disconnected OR realm-not-ready — append to the local accumulator.
      const cards = escrow.map((entry) =>
        lootRollToMockCard(entry.loot, preset, cfg.realm, cfg.name),
      );
      setLocalInventory((prev) => [...prev, ...cards]);
    }
  };

  // Set the moment the engine emits BossCleared for this run, drives
  // the inline story interstitial in the run-over panel. We *don't*
  // wait for the on-chain receipt — the narrative beat is engine-truth
  // and should land instantly.
  const [bossClearedThisRun, setBossClearedThisRun] = useState(false);

  // Page-level mirror of the engine's current depth so the title bar
  // can hide the realm name until the player has crossed at least one
  // room. EncounterFrame owns the live RunState; we shadow it via the
  // `RoomCleared` event stream so the chrome can react without
  // reaching into engine internals. Starts at 1 (wake) and bumps to
  // `event.depth + 1` on each room clear.
  const [currentDepth, setCurrentDepth] = useState(1);

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
    if (event.type === "RoomCleared") {
      // `event.depth` is the depth that was just cleared. The player
      // is now stepping into `depth + 1` (or the boss room).
      setCurrentDepth(event.depth + 1);
      return;
    }
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

  // The Seed claim now lives at the chest (the Altar station's
  // GenesisLedger), reached automatically after the arc-completing clear.
  // The tutorial overlay no longer surfaces a claim CTA.

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
    // The starter set is closed at three known addresses; this play
    // route only ever runs against a starter, so the just-cleared
    // realm always bumps `starterClears`. The community tier is
    // unchanged by definition here — we leave it as-is.
    const starterClears = Math.min(3, tutorial.starterClears + 1);
    const communityClears = tutorial.communityClears;
    const communityRealmCount = tutorial.communityRealmCount;
    const communityRequirement = Math.min(3, communityRealmCount);
    const act: TutorialProgress["act"] = tutorial.hasSeed
      ? 5
      : starterClears >= 3
        ? 4
        : starterClears === 2
          ? 3
          : starterClears === 1
            ? 2
            : 1;
    return {
      ...tutorial,
      cleared,
      starterClears,
      communityClears,
      communityRealmCount,
      distinctClears: starterClears,
      act,
      eligibleForSeed:
        !tutorial.hasSeed &&
        starterClears >= 3 &&
        communityClears >= communityRequirement,
    };
  }, [bossClearedThisRun, tutorial, preset, cfg.realm]);

  // EncounterFrame keeps its own RunState; we hand off the run state as
  // produced by `startRun` (which already has starter gear baked into
  // `equipped`). A re-equip during a run can't retroactively change the
  // active CombatState, and we
  // must pass the *exact* object `startRun` returned so the engine's
  // SCHEMA_STORE WeakMap lookup in `step()` resolves.
  const initialState: RunState | null = initial?.state ?? null;

  // The realm announces itself only after the first room — the cold
  // open lands the player in an unnamed somewhere, and the name
  // becomes legible once they've taken a step. Applied universally
  // (all three starters); cleared starters reveal it instantly via
  // the engine narration drop, but the title bar still gates on
  // engine truth.
  const realmDisplayName = currentDepth >= 2 ? cfg.name : "???";

  // Wallet gate. The play loop mints loot and clearReceipts the moment
  // they're earned; without a connected account those go nowhere visible
  // ("I just minted into I don't know where"). Block entry until the
  // player connects so every action has a destination. Gated on `mounted`
  // to keep SSR + first-paint stable while wagmi rehydrates.
  if (mounted && !walletConnected) {
    return (
      <AppShell back={{ href: "/", label: "← Realms" }} title={realmDisplayName}>
        <Panel
          as="section"
          tone="glass-2"
          aria-label="Wallet required"
          className="mx-auto flex max-w-md flex-col items-center gap-4 p-6 text-center"
        >
          <h2 className="text-lg font-semibold">Connect a wallet to play</h2>
          <p className="text-sm opacity-75 leading-relaxed">
            Runs are pinned to an on-chain commitment, loot is minted to
            your wallet, and boss clears mint a receipt under your address.
            Connect to start — testnet ETH is enough.
          </p>
        </Panel>
      </AppShell>
    );
  }

  // Realm-chain gate. Sealed presets redirect straight to the first
  // realm in `REALM_ORDER` — the player can only enter realms whose
  // prereq clearReceipt is already in their wallet. The hydration +
  // save effects above also bail on `sealed`, so visiting a sealed
  // route never leaks its starter into localStorage.
  if (sealed) {
    const firstRealm = REALM_ORDER[0]!;
    if (preset !== firstRealm) {
      // Fire-and-forget — keep this in a microtask so we don't update
      // the router during render. `replace` (not `push`) so the sealed
      // URL doesn't litter the browser back-stack.
      queueMicrotask(() => router.replace(`/play/${firstRealm}`));
    }
    return (
      <AppShell back={{ href: "/", label: "← Realms" }}>
        <p className="text-sm opacity-70">Redirecting…</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      back={{ href: "/", label: "← Realms" }}
      title={
        <span className="flex flex-col items-center gap-0.5 leading-none">
          {realmDisplayName}
          {/*
            Only surface the realm-details link when the realm is actually
            registered + active on-chain (realmReady), not merely when the
            config carries a non-zero address. Otherwise the link points at a
            /realm/[address] page that has no on-chain realm to render.
          */}
          {realmReady && currentDepth >= 2 && (
            <Link
              href={`/realm/${cfg.realm}`}
              className="text-[10px] font-normal uppercase tracking-widest opacity-70 hover:opacity-100"
            >
              Realm details ↗
            </Link>
          )}
        </span>
      }
    >
      <section className="mx-auto flex max-w-4xl flex-col gap-4">
        {showRealmNotDeployedNotice && (
          <Panel as="aside" tone="warn" aria-label="Realm not yet deployed" className="p-3 text-sm">
            <strong>Heads up:</strong>{" "}
            {starter.data?.deployed === false
              ? "The starter realm for this preset isn't deployed on this chain yet."
              : "The starter realm isn't active in the registry yet."}{" "}
            Drops will accumulate in this session only and won&apos;t be
            minted on-chain.
          </Panel>
        )}
        {seedReady && initialState && initial ? (
          crossGenre && !entryAck ? (
            // Cross-genre descent: play the "your gear changes shape" beat
            // once before the run boots. Native (first-ever / same-genre)
            // descents skip straight to combat.
            <GearTranslationScreen
              realm={cfg.realm}
              preset={preset}
              equipped={equipped}
              onDescend={() => setEntryAck(true)}
            />
          ) : (
          <>
            <EncounterFrame
              initialState={initialState}
              initialLines={initial.lines}
              bossId={cfg.bossId}
              activePreset={preset}
              realmName={cfg.name}
              // Same gate as the header title (`realmDisplayName`) so the
              // escrow tray and the title reveal the realm name together.
              realmNameRevealed={currentDepth >= 2}
              chainReady={chainMintAvailable}
              onEvent={handleEngineEvent}
              onBankEscrow={handleBankEscrow}
              clearReceipt={clearReceipt}
              // Arc-completing (third) clear lands on the chest (Altar); every
              // other clear returns to the base picker. The redirect itself is
              // owned by EncounterFrame's boss-clear dwell effect.
              bossReturnHref={
                projectedProgress.starterClears >= 3 ? "/?station=altar" : "/"
              }
              interstitial={
                bossClearedThisRun ? (
                  <RealmClearedInterstitial
                    justCleared={preset}
                    projected={projectedProgress}
                  />
                ) : null
              }
            />
            {commitment.data && (
              <p className="text-[11px] opacity-65 font-mono break-all">
                Run committed against block {commitment.data.blockNumber.toString()}{" "}
                · seed {commitment.data.seed.slice(0, 10)}…
              </p>
            )}
          </>
          )
        ) : (
          <Panel
            as="aside"
            tone="glass-2"
            aria-label="Pinning run to chain"
            className="p-4 text-sm opacity-80"
          >
            Pinning run seed to the latest block…
          </Panel>
        )}
      </section>
    </AppShell>
  );
}
