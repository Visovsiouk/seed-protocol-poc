"use client";

import { createPortal } from "react-dom";
import type { FeeBreakdown } from "@/lib/contracts/exchange";
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
  if (!open) return null;

  return createPortal(
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
              <span className="text-sm opacity-40">Loading recipients…</span>
            </div>
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
    </div>,
    document.body,
  );
}
