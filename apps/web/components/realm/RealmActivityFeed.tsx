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

function short(addr: `0x${string}`): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function KindBadge({ kind }: { kind: RealmActivityEntry["kind"] }) {
  const map: Record<
    RealmActivityEntry["kind"],
    { label: string; bg: string; fg: string }
  > = {
    loot: {
      label: "Loot",
      bg: "rgba(120,200,255,0.12)",
      fg: "#a8dcff",
    },
    "clear-receipt": {
      label: "Cleared",
      bg: "rgba(255,217,122,0.14)",
      fg: "#ffd97a",
    },
    unknown: {
      label: "Mint",
      bg: "rgba(255,255,255,0.06)",
      fg: "rgba(255,255,255,0.55)",
    },
  };
  const c = map[kind];
  return (
    <span
      className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
      style={{
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.fg}33`,
      }}
    >
      {c.label}
    </span>
  );
}

export function RealmActivityFeed({
  realm,
  preset,
}: {
  realm: `0x${string}`;
  preset: Preset | null;
}) {
  const activity = useRealmActivity({ realm, preset, limit: 8 });

  return (
    <section
      aria-label="Realm activity"
      className="flex flex-col gap-3 p-4 rounded-md"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs uppercase tracking-widest opacity-60">
          Recent activity
        </h3>
        {activity.isFetching && (
          <span className="text-[10px] opacity-50">refreshing…</span>
        )}
      </header>

      {activity.isLoading ? (
        <p className="text-sm opacity-60">Reading mint events…</p>
      ) : activity.isError ? (
        <p className="text-sm" style={{ color: "#ffb38a" }}>
          Failed to load activity. Check the dev server logs.
        </p>
      ) : !activity.data || activity.data.length === 0 ? (
        <p className="text-sm opacity-60">
          No mints on this realm yet. Clear the boss or accept a loot drop to
          populate the feed.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {activity.data.map((e) => (
            <li
              key={`${e.txHash}-${e.logIndex}`}
              className="flex items-baseline justify-between gap-3 text-xs px-2 py-1.5 rounded"
              style={{
                background: "rgba(255,255,255,0.02)",
              }}
            >
              <div className="flex items-baseline gap-2 min-w-0">
                <KindBadge kind={e.kind} />
                <span className="font-mono opacity-80 truncate">
                  {short(e.recipient)}
                </span>
                <span className="opacity-50">
                  · token #{e.tokenId.toString()}
                </span>
              </div>
              <span className="text-[10px] opacity-50 font-mono shrink-0">
                blk {e.blockNumber.toString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
