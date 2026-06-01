"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { parseEther } from "viem";
import { useInventoryCards } from "@/lib/reads/hooks";
import { useList } from "@/lib/contracts/exchange";
import { AssetCard } from "@/components/inventory/AssetCard";
import { Dialog, Button } from "@/components/ui";

/**
 * Modal that lets the connected wallet pick a held asset and create a
 * listing on the Protocol Exchange. Auto-approves the exchange on first use
 * (`useList` checks `isApprovedForAll` and only sends
 * `setApprovalForAll(true)` when needed).
 *
 * Picker styling mirrors `<InventoryDrawer/>` — same `<AssetCard compact/>`
 * grid rather than a custom token-id row, so listing feels like equipping.
 * Single-edition (1155 amount = 1) loot is the only thing the engine mints,
 * so the explicit "Amount" input is gone; the list call always asks for 1.
 */
export function ListDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { address } = useAccount();
  const inventory = useInventoryCards(address);
  const [selectedTokenId, setSelectedTokenId] = useState<bigint | null>(null);
  const [priceEth, setPriceEth] = useState("0.01");
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "submitting" }
    | { kind: "success"; listingId: bigint; txHash: `0x${string}` }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const { list, isPending } = useList();

  const weapons = useMemo(
    () => inventory.data?.filter((c) => c.slot === "weapon") ?? [],
    [inventory.data],
  );
  const armors = useMemo(
    () => inventory.data?.filter((c) => c.slot === "armor") ?? [],
    [inventory.data],
  );

  const onSubmit = async () => {
    if (!selectedTokenId) return;
    let parsedPrice: bigint;
    try {
      parsedPrice = parseEther(priceEth as `${number}`);
    } catch {
      setStatus({ kind: "error", message: "Invalid price" });
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
        amount: 1n,
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

  const empty =
    inventory.data !== undefined &&
    weapons.length === 0 &&
    armors.length === 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      label="List an asset"
      size="lg"
      className="max-h-[90vh] overflow-y-auto flex flex-col gap-4"
    >
      <header className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-lg font-semibold">List an asset</h2>
            <p className="text-xs opacity-60">
              Pick a piece from your inventory, set a price.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-sm opacity-60 hover:opacity-100"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        {!address ? (
          <p className="text-sm opacity-70">
            Connect a wallet to list from inventory.
          </p>
        ) : inventory.isLoading ? (
          <p className="text-sm opacity-70">Loading inventory…</p>
        ) : empty ? (
          <p className="text-sm opacity-70">
            No assets held by this wallet. Mint or trade some first.
          </p>
        ) : (
          <>
            <InventorySection
              label="Weapons"
              cards={weapons}
              selectedTokenId={selectedTokenId}
              onSelect={(id) => {
                setSelectedTokenId(id);
                setStatus({ kind: "idle" });
              }}
            />
            <InventorySection
              label="Armor"
              cards={armors}
              selectedTokenId={selectedTokenId}
              onSelect={(id) => {
                setSelectedTokenId(id);
                setStatus({ kind: "idle" });
              }}
            />

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
                className="mt-1 w-full rounded-md bg-black/30 px-3 py-2 text-sm disabled:opacity-50 border border-[var(--border-1)]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button intent="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                intent="primary"
                onClick={onSubmit}
                disabled={
                  !selectedTokenId ||
                  isPending ||
                  status.kind === "submitting"
                }
              >
                {status.kind === "submitting" ? "Listing…" : "List"}
              </Button>
            </div>

            {status.kind === "error" && (
              <p className="text-xs text-[var(--color-danger)]">
                {status.message}
              </p>
            )}
            {status.kind === "success" && (
              <p className="text-xs text-[var(--color-ok)]">
                Listed as #{status.listingId.toString()} —{" "}
                {status.txHash.slice(0, 10)}…
              </p>
            )}
          </>
        )}
    </Dialog>
  );
}

function InventorySection({
  label,
  cards,
  selectedTokenId,
  onSelect,
}: {
  label: string;
  cards: readonly import("@/lib/engine/types").AssetCard[];
  selectedTokenId: bigint | null;
  onSelect: (tokenId: bigint) => void;
}) {
  if (cards.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-xs uppercase tracking-wider opacity-50">{label}</h4>
      <div className="grid gap-2">
        {cards.map((c) => (
          <AssetCard
            key={c.tokenId.toString()}
            card={c}
            compact
            selected={c.tokenId === selectedTokenId}
            onClick={() => onSelect(c.tokenId)}
          />
        ))}
      </div>
    </div>
  );
}
