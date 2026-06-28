"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { activeChain, anvil, rpcUrl } from "@/lib/chain";
import { Button, Panel } from "@/components/ui";

/**
 * First-run onboarding banner for the local-anvil real-wallet flow. A brand-new
 * MetaMask user lands on the app with no idea the Anvil network exists, what RPC
 * URL to point at, or what chain ID to use — RainbowKit only surfaces an
 * add/switch affordance AFTER a connection exists. This banner fills that gap:
 * it shows the network details to add manually and a one-click "Add to MetaMask"
 * that calls the injected provider's `wallet_addEthereumChain` directly, so it
 * works BEFORE the user has connected anything.
 *
 * Renders only on the anvil chain and only while the user isn't yet on it
 * (not connected, or connected to a different chain). Once they're on Anvil it
 * unmounts, and AutoFaucet tops their balance to the faucet target on connect.
 */

const HEX_CHAIN_ID = `0x${anvil.id.toString(16)}`;

type InjectedProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

function getInjected(): InjectedProvider | null {
  if (typeof window === "undefined") return null;
  const eth = (window as unknown as { ethereum?: InjectedProvider }).ethereum;
  return eth ?? null;
}

export function AnvilOnboarding() {
  const { isConnected, chainId } = useAccount();
  const [status, setStatus] = useState<"idle" | "adding" | "error">("idle");

  // Only relevant for the local-anvil flow, and only while the wallet isn't
  // already pointed at Anvil.
  if (activeChain.id !== anvil.id) return null;
  if (isConnected && chainId === anvil.id) return null;

  async function addNetwork() {
    const eth = getInjected();
    if (!eth) {
      setStatus("error");
      return;
    }
    setStatus("adding");
    try {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: HEX_CHAIN_ID,
            chainName: anvil.name,
            rpcUrls: [rpcUrl],
            nativeCurrency: anvil.nativeCurrency,
          },
        ],
      });
      setStatus("idle");
    } catch {
      // User rejected, or the chain already exists — either way drop the
      // spinner. The manual table below is the fallback.
      setStatus("idle");
    }
  }

  const hasInjected = getInjected() !== null;

  return (
    <div className="sticky top-0 z-50 mx-auto w-full max-w-3xl px-4 pt-3">
      <Panel tone="glass-2" className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold">Connect to the local Anvil chain</h2>
          <p className="text-xs opacity-80">
            This game runs on a local test chain. Add the network below to your
            wallet, then hit <span className="font-semibold">Connect wallet</span>.
            A fresh account is auto-funded with test ETH on connect.
          </p>
        </div>

        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs font-mono">
          <dt className="opacity-60">Network</dt>
          <dd>{anvil.name}</dd>
          <dt className="opacity-60">RPC URL</dt>
          <dd className="break-all">{rpcUrl}</dd>
          <dt className="opacity-60">Chain ID</dt>
          <dd>{anvil.id}</dd>
          <dt className="opacity-60">Currency</dt>
          <dd>{anvil.nativeCurrency.symbol}</dd>
        </dl>

        {hasInjected ? (
          <div className="flex items-center gap-2">
            <Button
              intent="diegetic"
              size="sm"
              onClick={addNetwork}
              disabled={status === "adding"}
            >
              {status === "adding" ? "Adding…" : "Add Anvil to MetaMask"}
            </Button>
            {status === "error" && (
              <span className="text-xs text-[var(--color-danger)]">
                No injected wallet found — add the network manually.
              </span>
            )}
          </div>
        ) : (
          <p className="text-xs opacity-70">
            No browser wallet detected. Install MetaMask, then add the network
            using the details above.
          </p>
        )}
      </Panel>
    </div>
  );
}
