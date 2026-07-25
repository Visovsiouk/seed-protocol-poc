#!/usr/bin/env node
/**
 * Rewrites the anvil address block in `apps/web/lib/contracts/addresses.ts`
 * from the sister repo's `deployments/<chainId>.env`, which Deploy.s.sol
 * writes (see script/lib/DeployFlow.sol `_writeEnvFile`).
 *
 * Why this exists: the addresses checked into `addresses.ts` are the
 * (deployer, nonce)-deterministic ones for anvil's DEFAULT account 0. Any
 * deploy from a different deployer — which deploy/README.md §1 mandates for a
 * public demo, since anvil's default keys are public knowledge — lands the
 * contracts at different addresses, and every seeder and read path then points
 * at empty accounts ("No contract at EcosystemFactory address 0x...").
 *
 * Invoked by scripts/chain-up.sh on fresh-chain provisioning, between
 * Deploy.s.sol and seed-all.sh. Idempotent; a no-op deploy rewrites the same
 * values.
 *
 * Usage: node scripts/sync-addresses.mjs <sister-repo> [chainId=31337]
 */
import { readFileSync, writeFileSync } from "node:fs";
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

const addressesPath = resolve(ROOT, "apps/web/lib/contracts/addresses.ts");
const source = readFileSync(addressesPath, "utf8");

// Narrow the rewrite to the [anvil.id] block so the base-sepolia placeholders
// are never touched.
const blockRe = /(\[anvil\.id\]:\s*\{)([\s\S]*?)(\n\s*\},)/;
const block = blockRe.exec(source);
if (!block) {
  console.error(`ERROR: could not locate the [anvil.id] block in ${addressesPath}`);
  process.exit(1);
}

let body = block[2];
const changed = [];
for (const [key, addr] of Object.entries(deployed)) {
  const lineRe = new RegExp(`(\\b${key}:\\s*")0x[0-9a-fA-F]{40}(")`);
  if (!lineRe.test(body)) {
    console.error(`ERROR: no '${key}' entry in the [anvil.id] block`);
    process.exit(1);
  }
  const before = body;
  body = body.replace(lineRe, `$1${addr}$2`);
  if (before !== body) changed.push(key);
}

writeFileSync(addressesPath, source.replace(blockRe, `$1${body}$3`), "utf8");
console.log(
  `synced ${Object.keys(deployed).length} anvil addresses from ${envPath}` +
    (changed.length ? ` (${changed.length} changed)` : " (already current)"),
);
