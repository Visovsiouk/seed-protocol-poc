"use client";

/**
 * `<BossLeaderboard/>` — ranked list of clear receipts on a realm.
 *
 * Rank by fewest turns ascending; ties broken by higher remaining HP,
 * then earlier blockNumber. The reader (`fetchRealmStats`) sorts; this
 * component just renders.
 *
 * Only meaningful for starter realms (creator realms have no seeded
 * clearReceipt schemaId, so the leaderboard would always be empty).
 * The parent gates rendering accordingly.
 */

import { useAccount } from "wagmi";
import { useRealmStats } from "@/lib/reads/hooks";
import type { Preset } from "@/lib/engine/types";
import { LedgerStamp } from "@/components/ledger/Ledger";

function short(addr: `0x${string}`): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function BossLeaderboard({
  realm,
  preset,
}: {
  realm: `0x${string}`;
  preset: Preset;
}) {
  const { address: connected } = useAccount();
  const stats = useRealmStats({ realm, preset });
  const rows = stats.data?.leaderboard ?? [];

  return (
    <section
      aria-label="Boss leaderboard"
      className="flex flex-col gap-3 p-4 rounded-md"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <header className="flex items-baseline justify-between gap-2">
        <LedgerStamp>Boss leaderboard</LedgerStamp>
        <span className="text-[10px] opacity-50">fewest turns wins</span>
      </header>

      {stats.isLoading ? (
        <p className="text-sm opacity-60">Tallying clears…</p>
      ) : stats.isError ? (
        <p className="text-sm" style={{ color: "#ffb38a" }}>
          Failed to load leaderboard.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm opacity-60">
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
                    ? "rgba(255,217,122,0.08)"
                    : "rgba(255,255,255,0.02)",
                  border: isYou
                    ? "1px solid rgba(255,217,122,0.35)"
                    : "1px solid transparent",
                }}
              >
                <span className="text-[10px] opacity-50 font-mono">
                  #{i + 1}
                </span>
                <span className="font-mono opacity-90 truncate">
                  {short(r.player)}
                  {isYou && (
                    <span
                      className="ml-2 text-[10px] uppercase tracking-wider"
                      style={{ color: "#ffd97a" }}
                    >
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
    </section>
  );
}
