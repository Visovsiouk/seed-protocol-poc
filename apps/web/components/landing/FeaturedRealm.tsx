"use client";

/**
 * `<FeaturedRealm/>` (Phase 5b — "featured realm rotation
 * on /").
 *
 * Spotlights player-made realms — never a premade starter. Starters are
 * the same fixed three for every player; there's nothing to "feature"
 * about them. Instead this surfaces the most-active and least-active
 * creator realm (by total mints), so a hot realm and a quiet underdog
 * both get a deep-link above the picker. With only one player realm
 * registered, most/least collapse to the same realm and only one card
 * renders. With none registered yet, the slot stays quiet.
 */

import Link from "next/link";
import { useMemo } from "react";
import { usePlayerRealms, type PlayerRealmMeta } from "@/lib/reads/hooks";
import type { Preset } from "@/lib/engine/types";
import { Panel, Button, Stamp } from "@/components/ui";

function presetLabel(p: Preset): string {
  return p === "fantasy" ? "Fantasy" : p === "scifi" ? "Sci-Fi" : "Cyberpunk";
}

function FeaturedCard({ meta, label }: { meta: PlayerRealmMeta; label: string }) {
  const accentOverride = meta.accent
    ? ({ "--color-preset-accent": meta.accent } as React.CSSProperties)
    : undefined;
  return (
    <Panel
      as="section"
      tone="glass-2"
      glow="accent"
      aria-label={`Featured realm: ${meta.name}`}
      data-preset={meta.preset}
      style={accentOverride}
      className="p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
    >
      <div className="flex flex-col gap-1 min-w-0">
        <Stamp>
          {label} · {presetLabel(meta.preset)}
        </Stamp>
        <h2 className="text-lg font-semibold truncate">{meta.name}</h2>
        <p className="text-sm opacity-80 leading-relaxed">
          Creator realm · final boss <code>{meta.bossId}</code> · tier{" "}
          <strong>T{meta.maxTier}</strong>
        </p>
        <p className="mt-1 text-xs opacity-70 tabular-nums">
          {meta.totalMints} mints · {meta.distinctClearers} clearers
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link href={`/realm/${meta.address}`}>
          <Button intent="ghost" size="sm">
            Dashboard →
          </Button>
        </Link>
        <Link href={`/play/realm/${meta.address}`}>
          <Button intent="primary" size="sm">
            Enter →
          </Button>
        </Link>
      </div>
    </Panel>
  );
}

export function FeaturedRealm() {
  const playerRealms = usePlayerRealms();

  const { mostPopular, leastPopular } = useMemo(() => {
    const rows = Array.from(playerRealms.data?.values() ?? []);
    if (rows.length === 0) return { mostPopular: null, leastPopular: null };
    let most = rows[0]!;
    let least = rows[0]!;
    for (const r of rows) {
      if (r.totalMints > most.totalMints) most = r;
      if (r.totalMints < least.totalMints) least = r;
    }
    return { mostPopular: most, leastPopular: least };
  }, [playerRealms.data]);

  if (playerRealms.isLoading && !mostPopular) {
    return null;
  }

  if (!mostPopular) {
    // No player realms registered yet — keep the slot quiet rather than
    // shipping a "be the first" CTA that fights the realm picker right
    // below it.
    return null;
  }

  const sameRealm = leastPopular === null || leastPopular.address === mostPopular.address;

  return (
    <div className={sameRealm ? "w-full" : "grid w-full gap-4 sm:grid-cols-2"}>
      <FeaturedCard meta={mostPopular} label="Most active" />
      {!sameRealm && leastPopular && (
        <FeaturedCard meta={leastPopular} label="Least active" />
      )}
    </div>
  );
}
