import { activeChain, anvil } from "@/lib/chain";
import { baseSepolia } from "viem/chains";
import generated from "./generated/addresses.json";

/**
 * Deployed-contract addresses keyed by chainId.
 *
 * The anvil entry is GENERATED, not committed: `scripts/sync-addresses.mjs`
 * writes `generated/addresses.json` from the sister repo's
 * `deployments/<chainId>.env` right after `Deploy.s.sol` runs, so the app
 * always points at the deploy that actually happened. This matters because
 * the addresses are (deployer, nonce)-deterministic and `deploy/README.md` §1
 * mandates a fresh mnemonic for any public demo — a different deployer lands
 * every contract somewhere else.
 *
 * `generated/` is gitignored and materialised from `defaults/` by
 * `apps/web/scripts/ensure-generated.mjs`, which `pnpm build` / `pnpm dev`
 * run first. A fresh clone therefore builds against the committed defaults
 * (anvil's default account 0 — correct for `pnpm local`) with no chain
 * running, and a provisioned checkout keeps a clean worktree.
 *
 * (UUPS proxies — frontend always calls the proxy, never the implementation.)
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

/**
 * `generated/addresses.json` is chainId-keyed with a sibling `$schema` note,
 * mirroring the three seeder caches. Only the anvil entry is generated today.
 */
const generatedByChain = generated as unknown as Record<
  string,
  AddressMap | undefined
>;

const anvilAddresses = generatedByChain[String(anvil.id)];

if (!anvilAddresses) {
  throw new Error(
    `generated/addresses.json has no entry for chainId ${anvil.id} — ` +
      `run \`node apps/web/scripts/ensure-generated.mjs\` (or \`pnpm build\`, which runs it)`,
  );
}

export const addressesByChain: Record<number, AddressMap> = {
  [anvil.id]: anvilAddresses,
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
