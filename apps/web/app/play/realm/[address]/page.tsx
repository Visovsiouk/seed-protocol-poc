"use client";

/**
 * `/play/realm/[address]` — play route for creator-deployed ecosystems.
 *
 * Two paths through the same component:
 *
 *   - **Registered**: `/api/realm/[address]/meta` returns the
 *     row from sqlite — preset, bossId, name, maxTier. The engine runs
 *     in the chosen flavor + final boss; loot and clearReceipts mint
 *     on-chain via the realm's HD-derived delegate signer.
 *
 *   - **Unregistered (legacy fallback)**: no metadata row → trial mode.
 *     Engine runs with fantasy + Forest Hag, drops accumulate in
 *     local state, nothing mints. Covers realms deployed before Phase
 *     B or via the bare factory call.
 *
 * The `useRealms()` registry check stays — an address that isn't even
 * a registered ecosystem still falls through to the 404 panel.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAccount, usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import type {
  AssetCard as AssetCardType,
  EngineEvent,
  LootRoll,
  Preset,
  RunState,
  Tier,
} from "@/lib/engine/types";
import { startRun } from "@/lib/engine";
import {
  CANONICAL_SCHEMAS,
  fallbackSeed,
  lootRollToMockCard,
  makeStarterGear,
} from "@/lib/engine/runtime";
import { EncounterFrame } from "@/components/game/EncounterFrame";
import { InventoryDrawer } from "@/components/inventory/InventoryDrawer";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import {
  useInventoryCards,
  useRealms,
} from "@/lib/reads/hooks";
import { useMintLoot } from "@/lib/contracts/loot";
import { useMintClearReceipt } from "@/lib/contracts/boss-cleared";
import { translateCardForRealm } from "@/lib/contracts/adapters";

const TRIAL_PRESET: Preset = "fantasy";
const TRIAL_BOSS_ID = "forest_hag";

type RealmMeta = {
  address: `0x${string}`;
  owner: `0x${string}`;
  preset: Preset;
  bossId: string;
  name: string;
  maxTier: Tier;
  createdAt: number;
};

type MetaReply =
  | { ok: true; realm: RealmMeta }
  | { ok: false; reason: string; message: string };

function shortAddress(addr: `0x${string}`): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function isHexAddress(value: string): value is `0x${string}` {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

async function fetchRealmMeta(address: `0x${string}`): Promise<RealmMeta | null> {
  const res = await fetch(`/api/realm/${address}/meta`, { cache: "no-store" });
  if (res.status === 404) return null;
  const body = (await res.json()) as MetaReply;
  if (!body.ok) {
    if (body.reason === "not_found") return null;
    throw new Error(`meta[${body.reason}]: ${body.message}`);
  }
  return body.realm;
}

export default function CreatorRealmPlayPage() {
  const params = useParams<{ address: string }>();
  const raw = params.address ?? "";
  const validAddress = isHexAddress(raw);
  const address = validAddress ? (raw.toLowerCase() as `0x${string}`) : null;

  const { address: walletAddress, isConnected: walletConnected } = useAccount();
  const publicClient = usePublicClient();
  const realms = useRealms();
  const onchain = useInventoryCards(walletAddress);
  const { mintLoot } = useMintLoot();
  const { mintClearReceipt } = useMintClearReceipt();

  const registryEntry = useMemo(
    () =>
      address
        ? realms.data?.find((r) => r.address.toLowerCase() === address)
        : undefined,
    [realms.data, address],
  );

  // Metadata fetch. Stays cached for the page lifetime since it
  // never changes after the create flow. A 404 collapses to
  // `registered = null` and the page falls back to trial mode.
  const metaQuery = useQuery({
    queryKey: ["realm-meta", address],
    enabled: !!address,
    staleTime: Infinity,
    queryFn: async () => (address ? fetchRealmMeta(address) : null),
  });

  const registered = metaQuery.data ?? null;
  const preset: Preset = registered?.preset ?? TRIAL_PRESET;
  const bossId: string = registered?.bossId ?? TRIAL_BOSS_ID;
  const realmName: string = registered?.name ?? (address ? `Realm ${shortAddress(address)}` : "Unknown realm");
  const maxTier: Tier = registered?.maxTier ?? 2;
  const isRegistered = !!registered;

  const [csprngSeed, setCsprngSeed] = useState<`0x${string}` | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (csprngSeed === null) setCsprngSeed(fallbackSeed());
    setMounted(true);
  }, [csprngSeed]);

  const [runEpoch, setRunEpoch] = useState(0);

  // `data-preset` drives the per-preset palette via CSS vars.
  useEffect(() => {
    const prev = document.body.getAttribute("data-preset");
    document.body.setAttribute("data-preset", preset);
    return () => {
      if (prev) document.body.setAttribute("data-preset", prev);
      else document.body.removeAttribute("data-preset");
    };
  }, [preset]);

  const starterGear = useMemo(
    () => (address ? makeStarterGear(preset, address, realmName) : null),
    [address, preset, realmName],
  );

  const initial = useMemo(() => {
    if (!address || !csprngSeed || !starterGear) return null;
    return startRun({
      preset,
      realm: address,
      rngSeed: csprngSeed,
      equipped: { weapon: starterGear.weapon, armor: starterGear.armor },
      bossId,
      // Player realms scale their cap via the sqlite row; trial mode
      // pins to T2.
      schemas: { ...CANONICAL_SCHEMAS[preset], maxTier },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, csprngSeed, runEpoch, preset, bossId, maxTier]);

  const handleRestart = () => {
    setCsprngSeed(fallbackSeed());
    setRunEpoch((e) => e + 1);
  };

  const seedReady = mounted && !!initial && !!address && metaQuery.isFetched;

  const [localInventory, setLocalInventory] = useState<AssetCardType[]>([]);
  const [equipped, setEquipped] = useState<{
    weapon?: AssetCardType;
    armor?: AssetCardType;
  }>(() =>
    starterGear
      ? { weapon: starterGear.weapon, armor: starterGear.armor }
      : {},
  );
  useEffect(() => {
    if (!starterGear) return;
    setEquipped((prev) =>
      prev.weapon || prev.armor
        ? prev
        : { weapon: starterGear.weapon, armor: starterGear.armor },
    );
  }, [starterGear]);

  const [drawerOpen, setDrawerOpen] = useState(false);

  // clearReceipt mint state — pending/minted/failed/skipped, mirrors
  // the starter /play/[preset] page so the run-over panel can render
  // real on-chain feedback. Trial mode skips minting entirely.
  const [clearReceipt, setClearReceipt] = useState<
    | { status: "pending" }
    | { status: "minted"; txHash: `0x${string}`; tokenId: bigint }
    | { status: "failed"; error: string }
    | { status: "skipped"; reason: string }
    | undefined
  >(undefined);

  const chainMintAvailable = walletConnected && isRegistered;

  const handleLootMinted = async (loot: LootRoll, ctx: { depth: number }) => {
    if (!address) return;
    let newCard: AssetCardType;
    if (chainMintAvailable && initial && walletAddress) {
      const { tokenId } = await mintLoot({
        realm: address,
        preset,
        runSeed: initial.state.rngSeed,
        depth: ctx.depth,
        loot,
        realmLabel: realmName,
      });
      newCard = lootRollToMockCard(loot, preset, address, realmName, { tokenId });
    } else {
      newCard = lootRollToMockCard(loot, preset, address, realmName);
      setLocalInventory((prev) => [...prev, newCard]);
    }
    if (newCard.slot === "weapon" || newCard.slot === "armor") {
      setEquipped((prev) => ({
        ...prev,
        [newCard.slot as "weapon" | "armor"]: newCard,
      }));
    }
  };

  const handleEngineEvent = (event: EngineEvent) => {
    if (event.type !== "BossCleared") return;
    if (!initial || !address) return;
    if (!chainMintAvailable) {
      setClearReceipt({
        status: "skipped",
        reason: walletConnected
          ? "Realm isn't registered yet — clearReceipt not minted."
          : "Wallet not connected — clearReceipt not minted.",
      });
      return;
    }
    setClearReceipt({ status: "pending" });
    mintClearReceipt({
      preset,
      runSeed: initial.state.rngSeed,
      bossId,
      turns: event.turns,
      finalHp: event.finalHp,
      realmLabel: realmName,
      realm: address,
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

  // Drawer inventory: on-chain holdings + trial-only accumulator when
  // running off-chain. Foreign cards translate via the per-realm
  // adapter, matching the /play/[preset] behavior.
  const inventory: readonly AssetCardType[] = chainMintAvailable
    ? (onchain.data ?? [])
    : walletConnected
      ? [...(onchain.data ?? []), ...localInventory]
      : localInventory;

  const [translationCache] = useState<Map<string, AssetCardType>>(() => new Map());
  const handleEquip = (slot: "weapon" | "armor", card: AssetCardType) => {
    setEquipped((prev) => ({ ...prev, [slot]: card }));
    if (!publicClient || !address) return;
    const key = `${card.tokenId.toString()}::${address.toLowerCase()}`;
    const cached = translationCache.get(key);
    if (cached) {
      setEquipped((prev) => ({ ...prev, [slot]: cached }));
      return;
    }
    void translateCardForRealm({
      card,
      targetRealm: address,
      publicClient,
    })
      .then((translated) => {
        if (translated === card) return;
        translationCache.set(key, translated);
        setEquipped((prev) =>
          prev[slot]?.tokenId === card.tokenId
            ? { ...prev, [slot]: translated }
            : prev,
        );
      })
      .catch(() => {});
  };

  const initialState: RunState | null = initial?.state ?? null;

  if (!validAddress) {
    return (
      <main className="min-h-screen px-6 py-10">
        <div className="mx-auto max-w-2xl">
          <Link href="/" className="text-sm opacity-70 hover:opacity-100">
            ← Realms
          </Link>
          <h1 className="mt-4 text-2xl font-semibold">Unknown realm</h1>
          <p className="mt-2 text-sm opacity-80">
            <span className="font-mono">{raw}</span> isn&apos;t a valid
            ecosystem address.
          </p>
        </div>
      </main>
    );
  }

  if (mounted && !walletConnected) {
    return (
      <main className="min-h-screen px-6 py-10">
        <header className="mx-auto mb-10 flex max-w-3xl items-center justify-between">
          <Link href="/" className="text-sm opacity-70 hover:opacity-100">
            ← Realms
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight font-mono">
            {realmName}
          </h1>
          <ConnectButton />
        </header>
        <section
          aria-label="Wallet required"
          className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-md p-6 text-center"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.10)",
          }}
        >
          <h2 className="text-lg font-semibold">Connect a wallet to play</h2>
          <p className="text-sm opacity-75 leading-relaxed">
            Loot and clearReceipts mint to the connected address — pick
            a wallet so drops have somewhere to land.
          </p>
          <ConnectButton />
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
            {realmName}
          </h1>
          {address && (
            <Link
              href={`/realm/${address}`}
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
        {metaQuery.isSuccess && !isRegistered && (
          <aside
            aria-label="Trial mode"
            className="rounded-md p-3 text-sm"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <strong>Trial run.</strong> This realm has no registered
            metadata — running in fantasy/Forest Hag stand-in. Drops
            stay in this session only.{" "}
            {realms.isSuccess && !registryEntry && (
              <>
                The supplied address isn&apos;t in
                <code> EcosystemRegistry</code> on this chain.
              </>
            )}
          </aside>
        )}
        {isRegistered && (
          <aside
            aria-label="Realm metadata"
            className="rounded-md p-3 text-sm"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            <strong>{realmName}</strong> · {preset} · final boss{" "}
            <code>{bossId}</code> · max tier <strong>T{maxTier}</strong>
            {registered && registered.owner && (
              <>
                {" "}
                · owner{" "}
                <span className="font-mono">{shortAddress(registered.owner)}</span>
              </>
            )}
          </aside>
        )}

        {seedReady && initialState && initial ? (
          <EncounterFrame
            key={runEpoch}
            initialState={initialState}
            initialLines={initial.lines}
            bossId={bossId}
            equipped={equipped}
            activePreset={preset}
            realmName={realmName}
            onEvent={handleEngineEvent}
            onLootMinted={handleLootMinted}
            onRestart={handleRestart}
            clearReceipt={clearReceipt}
          />
        ) : (
          <aside
            aria-label="Preparing run"
            className="rounded-md p-4 text-sm opacity-80"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            Preparing run…
          </aside>
        )}
      </section>

      <InventoryDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        inventory={inventory}
        equipped={equipped}
        onEquip={handleEquip}
        activeRealm={address ?? undefined}
      />
    </main>
  );
}
