"use client";

/**
 * `<FeaturedRealm/>` (Phase 5b — "featured realm rotation
 * on /").
 *
 * Picks the most active starter realm (by total mints) and surfaces it
 * as a deep-link banner above the main realm picker. Drives engagement
 * back into the realm with the most live activity for the player —
 * rotates organically as one realm pulls ahead in clears/loot.
 *
 * Falls back to a quiet "nothing seeded yet" message if no starter
 * realm has any mints (fresh chain). Never renders a creator realm —
 * those don't have preset vocabularies wired and would look broken in
 * a "featured" slot.
 */

import Link from "next/link";
import { useMemo } from "react";
import { listStarterRealms } from "@/lib/contracts/starter-realms";
import { useRealmStats } from "@/lib/reads/hooks";
import type { Preset } from "@/lib/engine/types";

function presetLabel(p: Preset): string {
  return p === "fantasy" ? "Fantasy" : p === "scifi" ? "Sci-Fi" : "Cyberpunk";
}

export function FeaturedRealm() {
  const starters = useMemo(() => listStarterRealms(), []);

  // Fixed 3-call fan-out — the starter set is closed at three. Each
  // query is independently cached under `realmStats(realm)`, so the
  // /realm/[address] page reuses the same entry when navigated to.
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

  const rows = [
    { entry: starters[0], stats: fantasy.data },
    { entry: starters[1], stats: scifi.data },
    { entry: starters[2], stats: cyberpunk.data },
  ].filter((r): r is { entry: NonNullable<typeof r.entry>; stats: NonNullable<typeof r.stats> } =>
    !!r.entry && !!r.stats && r.entry.realm !== "0x0000000000000000000000000000000000000000",
  );

  const featured = rows
    .filter((r) => r.stats.metrics.totalMints > 0)
    .sort((a, b) => b.stats.metrics.totalMints - a.stats.metrics.totalMints)[0];

  const isLoading = fantasy.isLoading || scifi.isLoading || cyberpunk.isLoading;

  if (isLoading && !featured) {
    return null;
  }

  if (!featured) {
    // No mints anywhere on chain yet — keep the slot quiet rather than
    // shipping a "be the first" CTA that fights the realm picker right
    // below it.
    return null;
  }

  const { entry, stats } = featured;
  const m = stats.metrics;
  return (
    <section
      aria-label={`Featured realm: ${entry.name}`}
      data-preset={entry.preset}
      className="mb-8 rounded-md p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
      style={{
        background:
          "linear-gradient(135deg, rgba(255,217,122,0.10), rgba(255,255,255,0.02))",
        border: "1px solid rgba(255,217,122,0.35)",
      }}
    >
      <div className="flex flex-col gap-1 min-w-0">
        <span
          className="text-[10px] uppercase tracking-widest"
          style={{ color: "#ffd97a" }}
        >
          Featured realm · {presetLabel(entry.preset)}
        </span>
        <h2 className="text-lg font-semibold truncate">{entry.name}</h2>
        <p className="text-sm opacity-80 leading-relaxed">{entry.tagline}</p>
        <p className="mt-1 text-xs opacity-70 tabular-nums">
          {m.totalMints} mints · {m.clearReceipts} clears · {m.distinctHolders}{" "}
          holders
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href={`/realm/${entry.realm}`}
          className="rounded-md px-3 py-1.5 text-sm transition"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          Dashboard →
        </Link>
        <Link
          href={`/play/${entry.preset}`}
          className="rounded-md px-3 py-1.5 text-sm font-medium transition"
          style={{
            background: "#ffd97a",
            color: "#1a1410",
          }}
        >
          Enter →
        </Link>
      </div>
    </section>
  );
}
