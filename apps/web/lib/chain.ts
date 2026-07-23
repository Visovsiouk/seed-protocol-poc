import { defineChain } from "viem";
import { baseSepolia } from "viem/chains";
import { explorerUrl, publicEnv } from "./env";

export const rpcUrl = publicEnv.NEXT_PUBLIC_RPC_URL;

/**
 * Local anvil chain (chainId 31337) — used for dev when running contracts
 * via `anvil` against the seed-protocol contracts repo.
 *
 * rpcUrls carries NEXT_PUBLIC_RPC_URL (not a hardcoded 127.0.0.1) so that when
 * a remote user adds/switches to this network in MetaMask — via RainbowKit's
 * chain modal or the AddNetworkButton — the wallet is pointed at the
 * browser-reachable host, not the user's own loopback. For a single-machine
 * solo setup this is still `http://127.0.0.1:8545`.
 */
export const anvil = defineChain({
  id: 31337,
  name: "Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [rpcUrl] },
  },
  // With NEXT_PUBLIC_EXPLORER_URL set (Otterscan), wallet UIs (RainbowKit
  // account modal etc.) gain their native "view on explorer" links.
  ...(explorerUrl
    ? { blockExplorers: { default: { name: "Otterscan", url: explorerUrl } } }
    : {}),
  testnet: true,
});

export const activeChain =
  publicEnv.NEXT_PUBLIC_CHAIN === "anvil" ? anvil : baseSepolia;
