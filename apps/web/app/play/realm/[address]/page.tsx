"use client";

/**
 * `/play/realm/[address]` — trial-mode play route for creator-deployed
 * ecosystems.
 *
 * Creator realms surface in the landing-page `RealmSelector` as
 * dashed-border cards. Until the `/create` flow lets owners
 * register preset/bossId metadata on-chain, we have no way to know
 * which flavor pack or final boss a creator realm should run. This
 * route papers over that gap by:
 *
 *   - Defaulting flavor to **fantasy** + bossId `forest_hag` so the
 *     engine has everything it needs to drive a full run.
 *   - Running entirely **in-memory**: no clearReceipt mint, no loot
 *     mint, no tutorial wiring. Drops accumulate in a local inventory.
 *   - Validating the URL `address` is a registered ecosystem via
 *     `useRealms()`; unregistered addresses fall through to a 404-ish
 *     "unknown realm" panel.
 *
 * Once `/create` lands and creators can stamp a realm with its preset,
 * this page should swap the defaults for the on-chain values and rejoin
 * the connected mint path.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type {
  AssetCard as AssetCardType,
  LootRoll,
  Preset,
  RunState,
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
import { useRealms } from "@/lib/reads/hooks";

// Defaults applied to every creator realm until on-chain preset/bossId
// metadata exists. See the file header for the migration plan.
const TRIAL_PRESET: Preset = "fantasy";
const TRIAL_BOSS_ID = "forest_hag";

function shortAddress(addr: `0x${string}`): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function isHexAddress(value: string): value is `0x${string}` {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

export default function CreatorRealmPlayPage() {
  const params = useParams<{ address: string }>();
  const raw = params.address ?? "";
  const validAddress = isHexAddress(raw);
  const address = (validAddress ? (raw.toLowerCase() as `0x${string}`) : null);

  const realms = useRealms();
  const onchain = useMemo(
    () =>
      address
        ? realms.data?.find((r) => r.address.toLowerCase() === address)
        : undefined,
    [realms.data, address],
  );

  // SSR-safe seed: same gate as the preset route — no `crypto.getRandomValues`
  // during render so server and client paint match.
  const [csprngSeed, setCsprngSeed] = useState<`0x${string}` | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (csprngSeed === null) setCsprngSeed(fallbackSeed());
    setMounted(true);
  }, [csprngSeed]);

  // Per-preset palette is keyed off `data-preset` on the body. Trial mode
  // pins it to the trial preset so the page feels consistent with the
  // fantasy starter realm.
  useEffect(() => {
    const prev = document.body.getAttribute("data-preset");
    document.body.setAttribute("data-preset", TRIAL_PRESET);
    return () => {
      if (prev) document.body.setAttribute("data-preset", prev);
      else document.body.removeAttribute("data-preset");
    };
  }, []);

  const realmName = address ? `Realm ${shortAddress(address)}` : "Unknown realm";

  const starterGear = useMemo(
    () =>
      address
        ? makeStarterGear(TRIAL_PRESET, address, realmName)
        : null,
    [address, realmName],
  );

  const initial = useMemo(() => {
    if (!address || !csprngSeed || !starterGear) return null;
    return startRun({
      preset: TRIAL_PRESET,
      realm: address,
      rngSeed: csprngSeed,
      equipped: { weapon: starterGear.weapon, armor: starterGear.armor },
      bossId: TRIAL_BOSS_ID,
      schemas: CANONICAL_SCHEMAS[TRIAL_PRESET],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, csprngSeed]);

  const seedReady = mounted && !!initial && !!address;

  const [localInventory, setLocalInventory] = useState<AssetCardType[]>([]);
  const [equipped, setEquipped] = useState<{
    weapon?: AssetCardType;
    armor?: AssetCardType;
  }>(() =>
    starterGear
      ? { weapon: starterGear.weapon, armor: starterGear.armor }
      : {},
  );
  // Seed equipped slots once the gear is actually built. The lazy
  // initialiser above runs before `address` resolves on first paint, so
  // we backfill here when the gear lands.
  useEffect(() => {
    if (!starterGear) return;
    setEquipped((prev) =>
      prev.weapon || prev.armor
        ? prev
        : { weapon: starterGear.weapon, armor: starterGear.armor },
    );
  }, [starterGear]);

  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleLootMinted = (loot: LootRoll) => {
    if (!address) return;
    const card = lootRollToMockCard(loot, TRIAL_PRESET, address, realmName);
    setLocalInventory((prev) => [...prev, card]);
  };

  const handleEquip = (slot: "weapon" | "armor", card: AssetCardType) => {
    setEquipped((prev) => ({ ...prev, [slot]: card }));
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

  return (
    <main className="min-h-screen px-6 py-8">
      <header className="mx-auto mb-6 flex max-w-4xl items-center justify-between">
        <Link href="/" className="text-sm opacity-70 hover:opacity-100">
          ← Realms
        </Link>
        <div className="flex flex-col items-center gap-1">
          <h1 className="text-2xl font-semibold tracking-tight font-mono">
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
            Inventory ({localInventory.length})
          </button>
          <ConnectButton />
        </div>
      </header>

      <section className="mx-auto flex max-w-4xl flex-col gap-4">
        <aside
          aria-label="Trial mode"
          className="rounded-md p-3 text-sm"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          <strong>Trial run.</strong> Creator realms don&apos;t yet carry
          on-chain flavor or boss metadata, so this run uses the fantasy
          preset and the Forest Hag as a stand-in. Drops stay in this
          session only — nothing is minted on-chain.{" "}
          {realms.isSuccess && !onchain && (
            <>
              The supplied address isn&apos;t registered in
              EcosystemRegistry on this chain.
            </>
          )}
        </aside>

        {seedReady && initialState && initial ? (
          <EncounterFrame
            initialState={initialState}
            initialLines={initial.lines}
            bossId={TRIAL_BOSS_ID}
            equipped={equipped}
            activePreset={TRIAL_PRESET}
            onLootMinted={handleLootMinted}
          />
        ) : (
          <aside
            aria-label="Preparing trial run"
            className="rounded-md p-4 text-sm opacity-80"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            Preparing trial run…
          </aside>
        )}
      </section>

      <InventoryDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        inventory={localInventory}
        equipped={equipped}
        onEquip={handleEquip}
      />
    </main>
  );
}
