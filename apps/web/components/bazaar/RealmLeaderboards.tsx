"use client";

/**
 * `<RealmLeaderboards/>` (Phase 5b — "realm leaderboards
 * on /bazaar").
 *
 * Ranks the three starter realms by total mints to give buyers a
 * quick provenance signal — which realms are the most actively
 * producing the assets they're considering. Each row deep-links to
 * the realm dashboard for the full metrics + leaderboard breakdown.
 *
 * Three fixed `useRealmStats` calls (one per starter); the same
 * cache entries power `<FeaturedRealm/>` on `/` and the metrics row
 * on `/realm/[address]`.
 */

import Link from "next/link";
import { useMemo } from "react";
import { listStarterRealms } from "@/lib/contracts/starter-realms";
import { useRealmStats } from "@/lib/reads/hooks";
import type { Preset } from "@/lib/engine/types";

function presetLabel(p: Preset): string {
  return p === "fantasy" ? "Fantasy" : p === "scifi" ? "Sci-Fi" : "Cyberpunk";
}

export function RealmLeaderboards() {
  const starters = useMemo(() => listStarterRealms(), []);

  const fantasy = useRealmStats({
    realm: starters[0]?.realm ?? null,
    preset: starters[0]?.preset ?? null,
  });
  const scifi = useRealmStats({
    realm: starters[1]?.realm ?? null,
    preset: starters[1]?.preset ?? null,
  });
  const cyberpunk = useRealmStats({
    realm: starters[2]?.realm ?? null,
    preset: starters[2]?.preset ?? null,
  });

  const isLoading =
    fantasy.isLoading || scifi.isLoading || cyberpunk.isLoading;

  const rows = [
    { entry: starters[0], stats: fantasy.data },
    { entry: starters[1], stats: scifi.data },
    { entry: starters[2], stats: cyberpunk.data },
  ]
    .filter(
      (r): r is {
        entry: NonNullable<typeof r.entry>;
        stats: NonNullable<typeof r.stats>;
      } =>
        !!r.entry &&
        !!r.stats &&
        r.entry.realm !== "0x0000000000000000000000000000000000000000",
    )
    .sort((a, b) => b.stats.metrics.totalMints - a.stats.metrics.totalMints);

  return (
    <section
      aria-label="Realm leaderboards"
      className="flex flex-col gap-3 p-4 rounded-md"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs uppercase tracking-widest opacity-60">
          Realm leaderboards
        </h3>
        <span className="text-[10px] opacity-50">ranked by mints</span>
      </header>

      {isLoading && rows.every((r) => r.stats.metrics.totalMints === 0) ? (
        <p className="text-sm opacity-60">Tallying realm activity…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm opacity-60">No starter realms deployed yet.</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {rows.map((r, i) => (
            <li
              key={r.entry.realm}
              className="grid grid-cols-[1.25rem_1fr_auto] items-baseline gap-3 text-xs px-2 py-1.5 rounded"
              style={{ background: "rgba(255,255,255,0.02)" }}
            >
              <span className="text-[10px] opacity-50 font-mono">
                #{i + 1}
              </span>
              <Link
                href={`/realm/${r.entry.realm}`}
                className="truncate hover:underline"
              >
                <span className="font-medium">{r.entry.name}</span>
                <span className="ml-2 opacity-50">
                  {presetLabel(r.entry.preset)}
                </span>
              </Link>
              <span className="tabular-nums opacity-80 shrink-0">
                {r.stats.metrics.totalMints} mints ·{" "}
                {r.stats.metrics.clearReceipts} clears
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
