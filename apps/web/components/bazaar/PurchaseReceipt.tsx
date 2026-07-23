"use client";

import type { FeeBreakdown } from "@/lib/contracts/exchange";
import { Dialog, Button, ExplorerLink } from "@/components/ui";
import { ValueFlowAnimation } from "./ValueFlowAnimation";

/**
 * Post-purchase modal: shows the value-flow animation and the three
 * recipients with their cut. `treasury` is pre-fetched by the parent
 * `ListingCard` on mount so the animation renders without a loading flash.
 */
export function PurchaseReceipt({
  open,
  onClose,
  fees,
  seller,
  realm,
  txHash,
  treasury,
}: {
  open: boolean;
  onClose: () => void;
  fees: FeeBreakdown;
  seller: `0x${string}`;
  realm: `0x${string}`;
  txHash: `0x${string}`;
  treasury: `0x${string}` | undefined;
}) {
  return (
    <Dialog open={open} onClose={onClose} label="Purchase complete">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-lg font-semibold">Purchase complete</h2>
        <button
          onClick={onClose}
          className="text-sm opacity-70 hover:opacity-100"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <p className="mt-1">
        <ExplorerLink
          type="tx"
          value={txHash}
          className="font-mono text-[11px] opacity-65"
        >
          tx {txHash.slice(0, 10)}…{txHash.slice(-6)}
        </ExplorerLink>
      </p>

      {/* Fixed height so the modal doesn't jump when treasury arrives */}
      <div className="mt-6" style={{ minHeight: 160 }}>
        {treasury ? (
          <ValueFlowAnimation
            fees={fees}
            seller={seller}
            creator={realm}
            treasury={treasury}
          />
        ) : (
          <div className="flex h-40 items-center justify-center">
            <span className="text-sm opacity-60">Loading recipients…</span>
          </div>
        )}
      </div>

      <Button intent="primary" block onClick={onClose} className="mt-6">
        Done
      </Button>
    </Dialog>
  );
}
