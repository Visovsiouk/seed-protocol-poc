"use client";

import type { ReactNode } from "react";
import { WagmiProvider, http } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import {
  RainbowKitProvider,
  darkTheme,
  getDefaultConfig,
} from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  injectedWallet,
  coinbaseWallet,
  rainbowWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { activeChain, anvil, rpcUrl } from "@/lib/chain";

/**
 * Wagmi + RainbowKit wrapper. QueryClientProvider is one layer up in
 * app/providers.tsx so reads work even before this module's wagmi context
 * is in scope.
 *
 * Wallet list is registered through RainbowKit's `getDefaultConfig` — bare
 * wagmi connectors don't surface in the RK modal otherwise. MetaMask sits
 * at the top because that's what the local-dev flow uses; Coinbase Smart
 * Wallet remains for base-sepolia paymaster work. `injectedWallet` catches
 * Rabby / Frame / Brave Wallet etc.
 *
 * WalletConnect is intentionally NOT included — its universal-provider
 * touches `indexedDB` at module-eval time and crashes Next.js SSR. Re-add
 * via the `cookieStorage` + `cookieToInitialState` pattern once we ship to
 * base-sepolia and need mobile QR pairing.
 */
const wagmiConfig = getDefaultConfig({
  appName: "Realms — Seed Protocol PoC",
  // projectId is only required when WalletConnect is enabled; pass a stub
  // so the type-check passes. Replace with the real env var once WC is back.
  projectId: "realms-poc-anvil",
  chains: [activeChain],
  wallets: [
    {
      groupName: "Recommended",
      wallets: [metaMaskWallet, coinbaseWallet, rainbowWallet, injectedWallet],
    },
  ],
  transports: {
    [baseSepolia.id]: http(rpcUrl),
    [anvil.id]: http(rpcUrl),
  },
  ssr: true,
});

export function WalletProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <RainbowKitProvider
        theme={darkTheme({
          accentColor: "#7c5cff",
          borderRadius: "medium",
        })}
        modalSize="compact"
      >
        {children}
      </RainbowKitProvider>
    </WagmiProvider>
  );
}
