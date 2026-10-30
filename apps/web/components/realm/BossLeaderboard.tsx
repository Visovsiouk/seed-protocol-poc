"use client";

/**
 * `<BossLeaderboard/>` — the page's own record of everyone who has been down
 * it, ranked by clear receipt.
 *
 * Rank by fewest turns ascending; ties broken by higher remaining HP,
 * then earlier blockNumber. The reader (`fetchRealmStats`) sorts; this
 * component just renders.
 *
 * ── Why the copy matters here ──────────────────────────────────────────────
 * Every row is a different living borrower, their address, how long the fight
 * took them and how much blood they had left — minted on-chain and permanent.
 * It is the most direct evidence in the game that other people are reading the
 * same book, and it shipped labelled as a scoreboard with a tiebreak rule.
 * Named as what it is, it does the job the margins do for the dead: somebody
 * will read your line.
 *
 * Works for both starter and creator realms — the parent passes the
 * realm's clearReceipt schemaId (seeded for starters, the row's own id
 * for player realms registered post-c90af90) so clears are counted
 * against the correct schema.
 */

import { useAccount } from "wagmi";
import { useRealmStats } from "@/lib/reads/hooks";
import type { Preset } from "@/lib/engine/types";
import { Panel, Stamp, ExplorerLink } from "@/components/ui";

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
      <header className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <Stamp>Every hand down this page</Stamp>
          <span className="text-[10px] opacity-65">fewest turns first</span>
        </div>
        <p className="text-[11px] leading-relaxed opacity-65">
          The page keeps this, and it does not forget. Whoever comes next reads
          your line the way you read the margins.
        </p>
      </header>

      {stats.isLoading ? (
        <p className="text-sm opacity-70">Counting the hands…</p>
      ) : stats.isError ? (
        <p className="text-sm text-[var(--color-danger)]">
          Failed to load the record.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm opacity-70">
          Nobody has torn this bookmark out yet. Yours would be the first line
          on it.
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
                  <ExplorerLink type="address" value={r.player}>
                    {short(r.player)}
                  </ExplorerLink>
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
