"use client";

import { useQuery } from "@tanstack/react-query";
import { protocolExchangeAbi } from "@abis/generated";
import { getReadClient } from "@/lib/reads/client";
import { getAddress } from "@/lib/contracts/addresses";
import type { FeeBreakdown } from "@/lib/contracts/exchange";
import { ValueFlowAnimation } from "./ValueFlowAnimation";

/**
 * Post-purchase modal: shows the value-flow animation and the three
 * recipients with their cut. Treasury comes from the exchange's
 * `protocolTreasury()` view; the realm address is the listing's
 * `asset.mintedByRealm`.
 */
export function PurchaseReceipt({
  open,
  onClose,
  fees,
  seller,
  realm,
  txHash,
}: {
  open: boolean;
  onClose: () => void;
  fees: FeeBreakdown;
  seller: `0x${string}`;
  realm: `0x${string}`;
  txHash: `0x${string}`;
}) {
  const treasury = useQuery({
    queryKey: ["exchange-treasury"],
    queryFn: async () => {
      const client = getReadClient();
      return (await client.readContract({
        address: getAddress("protocolExchange"),
        abi: protocolExchangeAbi,
        functionName: "protocolTreasury",
      })) as `0x${string}`;
    },
    staleTime: Infinity,
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl p-6"
        style={{
          background: "#15161b",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">Purchase complete</h2>
          <button
            onClick={onClose}
            className="text-sm opacity-60 hover:opacity-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <p className="mt-1 font-mono text-[11px] opacity-50">
          tx {txHash.slice(0, 10)}…{txHash.slice(-6)}
        </p>

        <div className="mt-6">
          {treasury.data ? (
            <ValueFlowAnimation
              fees={fees}
              seller={seller}
              creator={realm}
              treasury={treasury.data}
            />
          ) : (
            <p className="text-sm opacity-60">Loading recipients…</p>
          )}
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full rounded-md px-4 py-2 text-sm font-medium"
          style={{
            background: "var(--color-preset-accent)",
            color: "var(--color-preset-bg)",
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}
