import { defineChain } from "viem";
import { baseSepolia } from "viem/chains";
import { publicEnv } from "./env";

/**
 * Local anvil chain (chainId 31337) — used for dev when running contracts
 * via `anvil` against the seed-protocol contracts repo.
 */
export const anvil = defineChain({
  id: 31337,
  name: "Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8545"] },
  },
  testnet: true,
});

export const activeChain =
  publicEnv.NEXT_PUBLIC_CHAIN === "anvil" ? anvil : baseSepolia;

export const rpcUrl = publicEnv.NEXT_PUBLIC_RPC_URL;
