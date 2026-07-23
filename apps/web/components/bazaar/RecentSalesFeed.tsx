"use client";

import { useRecentSales } from "@/lib/reads/hooks";
import { formatEth, shortAddress } from "@/lib/utils";
import { Panel, ExplorerLink } from "@/components/ui";

export function RecentSalesFeed() {
  const { data, isLoading } = useRecentSales();
  if (isLoading) return <p className="text-xs opacity-70">Loading sales…</p>;
  if (!data || data.length === 0) {
    return <p className="text-xs opacity-70">No sales in the last 1000 blocks.</p>;
  }
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {data.slice(0, 10).map((s) => (
        <Panel
          as="li"
          tone="glass-2"
          key={s.txHash}
          className="flex items-center justify-between rounded-md px-3 py-2"
        >
          <span className="font-mono text-xs opacity-70">
            #{s.listingId.toString()}
          </span>
          <span className="opacity-80">
            <ExplorerLink type="address" value={s.buyer}>
              {shortAddress(s.buyer)}
            </ExplorerLink>{" "}
            bought for <strong>{formatEth(s.price)} ETH</strong>
          </span>
          <ExplorerLink
            type="tx"
            value={s.txHash}
            title="View transaction"
            className="font-mono text-[10px] opacity-65"
          >
            blk {s.blockNumber.toString()}
          </ExplorerLink>
        </Panel>
      ))}
    </ul>
  );
}
