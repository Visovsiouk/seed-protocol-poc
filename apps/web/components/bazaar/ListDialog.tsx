"use client";

import { useState, useMemo } from "react";
import { useAccount } from "wagmi";
import { parseEther } from "viem";
import { useInventory } from "@/lib/reads/hooks";
import { useList } from "@/lib/contracts/exchange";
import { fetchAssetSummary } from "@/lib/reads/provenance";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/reads/cache";

/**
 * Modal that lets the connected wallet pick a held asset and create a
 * listing on the Protocol Exchange. Auto-approves the exchange on first use
 * (`useList` checks `isApprovedForAll` and only sends
 * `setApprovalForAll(true)` when needed).
 */
export function ListDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { address } = useAccount();
  const inventory = useInventory(address);
  const [selectedTokenId, setSelectedTokenId] = useState<bigint | null>(null);
  const [amount, setAmount] = useState("1");
  const [priceEth, setPriceEth] = useState("0.01");
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "submitting" }
    | { kind: "success"; listingId: bigint; txHash: `0x${string}` }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const { list, isPending } = useList();

  const selected = useMemo(
    () =>
      selectedTokenId
        ? inventory.data?.find((e) => e.tokenId === selectedTokenId)
        : undefined,
    [inventory.data, selectedTokenId],
  );

  if (!open) return null;

  const onSubmit = async () => {
    if (!selectedTokenId || !selected) return;
    let parsedAmount: bigint;
    let parsedPrice: bigint;
    try {
      parsedAmount = BigInt(amount);
      parsedPrice = parseEther(priceEth as `${number}`);
    } catch {
      setStatus({ kind: "error", message: "Invalid amount or price" });
      return;
    }
    if (parsedAmount <= 0n || parsedAmount > selected.balance) {
      setStatus({
        kind: "error",
        message: `Amount must be between 1 and ${selected.balance}`,
      });
      return;
    }
    if (parsedPrice <= 0n) {
      setStatus({ kind: "error", message: "Price must be > 0" });
      return;
    }
    setStatus({ kind: "submitting" });
    try {
      const result = await list({
        tokenId: selectedTokenId,
        amount: parsedAmount,
        price: parsedPrice,
      });
      setStatus({
        kind: "success",
        listingId: result.listingId,
        txHash: result.txHash,
      });
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  };

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
          <h2 className="text-lg font-semibold">List an asset</h2>
          <button
            onClick={onClose}
            className="text-sm opacity-60 hover:opacity-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {!address ? (
          <p className="mt-4 text-sm opacity-70">
            Connect a wallet to list from inventory.
          </p>
        ) : inventory.isLoading ? (
          <p className="mt-4 text-sm opacity-70">Loading inventory…</p>
        ) : !inventory.data || inventory.data.length === 0 ? (
          <p className="mt-4 text-sm opacity-70">
            No assets held by this wallet. Mint or trade some first.
          </p>
        ) : (
          <>
            <label className="mt-4 block text-xs uppercase tracking-wide opacity-60">
              Token
            </label>
            <div className="mt-1 flex flex-col gap-1 max-h-48 overflow-y-auto">
              {inventory.data.map((entry) => (
                <InventoryRow
                  key={entry.tokenId.toString()}
                  tokenId={entry.tokenId}
                  balance={entry.balance}
                  selected={selectedTokenId === entry.tokenId}
                  onSelect={() => {
                    setSelectedTokenId(entry.tokenId);
                    setStatus({ kind: "idle" });
                  }}
                />
              ))}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs uppercase tracking-wide opacity-60">
                  Amount
                </label>
                <input
                  type="number"
                  min="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={!selectedTokenId}
                  className="mt-1 w-full rounded-md bg-black/30 px-3 py-2 text-sm"
                  style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                />
                {selected && (
                  <p className="mt-1 text-[10px] opacity-50">
                    held: {selected.balance.toString()}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wide opacity-60">
                  Total price (ETH)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={priceEth}
                  onChange={(e) => setPriceEth(e.target.value)}
                  disabled={!selectedTokenId}
                  className="mt-1 w-full rounded-md bg-black/30 px-3 py-2 text-sm"
                  style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-md px-4 py-2 text-sm"
                style={{ border: "1px solid rgba(255,255,255,0.15)" }}
              >
                Cancel
              </button>
              <button
                onClick={onSubmit}
                disabled={
                  !selectedTokenId ||
                  isPending ||
                  status.kind === "submitting"
                }
                className="rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
                style={{
                  background: "var(--color-preset-accent)",
                  color: "var(--color-preset-bg)",
                }}
              >
                {status.kind === "submitting" ? "Listing…" : "List"}
              </button>
            </div>

            {status.kind === "error" && (
              <p
                className="mt-3 text-xs"
                style={{ color: "#ff7a7a" }}
              >
                {status.message}
              </p>
            )}
            {status.kind === "success" && (
              <p className="mt-3 text-xs" style={{ color: "#7ad6a0" }}>
                Listed as #{status.listingId.toString()} —{" "}
                {status.txHash.slice(0, 10)}…
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function InventoryRow({
  tokenId,
  balance,
  selected,
  onSelect,
}: {
  tokenId: bigint;
  balance: bigint;
  selected: boolean;
  onSelect: () => void;
}) {
  // Cached via the same query key as provenance; if another component
  // already loaded this asset, the read is free.
  const asset = useQuery({
    queryKey: queryKeys.attrs(tokenId),
    queryFn: () => fetchAssetSummary(tokenId),
    staleTime: 60_000,
  });

  return (
    <button
      onClick={onSelect}
      className="flex items-center justify-between rounded-md px-3 py-2 text-left text-sm"
      style={{
        background: selected
          ? "rgba(124,92,255,0.15)"
          : "rgba(255,255,255,0.03)",
        border: selected
          ? "1px solid rgba(124,92,255,0.4)"
          : "1px solid transparent",
      }}
    >
      <span className="font-mono">#{tokenId.toString()}</span>
      <span className="flex items-center gap-2 text-xs opacity-70">
        {asset.data ? (
          <span>
            T{asset.data.tier} · schema {asset.data.schemaId}
          </span>
        ) : (
          <span className="opacity-50">…</span>
        )}
        <span>× {balance.toString()}</span>
      </span>
    </button>
  );
}

