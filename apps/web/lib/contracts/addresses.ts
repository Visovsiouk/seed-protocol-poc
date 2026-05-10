import { activeChain, anvil } from "@/lib/chain";
import { baseSepolia } from "viem/chains";

/**
 * Deployed-contract addresses keyed by chainId.
 *
 * Anvil entries reflect the local deploy at
 *   D:/Projects/seed-protocol/broadcast/Deploy.s.sol/31337/run-latest.json
 * (UUPS proxies — frontend always calls the proxy, never the implementation).
 *
 * Base Sepolia entries are filled in after the testnet deploy lands.
 */
export type ContractName =
  | "seedSBT"
  | "ecosystemFactory"
  | "ecosystemRegistry"
  | "ecosystemTemplateImpl"
  | "universalAsset"
  | "protocolExchange"
  | "schemaRegistry"
  | "adapterRegistry"
  | "emissionController";

type AddressMap = Record<ContractName, `0x${string}`>;

export const addressesByChain: Record<number, AddressMap> = {
  [anvil.id]: {
    seedSBT: "0x5fc8d32690cc91d4c39d9d3abcbd16989f875707",
    ecosystemFactory: "0xb7f8bc63bbcad18155201308c8f3540b07f84f5e",
    ecosystemRegistry: "0x5fbdb2315678afecb367f032d93f642f64180aa3",
    ecosystemTemplateImpl: "0x0165878a594ca255338adfa4d48449f69242eb8f",
    universalAsset: "0xdc64a140aa3e981100a9beca4e685f962f0cf6c9",
    protocolExchange: "0x8a791620dd6260079bf849dc5567adc3f2fdc318",
    schemaRegistry: "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512",
    adapterRegistry: "0xa513e6e4b8f2a923d98304ec87f64353c4d5c853",
    emissionController: "0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9",
  },
  [baseSepolia.id]: {
    // TODO(phase-6): fill once deployed to Base Sepolia
    seedSBT: "0x0000000000000000000000000000000000000000",
    ecosystemFactory: "0x0000000000000000000000000000000000000000",
    ecosystemRegistry: "0x0000000000000000000000000000000000000000",
    ecosystemTemplateImpl: "0x0000000000000000000000000000000000000000",
    universalAsset: "0x0000000000000000000000000000000000000000",
    protocolExchange: "0x0000000000000000000000000000000000000000",
    schemaRegistry: "0x0000000000000000000000000000000000000000",
    adapterRegistry: "0x0000000000000000000000000000000000000000",
    emissionController: "0x0000000000000000000000000000000000000000",
  },
};

export const addresses: AddressMap = addressesByChain[activeChain.id]!;

if (!addresses) {
  throw new Error(
    `No addresses configured for chainId ${activeChain.id} (${activeChain.name})`,
  );
}

export function getAddress(name: ContractName): `0x${string}` {
  return addresses[name];
}
