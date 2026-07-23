"use client";

/**
 * `<RealmActivityFeed/>` — recent mints on a single realm clone.
 *
 * Bound to `useRealmActivity({ realm, preset })`, which scans the
 * realm's `AssetMinted` events and tags each as `loot | clear-receipt
 * | unknown` using the seeded per-preset schema IDs. Renders a compact
 * row per event with the kind, truncated recipient, and block number.
 *
 * Read-only and intentionally minimal — no per-row tokenId fetch
 * beyond the schema discrimination already done in the reader.
 */

import { useRealmActivity } from "@/lib/reads/hooks";
import type { Preset } from "@/lib/engine/types";
import type { RealmActivityEntry } from "@/lib/reads/realm-activity";
import { Panel, Chip, Stamp, ExplorerLink } from "@/components/ui";

function short(addr: `0x${string}`): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Render a keccak-derived `bigint` tokenId as a short hex tag. The raw
 * decimal form is a 70+ digit uint256 that overflows the row and reads
 * as a wall of noise; hex-shortened (`#0xABCD…1234`) it matches the
 * recipient address shortening and parses at a glance.
 */
function shortTokenId(id: bigint): string {
  const hex = id.toString(16).padStart(64, "0");
  return `#0x${hex.slice(0, 4)}…${hex.slice(-4)}`;
}

function KindBadge({ kind }: { kind: RealmActivityEntry["kind"] }) {
  const map: Record<
    RealmActivityEntry["kind"],
    { label: string; color: string }
  > = {
    loot: { label: "Loot", color: "#7cc7ff" },
    "clear-receipt": { label: "Cleared", color: "var(--color-warn)" },
    unknown: { label: "Mint", color: "var(--color-preset-fg)" },
  };
  const c = map[kind];
  return <Chip color={c.color} label={c.label} />;
}

export function RealmActivityFeed({
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
  const activity = useRealmActivity({
    realm,
    preset,
    lootSchemaId,
    clearReceiptSchemaId,
    limit: 8,
  });

  return (
    <Panel
      as="section"
      tone="glass-1"
      aria-label="Realm activity"
      className="flex flex-col gap-3 p-4"
    >
      <header className="flex items-baseline justify-between gap-2">
        <Stamp>Recent activity</Stamp>
        {activity.isFetching && (
          <span className="text-[10px] opacity-65">refreshing…</span>
        )}
      </header>

      {activity.isLoading ? (
        <p className="text-sm opacity-70">Reading mint events…</p>
      ) : activity.isError ? (
        <p className="text-sm text-[var(--color-danger)]">
          Failed to load activity. Check the dev server logs.
        </p>
      ) : !activity.data || activity.data.length === 0 ? (
        <p className="text-sm opacity-70">
          No mints on this realm yet. Clear the boss or accept a loot drop to
          populate the feed.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {activity.data.map((e) => (
            <Panel
              as="li"
              tone="glass-2"
              key={`${e.txHash}-${e.logIndex}`}
              className="flex items-baseline justify-between gap-3 text-xs px-2 py-1.5 rounded"
            >
              <div className="flex items-baseline gap-2 min-w-0">
                <KindBadge kind={e.kind} />
                <ExplorerLink
                  type="address"
                  value={e.recipient}
                  className="font-mono opacity-80 shrink-0"
                >
                  {short(e.recipient)}
                </ExplorerLink>
                <span className="font-mono opacity-65 truncate min-w-0">
                  · token {shortTokenId(e.tokenId)}
                </span>
              </div>
              <ExplorerLink
                type="tx"
                value={e.txHash}
                title="View transaction"
                className="text-[10px] opacity-65 font-mono shrink-0"
              >
                blk {e.blockNumber.toString()}
              </ExplorerLink>
            </Panel>
          ))}
        </ul>
      )}
    </Panel>
  );
}
