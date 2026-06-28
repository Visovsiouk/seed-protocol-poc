"use client";

import { useAccount, useSwitchChain } from "wagmi";
import { activeChain, anvil } from "@/lib/chain";
import { Button } from "@/components/ui";

/**
 * One-click "Add Anvil network" for remote MetaMask users. wagmi's
 * `switchChain` prompts the wallet to add the chain (via
 * `wallet_addEthereumChain`) using the anvil chain's rpcUrls — which now carry
 * the browser-reachable NEXT_PUBLIC_RPC_URL (see lib/chain.ts).
 *
 * Renders nothing unless: the app is running against anvil, a wallet is
 * connected, and that wallet is currently on a different chain. Complements
 * RainbowKit's "Wrong network" → chain modal flow with an explicit affordance.
 */
export function AddNetworkButton() {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();

  if (activeChain.id !== anvil.id) return null;
  if (!isConnected || chainId === anvil.id) return null;

  return (
    <Button
      intent="diegetic"
      size="sm"
      onClick={() => switchChain({ chainId: anvil.id })}
      disabled={isPending}
    >
      {isPending ? "Adding…" : "Add Anvil network"}
    </Button>
  );
}
