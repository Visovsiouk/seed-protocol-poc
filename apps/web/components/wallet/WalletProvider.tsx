"use client";

import type { ReactNode } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { mock } from "wagmi/connectors";
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
import { demoMode, publicEnv } from "@/lib/env";
import { DemoAutoConnect } from "./DemoAutoConnect";

/**
 * Default demo player — anvil account #9. Chosen so it doesn't collide with
 * the realm-signer keyring (admin@idx0, realm owners@idx1-3, player-realm
 * delegates@idx4+; see lib/server/realm-signer.ts). Anvil unlocks all 10
 * default accounts, so the mock connector's `eth_sendTransaction` is signed
 * by the node — no private key in the browser bundle. Override via
 * NEXT_PUBLIC_DEMO_ADDRESS.
 */
const DEFAULT_DEMO_ADDRESS = "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720";

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
/**
 * Demo-mode config: a bare wagmi config whose only connector is the `mock`
 * connector pinned to a default anvil account. The connector forwards every
 * RPC method (incl. `eth_sendTransaction`) to the chain's HTTP transport, so
 * all client-signed txs are really mined on anvil. RainbowKit's modal is
 * bypassed entirely; `DemoAutoConnect` connects it on mount.
 */
const demoAddress = (publicEnv.NEXT_PUBLIC_DEMO_ADDRESS ??
  DEFAULT_DEMO_ADDRESS) as `0x${string}`;

const demoConfig = createConfig({
  chains: [activeChain],
  connectors: [
    mock({
      accounts: [demoAddress],
      features: { defaultConnected: true, reconnect: true },
    }),
  ],
  transports: {
    [baseSepolia.id]: http(rpcUrl),
    [anvil.id]: http(rpcUrl),
  },
  ssr: true,
});

const defaultConfig = getDefaultConfig({
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

const wagmiConfig = demoMode ? demoConfig : defaultConfig;

export function WalletProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <RainbowKitProvider
        theme={darkTheme({
          // Track the live realm palette instead of a fixed violet so the
          // wallet modal reads as part of the in-world surface. The var
          // resolves under [data-preset] on <body>, which the RK portal
          // inherits.
          accentColor: "var(--color-preset-accent)",
          accentColorForeground: "var(--color-preset-bg)",
          borderRadius: "medium",
        })}
        modalSize="compact"
      >
        {demoMode ? <DemoAutoConnect /> : null}
        {children}
      </RainbowKitProvider>
    </WagmiProvider>
  );
}
