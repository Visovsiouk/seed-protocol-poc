import { defineConfig } from "@wagmi/cli";
import { foundry } from "@wagmi/cli/plugins";

/**
 * Wagmi CLI codegen config.
 *
 * Reads Foundry build artifacts from two locations:
 *   1. the sibling `seed-protocol` repo (protocol surface — schema +
 *      adapter + ecosystem registries, factory, etc.)
 *   2. this repo's local `contracts/` (PoC-specific contracts — adapter
 *      implementations and the catalog-effect registry)
 *
 * Both sets are emitted into `packages/abis/generated/index.ts`.
 *
 * Run: `pnpm wagmi:gen`
 */
export default defineConfig({
  out: "../../packages/abis/generated/index.ts",
  plugins: [
    foundry({
      // Sibling repo: D:/Projects/seed-protocol/
      project: "../../../seed-protocol",
      include: [
        // Protocol surface
        "SeedSBT.sol/**",
        "EcosystemFactory.sol/**",
        "EcosystemTemplate.sol/**",
        "UniversalAsset.sol/**",
        "ProtocolExchange.sol/**",
        "SchemaRegistry.sol/**",
        "AdapterRegistry.sol/**",
        "EcosystemRegistry.sol/**",
        "EmissionController.sol/**",
        // PoC additions — wagmi/foundry plugin silently
        // skips patterns that don't match, so these are safe to leave in
        // before the contracts are written.
        "MetadataRenderer.sol/**",
        "RealmRegistry.sol/**",
      ],
    }),
    foundry({
      // Local PoC repo: D:/Projects/seed-protocol-poc/contracts/
      project: "../../contracts",
      include: [
        // on-chain commitment of
        // (loot-schemaId → catalog-effect names).
        "CatalogEffectRegistry.sol/**",
      ],
    }),
  ],
});
