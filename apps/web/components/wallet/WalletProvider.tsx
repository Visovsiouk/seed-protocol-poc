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
import { rainbowkitBurnerWallet } from "burner-connector";
import { activeChain, anvil, rpcUrl } from "@/lib/chain";
import { demoMode, faucetEnabled, publicEnv } from "@/lib/env";
import { DemoAutoConnect } from "./DemoAutoConnect";
import { AutoFaucet } from "./AutoFaucet";
import { ConnectWizard } from "./ConnectWizard";
import {
  BURNER_ACTIVATED_KEY,
  DisconnectGuard,
  USER_DISCONNECTED_KEY,
} from "./DisconnectGuard";

/**
 * The stock burner connector is `connected = true` at module-init and
 * regenerates its key on demand, so `isAuthorized()` is always true — meaning
 * wagmi's reconnect-on-mount would auto-connect a brand-new visitor before they
 * ever see the ConnectWizard, and would silently undo a user's Disconnect.
 *
 * We wrap the wallet so its connector's `isAuthorized()` (which only governs
 * reconnect-on-mount, NOT explicit `connect()`) returns false unless the user
 * has opted into the burner:
 *   - false while `wallet:userDisconnected` is set (Disconnect must stick); and
 *   - false unless `wallet:burnerActivated` is set — the ConnectWizard sets this
 *     only when the user clicks "Play instantly", so a first visit shows the
 *     wizard instead of auto-connecting, while a returning user who already chose
 *     reconnects straight into the app.
 * An explicit wizard `connect()` is unaffected by this gate.
 */
const guardedBurnerWallet = () => {
  const wallet = rainbowkitBurnerWallet();
  return {
    ...wallet,
    createConnector: (walletDetails: Parameters<typeof wallet.createConnector>[0]) => {
      const createConnectorFn = wallet.createConnector(walletDetails);
      return (config: Parameters<typeof createConnectorFn>[0]) => {
        const connector = createConnectorFn(config);
        return {
          ...connector,
          async isAuthorized() {
            if (typeof window !== "undefined") {
              if (window.sessionStorage.getItem(USER_DISCONNECTED_KEY) === "1") {
                return false;
              }
              if (window.localStorage.getItem(BURNER_ACTIVATED_KEY) !== "1") {
                return false;
              }
            }
            return connector.isAuthorized();
          },
        };
      };
    },
  };
};

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
 * at the top because that's what the local-dev flow uses; `injectedWallet`
 * catches Rabby / Frame / Brave Wallet etc.
 *
 * Coinbase Smart Wallet is offered ONLY off anvil (base-sepolia paymaster
 * work). It's a hosted account-abstraction wallet (keys.coinbase.com) that
 * signs/broadcasts through Coinbase's backend and only knows Coinbase-
 * supported networks — it can't reach a local 127.0.0.1 anvil RPC or
 * recognize chainId 31337, so a user-signed tx (e.g. realm `createEcosystem`)
 * dies with a generic "Something went wrong". Gating it off anvil removes
 * that footgun; on local dev use the burner or an injected wallet instead.
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

// On the local anvil chain we lead with a one-click burner wallet so a brand-new
// visitor can play instantly — no browser extension, no network-add dance. The
// burner generates/persists a random key in localStorage, signs LOCALLY, and
// sends raw txs through the chain's default RPC (anvil's rpcUrls.default, i.e.
// NEXT_PUBLIC_RPC_URL — see lib/chain.ts), so unlike the demo `mock` connector
// it can sign for its own fresh address. AutoFaucet funds it on connect.
//
// Burner is anvil-ONLY: an email/social or burner key is meaningless (and the
// burner can't be funded) on base-sepolia, so off anvil we offer extension
// wallets only.
const burnerGroups =
  activeChain.id === anvil.id
    ? [
        {
          groupName: "Play instantly (no extension)",
          wallets: [guardedBurnerWallet],
        },
      ]
    : [];

// Coinbase Smart Wallet is hosted and can't transact against local anvil
// (see the module comment above), so on anvil we offer extension wallets
// only; off anvil it rejoins the list for base-sepolia paymaster work.
const ownWallets =
  activeChain.id === anvil.id
    ? [metaMaskWallet, rainbowWallet, injectedWallet]
    : [metaMaskWallet, coinbaseWallet, rainbowWallet, injectedWallet];

const defaultConfig = getDefaultConfig({
  appName: "Realms — Seed Protocol PoC",
  // projectId is only required when WalletConnect is enabled; pass a stub
  // so the type-check passes. Replace with the real env var once WC is back.
  projectId: "realms-poc-anvil",
  chains: [activeChain],
  wallets: [
    ...burnerGroups,
    {
      groupName: "Use your own wallet",
      wallets: ownWallets,
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
        {faucetEnabled ? <AutoFaucet /> : null}
        <DisconnectGuard />
        {demoMode ? null : <ConnectWizard />}
        {children}
      </RainbowKitProvider>
    </WagmiProvider>
  );
}
