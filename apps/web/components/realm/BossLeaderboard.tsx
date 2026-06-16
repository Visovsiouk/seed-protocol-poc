"use client";

/**
 * `<BossLeaderboard/>` — ranked list of clear receipts on a realm.
 *
 * Rank by fewest turns ascending; ties broken by higher remaining HP,
 * then earlier blockNumber. The reader (`fetchRealmStats`) sorts; this
 * component just renders.
 *
 * Works for both starter and creator realms — the parent passes the
 * realm's clearReceipt schemaId (seeded for starters, the row's own id
 * for player realms registered post-c90af90) so clears are counted
 * against the correct schema.
 */

import { useAccount } from "wagmi";
import { useRealmStats } from "@/lib/reads/hooks";
import type { Preset } from "@/lib/engine/types";
import { Panel, Stamp } from "@/components/ui";

function short(addr: `0x${string}`): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function BossLeaderboard({
  realm,
  preset,
  lootSchemaId,
  clearReceiptSchemaId,
}: {
  realm: `0x${string}`;
  preset: Preset;
  lootSchemaId?: bigint;
  clearReceiptSchemaId?: bigint;
}) {
  const { address: connected } = useAccount();
  const stats = useRealmStats({ realm, preset, lootSchemaId, clearReceiptSchemaId });
  const rows = stats.data?.leaderboard ?? [];

  return (
    <Panel
      as="section"
      tone="glass-1"
      aria-label="Boss leaderboard"
      className="flex flex-col gap-3 p-4"
    >
      <header className="flex items-baseline justify-between gap-2">
        <Stamp>Boss leaderboard</Stamp>
        <span className="text-[10px] opacity-65">fewest turns wins</span>
      </header>

      {stats.isLoading ? (
        <p className="text-sm opacity-70">Tallying clears…</p>
      ) : stats.isError ? (
        <p className="text-sm text-[var(--color-danger)]">
          Failed to load leaderboard.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm opacity-70">
          No boss clears yet. Be the first to drop the realm boss.
        </p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {rows.map((r, i) => {
            const isYou =
              connected && r.player.toLowerCase() === connected.toLowerCase();
            return (
              <li
                key={`${r.player}-${r.tokenId}`}
                className="grid grid-cols-[1.25rem_1fr_auto] items-baseline gap-3 text-xs px-2 py-1.5 rounded"
                style={{
                  background: isYou
                    ? "color-mix(in oklab, var(--color-warn) 8%, transparent)"
                    : "var(--surface-2)",
                  border: isYou
                    ? "1px solid color-mix(in oklab, var(--color-warn) 35%, transparent)"
                    : "1px solid transparent",
                }}
              >
                <span className="text-[10px] opacity-65 font-mono">
                  #{i + 1}
                </span>
                <span className="font-mono opacity-90 truncate">
                  {short(r.player)}
                  {isYou && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-[var(--color-warn)]">
                      you
                    </span>
                  )}
                </span>
                <span className="tabular-nums opacity-80 shrink-0">
                  {r.turns} turns · {r.finalHp} HP
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
