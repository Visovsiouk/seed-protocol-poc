#!/usr/bin/env node
/**
 * Writes `apps/web/lib/contracts/generated/addresses.json` from the sister
 * repo's `deployments/<chainId>.env`, which Deploy.s.sol produces (see
 * script/lib/DeployFlow.sol `_writeEnvFile`).
 *
 * Why this exists: the default addresses are the (deployer, nonce)-deterministic
 * ones for anvil's DEFAULT account 0. Any deploy from a different deployer —
 * which deploy/README.md §1 mandates for a public demo, since anvil's default
 * keys are public knowledge — lands the contracts at different addresses, and
 * every seeder and read path then points at empty accounts ("No contract at
 * EcosystemFactory address 0x...").
 *
 * `addresses.ts` imports the generated JSON, so provisioning no longer edits
 * tracked source and a deployed checkout stays clean for `git pull`.
 *
 * Invoked by scripts/chain-up.sh on fresh-chain provisioning, between
 * Deploy.s.sol and seed-all.sh. Idempotent; a no-op deploy rewrites the same
 * values.
 *
 * Usage: node scripts/sync-addresses.mjs <sister-repo> [chainId=31337]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sisterRepo = process.argv[2];
const chainId = process.argv[3] ?? "31337";

if (!sisterRepo) {
  console.error("usage: node scripts/sync-addresses.mjs <sister-repo> [chainId]");
  process.exit(1);
}

/** Deploy.s.sol env var -> ContractName key in addresses.ts */
const KEY_BY_ENV = {
  SEED_SBT: "seedSBT",
  ECOSYSTEM_FACTORY: "ecosystemFactory",
  ECOSYSTEM_REGISTRY: "ecosystemRegistry",
  ECOSYSTEM_TEMPLATE: "ecosystemTemplateImpl",
  UNIVERSAL_ASSET: "universalAsset",
  PROTOCOL_EXCHANGE: "protocolExchange",
  SCHEMA_REGISTRY: "schemaRegistry",
  ADAPTER_REGISTRY: "adapterRegistry",
  EMISSION_CONTROLLER: "emissionController",
};

const envPath = resolve(sisterRepo, "deployments", `${chainId}.env`);
const envText = readFileSync(envPath, "utf8");

const deployed = {};
for (const line of envText.split(/\r?\n/)) {
  const m = /^export\s+([A-Z_]+)=(0x[0-9a-fA-F]{40})\s*$/.exec(line);
  if (!m) continue;
  const key = KEY_BY_ENV[m[1]];
  // Lowercase to match the file's existing convention — log-derived addresses
  // are lowercase and some call sites compare without normalising.
  if (key) deployed[key] = m[2].toLowerCase();
}

const missing = Object.values(KEY_BY_ENV).filter((k) => !(k in deployed));
if (missing.length) {
  console.error(`ERROR: ${envPath} is missing: ${missing.join(", ")}`);
  process.exit(1);
}

// Output is the generated address book, NOT the TypeScript source: addresses.ts
// imports `generated/addresses.json` and stays untouched by provisioning, so a
// deployed checkout keeps a clean worktree. See apps/web/scripts/ensure-generated.mjs.
const outPath = resolve(ROOT, "apps/web/lib/contracts/generated/addresses.json");

let doc = {};
try {
  doc = JSON.parse(readFileSync(outPath, "utf8"));
} catch {
  // Missing or unparseable — ensure-generated.mjs normally puts the defaults
  // here first, but provisioning must not hard-fail if it did not run.
}

const previous = doc[chainId] ?? {};
const changed = Object.entries(deployed).filter(([k, v]) => previous[k] !== v);

doc[chainId] = deployed;
doc.$schema =
  "Per-chainId map of core-protocol addresses, written by `scripts/sync-addresses.mjs` " +
  "from the sister repo's `deployments/<chainId>.env`. Gitignored — see lib/contracts/defaults/.";

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(doc, null, 2) + "\n", "utf8");
console.log(
  `synced ${Object.keys(deployed).length} addresses for chainId ${chainId} from ${envPath} ` +
    `-> ${outPath}` +
    (changed.length ? ` (${changed.length} changed)` : " (already current)"),
);
