"use client";

import type { ReactNode } from "react";
import { WagmiProvider, http, createConfig } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { coinbaseWallet, injected } from "wagmi/connectors";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { activeChain, anvil, rpcUrl } from "@/lib/chain";

/**
 * Wagmi + RainbowKit wrapper. QueryClientProvider is one layer up in
 * app/providers.tsx so reads work even before this module's wagmi context
 * is in scope.
 *
 * Connectors: Coinbase Smart Wallet (paymaster-friendly, primary) + injected
 * (MetaMask / Rabby / Frame / etc.). WalletConnect is intentionally NOT
 * included — its universal-provider touches `indexedDB` at module-eval time
 * and crashes Next.js SSR. Re-add via the `cookieStorage` + `cookieToInitialState`
 * pattern once we ship to base-sepolia and need mobile QR pairing.
 */
const wagmiConfig = createConfig({
  chains: [activeChain],
  connectors: [
    coinbaseWallet({
      appName: "Realms — Seed Protocol PoC",
      preference: "smartWalletOnly",
    }),
    injected({ shimDisconnect: true }),
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
