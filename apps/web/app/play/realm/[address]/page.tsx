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
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import type {
  EngineEvent,
  EscrowEntry,
  Preset,
  RunState,
  Tier,
} from "@/lib/engine/types";
import { startRun } from "@/lib/engine";
import { useRealmTheme } from "@/lib/ui/useRealmTheme";
import {
  CANONICAL_SCHEMAS,
  fallbackSeed,
  makeStarterGear,
} from "@/lib/engine/runtime";
import { EncounterFrame } from "@/components/game/EncounterFrame";
import { GearTranslationScreen } from "@/components/game/GearTranslationScreen";
import { AppShell, Panel } from "@/components/ui";
import { useRealms } from "@/lib/reads/hooks";
import { useMintLoot } from "@/lib/contracts/loot";
import { useMintClearReceipt } from "@/lib/contracts/boss-cleared";
import {
  useEquippedHydration,
  useIsCrossGenre,
} from "@/lib/persistence/use-equipped-hydration";
import { shortAddress } from "@/lib/utils";
import { isHexAddress } from "@/lib/validation/schemas";

const TRIAL_PRESET: Preset = "fantasy";
const TRIAL_BOSS_ID = "forest_hag";

type RealmMeta = {
  address: `0x${string}`;
  owner: `0x${string}`;
  preset: Preset;
  bossId: string;
  name: string;
  accent: string | null;
  maxTier: Tier;
  createdAt: number;
};

type MetaReply =
  | { ok: true; realm: RealmMeta }
  | { ok: false; reason: string; message: string };

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
  const realms = useRealms();
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

  // `data-preset` drives the per-preset palette; a registered custom
  // accent (if any) tints `--color-preset-accent` on top of it. The "crt"
  // skin flips the play screen to the amber terminal look (the realm's
  // accent still tints buttons/glow within the terminal).
  useRealmTheme(preset, registered?.accent, "crt");

  const starterGear = useMemo(
    () => (address ? makeStarterGear(preset, address, realmName) : null),
    [address, preset, realmName],
  );

  // Persisted-gear hydration: `equippedNative` (pre-translation, drives the
  // cross-genre entry beat) + `runStartEquipped` (translated, frozen for the
  // whole delve). See `useEquippedHydration`.
  const { equippedNative, runStartEquipped } = useEquippedHydration({
    realm: address,
    starterGear,
  });
  const [entryAck, setEntryAck] = useState(false);

  const initial = useMemo(() => {
    if (!address || !csprngSeed || !starterGear || !runStartEquipped) {
      return null;
    }
    return startRun({
      preset,
      realm: address,
      rngSeed: csprngSeed,
      equipped: {
        weapon: runStartEquipped.weapon,
        armor: runStartEquipped.armor,
      },
      bossId,
      // Player realms scale their cap via the sqlite row; trial mode
      // pins to T2.
      schemas: { ...CANONICAL_SCHEMAS[preset], maxTier },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, csprngSeed, preset, bossId, maxTier, runStartEquipped]);

  const seedReady = mounted && !!initial && !!address && metaQuery.isFetched;

  // Cross-genre entry beat: true iff staged gear came from a different genre
  // than this realm. Trial mode realms aren't in the starter set, so a card's
  // origin preset still resolves via `realmPreset`/`presetForRealm`.
  const crossGenre = useIsCrossGenre(equippedNative, preset);

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

  // Batch-bank the delve escrow at extraction or boss clear.
  // Loot is carried unminted in `state.escrow` and only commits here; each
  // entry mints under its own `entry.depth` so the server validator can
  // bounds-check it against the band it rolled in. Escrow items are never
  // auto-equipped — only owned gear was risked.
  const handleBankEscrow = async (escrow: readonly EscrowEntry[]) => {
    if (!address) return;
    if (chainMintAvailable && initial && walletAddress) {
      // Loop the sponsored mint, one tx per finding (a batch path would
      // collapse this). `useMintLoot` invalidates the
      // inventory query on each success, so the hub's loadout picker
      // reconciles on the next visit.
      for (const entry of escrow) {
        await mintLoot({
          realm: address,
          preset,
          runSeed: initial.state.rngSeed,
          depth: entry.depth,
          loot: entry.loot,
          realmLabel: realmName,
        });
      }
    }
    // Trial mode (unregistered realm): findings don't mint and there's no
    // inventory surface on the play page, so banking is a session no-op.
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

  const initialState: RunState | null = initial?.state ?? null;

  if (!validAddress) {
    return (
      <AppShell back={{ href: "/", label: "← Realms" }} title="Unknown realm">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-2xl font-semibold">Unknown realm</h1>
          <p className="mt-2 text-sm opacity-80">
            <span className="font-mono">{raw}</span> isn&apos;t a valid
            ecosystem address.
          </p>
        </div>
      </AppShell>
    );
  }

  if (mounted && !walletConnected) {
    return (
      <AppShell
        back={{ href: "/", label: "← Realms" }}
        title={<span className="font-mono">{realmName}</span>}
      >
        <Panel
          as="section"
          tone="glass-2"
          aria-label="Wallet required"
          className="mx-auto flex max-w-md flex-col items-center gap-4 p-6 text-center"
        >
          <h2 className="text-lg font-semibold">Connect a wallet to play</h2>
          <p className="text-sm opacity-75 leading-relaxed">
            Loot and clearReceipts mint to the connected address — pick
            a wallet so drops have somewhere to land.
          </p>
        </Panel>
      </AppShell>
    );
  }

  return (
    <AppShell
      back={{ href: "/", label: "← Realms" }}
      title={
        <span className="flex flex-col items-center gap-0.5 leading-none">
          {realmName}
          {address && (
            <Link
              href={`/realm/${address}`}
              className="text-[10px] font-normal uppercase tracking-widest opacity-70 hover:opacity-100"
            >
              Realm details ↗
            </Link>
          )}
        </span>
      }
    >
      <section className="mx-auto flex max-w-4xl flex-col gap-4">
        {metaQuery.isSuccess && !isRegistered && (
          <Panel
            as="aside"
            tone="glass-2"
            aria-label="Trial mode"
            className="p-3 text-sm"
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
          </Panel>
        )}
        {isRegistered && (
          <Panel
            as="aside"
            tone="glass-2"
            aria-label="Realm metadata"
            className="p-3 text-sm"
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
          </Panel>
        )}

        {seedReady && initialState && initial ? (
          crossGenre && !entryAck && address ? (
            <GearTranslationScreen
              realm={address}
              preset={preset}
              equipped={equippedNative ?? {}}
              onDescend={() => setEntryAck(true)}
            />
          ) : (
            <EncounterFrame
              initialState={initialState}
              initialLines={initial.lines}
              bossId={bossId}
              activePreset={preset}
              realmName={realmName}
              // Player realms surface their name in the page title and the
              // metadata panel from the start, so there's no mystery to gate —
              // reveal it in the escrow tray too (the "???" beat is only for
              // the starter arc's depth-2 reveal).
              realmNameRevealed
              chainReady={chainMintAvailable}
              onEvent={handleEngineEvent}
              onBankEscrow={handleBankEscrow}
              clearReceipt={clearReceipt}
              // Creator realms always return to the base picker on clear
              // (default href); only the starter arc lands on the chest.
              bossReturnHref="/"
            />
          )
        ) : (
          <Panel
            as="aside"
            tone="glass-2"
            aria-label="Preparing run"
            className="p-4 text-sm opacity-80"
          >
            Preparing run…
          </Panel>
        )}
      </section>

    </AppShell>
  );
}
