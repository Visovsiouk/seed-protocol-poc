import { defineConfig } from "@wagmi/cli";
import { foundry } from "@wagmi/cli/plugins";

/**
 * Wagmi CLI codegen config.
 *
 * Reads Foundry build artifacts from the sibling `seed-protocol/out/` directory
 * (the Foundry repo is run independently via anvil) and emits typed bindings
 * into `packages/abis/generated/`.
 *
 * If the contracts repo is moved, only `project` needs to change.
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
  ],
});
