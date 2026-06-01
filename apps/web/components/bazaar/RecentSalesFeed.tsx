"use client";

import { useRecentSales } from "@/lib/reads/hooks";
import { formatEth, shortAddress } from "@/lib/utils";

export function RecentSalesFeed() {
  const { data, isLoading } = useRecentSales();
  if (isLoading) return <p className="text-xs opacity-60">Loading sales…</p>;
  if (!data || data.length === 0) {
    return <p className="text-xs opacity-60">No sales in the last 1000 blocks.</p>;
  }
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {data.slice(0, 10).map((s) => (
        <li
          key={s.txHash}
          className="flex items-center justify-between rounded-md px-3 py-2 bg-[var(--surface-2)]"
        >
          <span className="font-mono text-xs opacity-70">
            #{s.listingId.toString()}
          </span>
          <span className="opacity-80">
            {shortAddress(s.buyer)} bought for{" "}
            <strong>{formatEth(s.price)} ETH</strong>
          </span>
          <span className="font-mono text-[10px] opacity-50">
            blk {s.blockNumber.toString()}
          </span>
        </li>
      ))}
    </ul>
  );
}
