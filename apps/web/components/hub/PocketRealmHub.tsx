"use client";

/**
 * The pocket realm — the hideout the player wakes into, and the base/HQ the
 * whole pre-descent game runs out of (poc rework).
 *
 * Pre-arc it stays a *narrow door*: the cold-open branding / single Continue
 * card (owned by `RealmSelector`), with loadout staging taking over once a door
 * is picked. The world is deliberately small until the three founding doors are
 * walked.
 *
 * Post-arc it opens into the **HQ shell** — a titled base with a status strip
 * and an in-world station rail that replaces the old top-nav. One station is
 * visible at a time:
 *
 *   - **Doors**  — the realm picker (`RealmSelector`) → `LoadoutStaging`.
 *   - **Market** — the bazaar surface (listings + sales + leaderboards).
 *   - **Altar**  — the Name credential ledger (when eligible / carved).
 *   - **Forge**  — a workshop room that opens the realm-creation ceremony.
 *
 * Stations cross-fade with the realm-warp motion so moving between rooms reads
 * as walking the base rather than swapping a tab.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useAccount, useReadContract } from "wagmi";
import { ecosystemFactoryAbi } from "@abis/generated";
import { getAddress } from "@/lib/contracts/addresses";
import {
  RealmSelector,
  type RealmSelection,
} from "@/components/game/RealmSelector";
import { FeaturedRealm } from "@/components/landing/FeaturedRealm";
import { BazaarSurface } from "@/components/bazaar/BazaarSurface";
import { GenesisLedger } from "@/components/genesis/GenesisLedger";
import {
  ColdOpenBook,
  hasConsumedColdOpen,
} from "@/components/story/ColdOpenBook";
import { useTutorialProgress, useInventoryCards } from "@/lib/reads/hooks";
import {
  emptyTutorialProgress,
  type TutorialProgress,
} from "@/lib/tutorial/progress";
import { warpCrossfade, withReducedMotion } from "@/lib/ui/motion";
import { Panel, Button, Chip, Stamp, Rule } from "@/components/ui";
import { useCodexStatus } from "@/lib/codex/use-codex";
import { LoadoutStaging } from "./LoadoutStaging";
import { onHubStation } from "./station-event";

type Station = "doors" | "market" | "altar" | "forge";

const STATIONS: { id: Station; label: string }[] = [
  { id: "doors", label: "The Doors" },
  { id: "market", label: "The Market" },
  { id: "altar", label: "The Altar" },
  { id: "forge", label: "The Forge" },
];

/** Three diamond glyphs marking sparks kindled (mirrors RealmSelector). */
function ShardTrack({ shards }: { shards: number }) {
  return (
    <div
      aria-label={`Sparks kindled: ${shards} of 3`}
      className="flex items-center gap-1.5"
    >
      {[0, 1, 2].map((i) => {
        const lit = i < shards;
        return (
          <span
            key={i}
            style={{
              width: 9,
              height: 9,
              transform: "rotate(45deg)",
              background: lit ? "var(--color-preset-accent)" : "transparent",
              border: `1px solid ${
                lit ? "var(--color-preset-accent)" : "var(--border-2)"
              }`,
              boxShadow: lit ? "0 0 8px var(--color-preset-accent)" : "none",
            }}
          />
        );
      })}
    </div>
  );
}

function ForgeRoom() {
  return (
    <Panel
      as="section"
      tone="glass-2"
      aria-label="The forge"
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6"
    >
      <header className="flex flex-col gap-2">
        <Stamp>A workshop off the main hall</Stamp>
        <Rule />
        <h3 className="font-mono text-xl font-medium tracking-[-0.015em]">
          The forge
        </h3>
        <p className="text-sm leading-relaxed opacity-75">
          You have a name now, and a name is what it takes to finish a world of
          your own. Raise one from the unfinished — name it, pick its substance
          and the warden that holds its heart, and set it turning for the next
          aspirant to descend. Step through to the forge floor.
        </p>
      </header>
      <Link href="/create" prefetch className="self-start">
        <Button intent="primary" size="md">
          Enter the forge →
        </Button>
      </Link>
    </Panel>
  );
}

/**
 * The HQ header band + status strip. Shared by the pre-arc base (Doors-only)
 * and the post-arc HQ shell so "the hideout" reads identically in both — the
 * player wakes into the same titled base, it just grows more stations as the
 * arc is walked.
 */
function HideoutHeader({
  progress,
  ownedCount,
  codex,
}: {
  progress: TutorialProgress;
  ownedCount: number;
  codex?: { completed: number; total: number };
}) {
  return (
    <Panel
      as="header"
      tone="glass-3"
      glow="accent"
      aria-label="The base"
      className="flex flex-wrap items-center justify-between gap-4 p-5"
    >
      <div className="flex flex-col gap-1">
        <Stamp tone="accent">The base</Stamp>
        <h1 className="font-mono text-2xl font-medium tracking-[-0.015em]">
          Your base between the realms
        </h1>
      </div>
      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-2">
          <span className="uppercase tracking-widest opacity-60">Cleared</span>
          <ShardTrack shards={progress.distinctClears} />
        </div>
        {progress.hasSeed && <Chip color="var(--color-ok)" label="Name carved" />}
        {codex && (
          <Chip
            color="var(--color-preset-accent)"
            label={`Codex ${codex.completed}/${codex.total}`}
          />
        )}
        <span className="tabular-nums opacity-70">{ownedCount} owned</span>
      </div>
    </Panel>
  );
}

export function PocketRealmHub() {
  const { address } = useAccount();
  const progress =
    useTutorialProgress(address).data ?? emptyTutorialProgress();
  const inventory = useInventoryCards(address).data ?? [];
  const codex = useCodexStatus(address).status;
  const arcCompleted = progress.starterClears >= 3 || progress.hasSeed;
  // The Altar is browsable the moment the first spark kindles — sparks
  // accumulate visibly across the arc, and the arc-completing clear deep-links
  // here via `/?station=altar`. Eligibility to carve the Name is still gated
  // inside GenesisLedger; this only decides whether the station is reachable.
  const altarOpen = progress.starterClears > 0 || progress.hasSeed;

  // 1 Seed = 1 Ecosystem: once this wallet founds a realm the factory pins it
  // in `ecosystemOf(owner)` (zero until then). A non-zero value means the Seed
  // is spent and `createEcosystem()` would revert — so the Forge (the creation
  // room) has nothing left to do. Mirror the read the /create page gates on.
  const ZERO = "0x0000000000000000000000000000000000000000" as const;
  const foundedQuery = useReadContract({
    address: getAddress("ecosystemFactory"),
    abi: ecosystemFactoryAbi,
    functionName: "ecosystemOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const alreadyFounded = !!foundedQuery.data && foundedQuery.data !== ZERO;

  const [selected, setSelected] = useState<RealmSelection | null>(null);
  const [station, setStation] = useState<Station>("doors");
  const reduced = useReducedMotion();
  const variants = withReducedMotion(warpCrossfade, reduced);

  // Has the player walked the cold-open book yet? A brand-new arrival (no
  // clears, flag unset) reads the book first — a narrow door with no base
  // chrome — then "falls into the book" and wakes into the base. `null` is
  // the SSR-stable hold so the first paint doesn't flash the base before we
  // can read localStorage. Keyed on `starterClears` so a returning mid-walk
  // player skips straight to the base.
  const [coldOpenDone, setColdOpenDone] = useState<boolean | null>(null);
  useEffect(() => {
    setColdOpenDone(
      !(progress.starterClears === 0 && !hasConsumedColdOpen()),
    );
  }, [progress.starterClears]);

  // Land on the right room when a cross-link points here (e.g. the realm
  // dashboard's "back to the market" link → /?station=market). Read from the
  // URL on mount to stay SSR-safe (no useSearchParams Suspense boundary).
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("station");
    if (raw && STATIONS.some((s) => s.id === raw)) {
      setStation(raw as Station);
    }
  }, []);

  // Live station switches from globally-mounted chrome (the floating Codex
  // widget's CTAs) — a same-route <Link> can't re-run the mount-time URL
  // read above, so the widget emits an event alongside it.
  useEffect(
    () =>
      onHubStation((s) => {
        if (!STATIONS.some((st) => st.id === s)) return;
        setSelected(null);
        setStation(s);
      }),
    [],
  );

  // If the active station gets sealed out from under the player — Forge once
  // the realm is founded, or the Altar before the first spark — fall back to
  // the Doors so we never render a station that isn't on the rail.
  useEffect(() => {
    if (alreadyFounded && station === "forge") setStation("doors");
    if (!altarOpen && station === "altar") setStation("doors");
  }, [alreadyFounded, altarOpen, station]);

  // Pre-arc: the world stays small. First the cold-open book (a narrow door
  // with no base chrome); once walked, the player wakes into the base — the
  // same titled hideout as post-arc, but showing the Doors station only. The
  // Market / Forge / Altar rooms stay sealed until the arc completes.
  if (!arcCompleted) {
    if (coldOpenDone === null) {
      // SSR-stable hold — avoids flashing the base before the book.
      return <div aria-label="Loading" className="w-full max-w-2xl" />;
    }
    if (!coldOpenDone) {
      return (
        <section
          aria-label="Cold open"
          className="flex min-h-[calc(100dvh-11rem)] w-full max-w-2xl flex-col justify-center gap-6"
          data-preset="fantasy"
        >
          <ColdOpenBook onWake={() => setColdOpenDone(true)} />
        </section>
      );
    }
    return (
      <div className="flex w-full flex-col gap-5">
        <HideoutHeader
          progress={progress}
          ownedCount={inventory.length}
          codex={codex}
        />
        {selected ? (
          <LoadoutStaging
            selection={selected}
            onBack={() => setSelected(null)}
          />
        ) : (
          <div className="flex w-full flex-col items-center gap-6">
            <RealmSelector onSelectRealm={setSelected} />
            {/* Once the first spark kindles, the Altar surfaces under the picker
                so the player watches their sparks accumulate between descents.
                (The Codex — the journey's map — floats globally as chrome, see
                CodexWidget.) */}
            {progress.starterClears > 0 && <GenesisLedger />}
          </div>
        )}
      </div>
    );
  }

  const stations = STATIONS.filter(
    (s) =>
      (s.id !== "altar" || altarOpen) &&
      // Forge disappears once the realm is founded — the Seed is spent and the
      // creation room can't be re-entered. The Altar stays as a Name trophy.
      (s.id !== "forge" || !alreadyFounded),
  );

  return (
    <div className="flex w-full flex-col gap-5">
      {/* HQ header band + status strip */}
      <HideoutHeader
        progress={progress}
        ownedCount={inventory.length}
        codex={codex}
      />

      {/* Station rail — in-world wayfinding (replaces the top-nav) */}
      <nav
        aria-label="Base stations"
        className="flex flex-wrap items-center gap-2"
      >
        {stations.map((s) => {
          const active = station === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setSelected(null);
                setStation(s.id);
              }}
              aria-current={active ? "true" : undefined}
              className="rounded-full border px-4 py-1.5 font-mono text-xs uppercase tracking-widest transition-all"
              style={{
                borderColor: active
                  ? "var(--color-preset-accent)"
                  : "var(--border-1)",
                background: active ? "var(--surface-2)" : "var(--surface-1)",
                color: active ? "var(--color-preset-accent)" : undefined,
                boxShadow: active
                  ? "0 0 16px -6px var(--glow)"
                  : "none",
                opacity: active ? 1 : 0.7,
              }}
            >
              {s.label}
            </button>
          );
        })}
      </nav>

      {/* Active station — keyed so each switch remounts and replays the
          warp-in. No exit/`mode="wait"`: the outgoing station is dropped at
          once and the new one warps in, so a heavy station's in-flight child
          animations can't stall the swap behind a blocking exit. */}
      <AnimatePresence initial={false}>
        <motion.section
          key={station === "doors" && selected ? "loadout" : station}
          variants={variants}
          initial="enter"
          animate="center"
          className="w-full"
        >
          {station === "doors" &&
            (selected ? (
              <LoadoutStaging
                selection={selected}
                onBack={() => setSelected(null)}
              />
            ) : (
              <div className="flex w-full flex-col items-center gap-6">
                <FeaturedRealm />
                <RealmSelector onSelectRealm={setSelected} />
              </div>
            ))}
          {station === "market" && <BazaarSurface />}
          {station === "altar" && (
            <GenesisLedger onClaimed={() => setStation("forge")} />
          )}
          {station === "forge" && <ForgeRoom />}
        </motion.section>
      </AnimatePresence>
    </div>
  );
}
