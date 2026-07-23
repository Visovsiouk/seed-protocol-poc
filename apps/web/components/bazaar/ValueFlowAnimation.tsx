"use client";

import { formatEth, shortAddress } from "@/lib/utils";
import type { FeeBreakdown } from "@/lib/contracts/exchange";
import { ExplorerLink } from "@/components/ui";

/**
 * The signature "where does the value go" animation.
 * Renders three streams flowing out of the buyer's payment: seller, creator
 * (realm that minted the asset), treasury. Percentages are derived live from
 * the FeeBreakdown so they stay in sync if the on-chain constants ever change.
 *
 * Pure CSS keyframes — no third-party animation lib needed.
 */
export function ValueFlowAnimation({
  fees,
  seller,
  creator,
  treasury,
}: {
  fees: FeeBreakdown;
  seller: `0x${string}`;
  creator: `0x${string}`;
  treasury: `0x${string}`;
}) {
  const sellerPct = pct(fees.seller, fees.total);
  const creatorPct = pct(fees.creator, fees.total);
  const treasuryPct = pct(fees.treasury, fees.total);

  return (
    <div className="flex flex-col gap-4">
      <div className="text-center text-sm opacity-70">
        {formatEth(fees.total)} ETH paid
      </div>

      <div className="relative h-24 overflow-hidden rounded-md bg-[var(--surface-2)]">
        <Stream delayMs={0} colorVar="var(--color-ok)" />
        <Stream delayMs={250} colorVar="var(--color-preset-accent)" />
        <Stream delayMs={500} colorVar="var(--color-warn)" />
      </div>

      <FlowRow
        label="Seller"
        addr={seller}
        amount={fees.seller}
        pct={sellerPct}
        color="var(--color-ok)"
      />
      <FlowRow
        label="Creator (realm)"
        addr={creator}
        amount={fees.creator}
        pct={creatorPct}
        color="var(--color-preset-accent)"
      />
      <FlowRow
        label="Treasury"
        addr={treasury}
        amount={fees.treasury}
        pct={treasuryPct}
        color="var(--color-warn)"
      />

      <style jsx>{`
        @keyframes flow {
          0% {
            transform: translateX(-30%);
            opacity: 0;
          }
          15% {
            opacity: 1;
          }
          85% {
            opacity: 1;
          }
          100% {
            transform: translateX(130%);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}

function Stream({ delayMs, colorVar }: { delayMs: number; colorVar: string }) {
  return (
    <span
      aria-hidden
      className="absolute top-1/2 h-1 w-24 -translate-y-1/2 rounded-full"
      style={{
        background: `linear-gradient(90deg, transparent, ${colorVar}, transparent)`,
        animation: `flow 2.2s ${delayMs}ms ease-in-out infinite`,
      }}
    />
  );
}

function FlowRow({
  label,
  addr,
  amount,
  pct,
  color,
}: {
  label: string;
  addr: `0x${string}`;
  amount: bigint;
  pct: string;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: color }}
        />
        <span>{label}</span>
        <ExplorerLink
          type="address"
          value={addr}
          className="font-mono text-xs opacity-65"
        >
          {shortAddress(addr)}
        </ExplorerLink>
      </div>
      <div className="text-right">
        <span className="font-semibold">{formatEth(amount)} ETH</span>
        <span className="ml-2 text-xs opacity-65">{pct}%</span>
      </div>
    </div>
  );
}

function pct(part: bigint, total: bigint): string {
  if (total === 0n) return "0";
  // Two-decimal precision via integer math — bigint has no float.
  const x = Number((part * 10000n) / total) / 100;
  return x.toFixed(x < 10 ? 2 : 1);
}
