"use client";

/**
 * `<MetricsRow/>` — four-cell summary of a realm's lifetime activity.
 *
 * Bound to `useRealmStats({ realm, preset })`. The hook derives all four
 * cells (total mints, loot drops, clear receipts, distinct holders)
 * from a single `AssetMinted` scan so the row and the leaderboard
 * underneath share one cache entry.
 */

import { useRealmStats } from "@/lib/reads/hooks";
import type { Preset } from "@/lib/engine/types";
import type { RealmMetrics } from "@/lib/reads/realm-stats";
import { Panel } from "@/components/ui";

export function MetricsRow({
  realm,
  preset,
  lootSchemaId,
  clearReceiptSchemaId,
}: {
  realm: `0x${string}`;
  preset: Preset | null;
  lootSchemaId?: bigint;
  clearReceiptSchemaId?: bigint;
}) {
  const stats = useRealmStats({ realm, preset, lootSchemaId, clearReceiptSchemaId });
  const m: RealmMetrics = stats.data?.metrics ?? {
    totalMints: 0,
    lootMints: 0,
    clearReceipts: 0,
    distinctHolders: 0,
    distinctClearers: 0,
    firstClearBlock: null,
  };

  return (
    <section
      aria-label="Realm metrics"
      className="grid grid-cols-2 sm:grid-cols-5 gap-3"
    >
      <Cell label="Mints" value={fmt(m.totalMints)} loading={stats.isLoading} />
      <Cell
        label="Loot drops"
        value={fmt(m.lootMints)}
        loading={stats.isLoading}
        muted={preset === null}
      />
      <Cell
        label="Boss clears"
        value={fmt(m.clearReceipts)}
        loading={stats.isLoading}
        muted={preset === null}
      />
      <Cell
        label="Distinct clearers"
        value={fmt(m.distinctClearers)}
        loading={stats.isLoading}
        muted={preset === null}
      />
      <Cell
        label="Distinct holders"
        value={fmt(m.distinctHolders)}
        loading={stats.isLoading}
      />
    </section>
  );
}

function Cell({
  label,
  value,
  loading,
  muted,
}: {
  label: string;
  value: string;
  loading: boolean;
  muted?: boolean;
}) {
  return (
    <Panel
      tone="glass-1"
      className="flex flex-col gap-1 px-3 py-2.5"
      style={{ opacity: muted ? 0.55 : 1 }}
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.28em] opacity-65 text-[var(--color-preset-accent)]">
        {label}
      </span>
      <span className="font-mono text-xl font-medium tabular-nums">
        {loading ? "—" : value}
      </span>
    </Panel>
  );
}

function fmt(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}
