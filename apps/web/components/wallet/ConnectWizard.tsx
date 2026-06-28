"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { activeChain, anvil, rpcUrl } from "@/lib/chain";
import { Button, Panel, Stamp } from "@/components/ui";
import { BURNER_ACTIVATED_KEY, USER_DISCONNECTED_KEY } from "./DisconnectGuard";

/**
 * Full-screen connect wizard — the FIRST thing an anvil visitor sees, gating the
 * app until they pick a path. It replaces the silent burner auto-connect (the
 * burner connector reports itself authorized on every load; WalletProvider's
 * guarded `isAuthorized` now refuses to reconnect it until this wizard sets the
 * `wallet:burnerActivated` flag — so a fresh visitor lands here, not connected).
 *
 * Two steps:
 *   1. Choose a path: "Play instantly" (in-browser burner, faucet-funded) or
 *      "Use your own wallet" (opens the RainbowKit modal for MetaMask/etc.).
 *   2. (own-wallet only) If the connected wallet isn't on Anvil, add/switch to it.
 *
 * Self-gating: renders null off-anvil, during (re)connect, and once the user is
 * connected on Anvil. Not dismissable — it's an entry gate, not a dialog.
 */

const HEX_CHAIN_ID = `0x${anvil.id.toString(16)}`;
// localStorage key the burner-connector persists its key under — used here only
// to surface whether a returning visitor already has a burner.
const BURNER_PK_KEY = "burnerWallet.pk";

type InjectedProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

function getInjected(): InjectedProvider | null {
  if (typeof window === "undefined") return null;
  const eth = (window as unknown as { ethereum?: InjectedProvider }).ethereum;
  return eth ?? null;
}

export function ConnectWizard() {
  const { status, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending: connectPending } = useConnect();
  const { openConnectModal } = useConnectModal();
  const { switchChain, isPending: switchPending } = useSwitchChain();
  const { disconnect } = useDisconnect();

  // Avoid a hydration mismatch: connection state is client-only.
  const [mounted, setMounted] = useState(false);
  const [addStatus, setAddStatus] = useState<"idle" | "adding" | "error">("idle");
  useEffect(() => setMounted(true), []);

  // Burner only makes sense on the local anvil chain.
  if (activeChain.id !== anvil.id) return null;
  if (!mounted) return null;
  // A (re)connect is in flight — don't flash the wizard at a returning user.
  if (status === "connecting" || status === "reconnecting") return null;
  // Connected and on Anvil → ready to play; let the app render through.
  if (isConnected && chainId === anvil.id) return null;

  const step: "choose" | "network" = isConnected ? "network" : "choose";

  function playInstantly() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(BURNER_ACTIVATED_KEY, "1");
      window.sessionStorage.removeItem(USER_DISCONNECTED_KEY);
    }
    const burner = connectors.find((c) => c.id === "burnerWallet");
    if (burner) connect({ connector: burner });
  }

  async function addAnvilNetwork() {
    const eth = getInjected();
    if (eth) {
      setAddStatus("adding");
      try {
        // MetaMask adds the chain and switches to it in one prompt.
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
        setAddStatus("idle");
        return;
      } catch {
        setAddStatus("idle");
      }
    }
    // No injected provider, or the add was rejected — fall back to wagmi's
    // switch (which adds-then-switches on connectors that support it).
    switchChain({ chainId: anvil.id });
  }

  const hasBurner =
    typeof window !== "undefined" &&
    window.localStorage.getItem(BURNER_PK_KEY) != null;

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Connect to play"
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 backdrop-blur-sm bg-[color-mix(in_oklab,var(--color-preset-accent)_10%,#000_82%)]"
    >
      <Panel
        tone="glass-2"
        glow="accent"
        className="flex w-full max-w-md flex-col gap-5 p-6 bg-[var(--color-preset-bg)]"
      >
        {step === "choose" ? (
          <>
            <div className="flex flex-col gap-2">
              <Stamp tone="accent">Field record · the way in</Stamp>
              <h2 className="font-mono text-xl font-medium tracking-[-0.015em]">
                Pick how you enter the realms
              </h2>
              <p className="text-sm opacity-80">
                This world runs on a local test chain. Start with a throwaway
                in-browser wallet — funded for you, no extension — or bring your
                own.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <Button
                intent="primary"
                size="lg"
                block
                onClick={playInstantly}
                disabled={connectPending}
              >
                {connectPending
                  ? "Opening the door…"
                  : hasBurner
                    ? "Play instantly · resume wallet"
                    : "Play instantly · no extension"}
              </Button>
              <Button
                intent="ghost"
                size="lg"
                block
                onClick={() => openConnectModal?.()}
                disabled={!openConnectModal}
              >
                Use your own wallet
              </Button>
              <p className="text-xs opacity-60">
                On this local chain, use MetaMask, Rabby, Frame, or Brave — any
                wallet that signs locally and can add a custom network.{" "}
                <span className="opacity-90">Rainbow</span> works only as a
                browser extension here; its mobile app (and Coinbase Smart
                Wallet) route through a hosted backend that can&apos;t reach the
                local test chain.
              </p>
            </div>

            <p className="text-xs opacity-60">
              The instant wallet generates a key in your browser, signs locally,
              and is topped up with test ETH on connect.
            </p>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <Stamp tone="accent">Field record · cross over</Stamp>
              <h2 className="font-mono text-xl font-medium tracking-[-0.015em]">
                Add the local Anvil chain
              </h2>
              <p className="text-sm opacity-80">
                Your wallet is connected, but pointed at the wrong network. Add
                and switch to Anvil to step inside. A fresh account is auto-funded
                with test ETH.
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

            <div className="flex flex-col gap-3">
              <Button
                intent="primary"
                size="lg"
                block
                onClick={addAnvilNetwork}
                disabled={addStatus === "adding" || switchPending}
              >
                {addStatus === "adding" || switchPending
                  ? "Adding…"
                  : "Add Anvil & switch"}
              </Button>
              <Button intent="ghost" size="sm" block onClick={() => disconnect()}>
                Use a different wallet
              </Button>
            </div>
          </>
        )}
      </Panel>
    </div>
  );

  return createPortal(overlay, document.body);
}
