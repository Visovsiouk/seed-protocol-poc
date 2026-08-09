/**
 * `pnpm seed:catalog` — deploys the `CatalogEffectRegistry` and writes
 * the per-preset catalog effect names against each preset's on-chain
 * loot schemaId. Run after `pnpm seed` (the loot schemaIds in
 * `generated/realms.json` are the registry's keys).
 *
 * Idempotency:
 *   1. If `generated/catalog.json` cached a registry address whose
 *      bytecode is still present, skip deployment and use it.
 *   2. For each preset's loot schemaId, read `effectsOf(id)` on chain
 *      and only call `setEffects` if the on-chain set differs from
 *      `CANONICAL_CATALOG_EFFECTS[preset]`. This lets re-runs notice
 *      both "nothing seeded yet" (length 0) and "stale on-chain set"
 *      (length matches but bytes32 differ) without bloating the
 *      EffectsSet event log.
 *
 * Run with:
 *   pnpm --filter web seed:catalog
 *
 * Prerequisites:
 *   - `pnpm seed` has succeeded on the active chain (loot schemas exist
 *     in `generated/realms.json`).
 *   - `forge build` in `contracts/` has produced
 *     `contracts/out/CatalogEffectRegistry.sol/CatalogEffectRegistry.json`.
 *     The script reads bytecode straight from there. (ABI is the
 *     wagmi-generated one — we already trust it for runtime reads.)
 *   - `REALM_SIGNER_MNEMONIC`, `REALM_SIGNER_RPC_URL` (or
 *     `NEXT_PUBLIC_RPC_URL`) set in `.env.local`, same as `pnpm seed`.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  stringToHex,
  hexToString,
  type Abi,
  type Address,
  type Hex,
} from "viem";

import { catalogEffectRegistryAbi } from "@abis/generated";
import { CANONICAL_CATALOG_EFFECTS } from "../lib/contracts/catalog-effects-config";
import type { CatalogEffectName, Preset } from "../lib/engine/types";
import {
  assertChainId,
  buildSeederClients,
  type PublicClientT,
  type Signer,
  type WalletClientT,
} from "./lib/seeder-client";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRESETS: readonly Preset[] = ["fantasy", "scifi", "cyberpunk"] as const;
const ZERO: Address = "0x0000000000000000000000000000000000000000";

// ---------------------------------------------------------------------------
// Forge artifact (bytecode only — ABI comes from wagmi-generated bindings)
// ---------------------------------------------------------------------------

const CONTRACTS_OUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "contracts",
  "out",
);

const REGISTRY_ARTIFACT = resolve(
  CONTRACTS_OUT,
  "CatalogEffectRegistry.sol",
  "CatalogEffectRegistry.json",
);

type ForgeArtifact = {
  abi: Abi;
  bytecode: { object: Hex };
};

function loadRegistryBytecode(): Hex {
  if (!existsSync(REGISTRY_ARTIFACT)) {
    throw new Error(
      `Missing forge artifact at ${REGISTRY_ARTIFACT} — run \`forge build\` in contracts/ first`,
    );
  }
  const raw = JSON.parse(readFileSync(REGISTRY_ARTIFACT, "utf-8")) as ForgeArtifact;
  if (!raw.bytecode?.object || raw.bytecode.object === "0x") {
    throw new Error(`Empty bytecode in ${REGISTRY_ARTIFACT}`);
  }
  return raw.bytecode.object;
}

// ---------------------------------------------------------------------------
// Env + keyring
// ---------------------------------------------------------------------------

function buildKeyring() {
  const { publicClient, signerAt, chain } = buildSeederClients();
  // Admin slot (index 0) — same one that seeded realms + adapters.
  const admin: Signer = signerAt(0);
  return { publicClient, admin, chain };
}

// ---------------------------------------------------------------------------
// generated/realms.json — read the on-chain loot schema ids
// ---------------------------------------------------------------------------

const SEEDED_REALMS_FILE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "lib",
  "contracts",
  "generated",
  "realms.json",
);

type RealmsSchemaPair = { clearReceipt: string; loot: string };
type SeededRealmsEntry = {
  realms: Record<Preset, string>;
  schemas: Record<Preset, RealmsSchemaPair>;
  seededAt: string | null;
};

function readLootSchemaIds(chainId: number): Record<Preset, bigint> {
  const doc = JSON.parse(readFileSync(SEEDED_REALMS_FILE, "utf-8")) as Record<
    string,
    SeededRealmsEntry | undefined
  >;
  const entry = doc[String(chainId)];
  if (!entry) {
    throw new Error(`No generated/realms.json entry for chainId ${chainId}`);
  }
  const out = {} as Record<Preset, bigint>;
  for (const p of PRESETS) {
    const raw = entry.schemas[p]?.loot;
    if (!raw || raw === "0") {
      throw new Error(
        `${p} loot schema is unseeded for chainId ${chainId} — run \`pnpm seed\` first`,
      );
    }
    out[p] = BigInt(raw);
  }
  return out;
}

// ---------------------------------------------------------------------------
// generated/catalog.json — output
// ---------------------------------------------------------------------------

const SEEDED_CATALOG_FILE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "lib",
  "contracts",
  "generated",
  "catalog.json",
);

type SeededCatalogEntry = {
  registry: Address;
  /** Map of decimal-string schemaId → ordered list of effect names. */
  schemas: Record<string, CatalogEffectName[]>;
  seededAt: string | null;
};

type CatalogDoc = Record<string, SeededCatalogEntry | string | undefined>;

function loadCatalogFile(): CatalogDoc {
  if (!existsSync(SEEDED_CATALOG_FILE)) {
    return {
      $schema:
        "Per-chainId map of the deployed CatalogEffectRegistry address + per-schema effect lists, written by `pnpm seed:catalog`.",
    };
  }
  return JSON.parse(readFileSync(SEEDED_CATALOG_FILE, "utf-8")) as CatalogDoc;
}

function writeCatalogFile(doc: CatalogDoc): void {
  writeFileSync(SEEDED_CATALOG_FILE, JSON.stringify(doc, null, 2) + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// bytes32 helpers (right-padded UTF-8 of the effect name)
// ---------------------------------------------------------------------------

function encodeName(name: CatalogEffectName): Hex {
  return stringToHex(name, { size: 32 });
}

function decodeName(raw: Hex): string {
  // hexToString trims trailing zero bytes thanks to the `size` opt.
  return hexToString(raw, { size: 32 });
}

function sameEffectList(
  onchain: readonly Hex[],
  desired: readonly CatalogEffectName[],
): boolean {
  if (onchain.length !== desired.length) return false;
  for (let i = 0; i < desired.length; i++) {
    if (decodeName(onchain[i]) !== desired[i]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Deploy / write
// ---------------------------------------------------------------------------

async function deployRegistry(
  publicClient: PublicClientT,
  admin: Signer,
  bytecode: Hex,
): Promise<Address> {
  const hash = await admin.wallet.deployContract({
    abi: catalogEffectRegistryAbi,
    bytecode,
    args: [admin.account.address],
    account: admin.account,
    chain: admin.wallet.chain!,
  });
  process.stdout.write(`  deploy CatalogEffectRegistry → tx ${hash} `);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`deploy CatalogEffectRegistry reverted (tx ${hash})`);
  }
  const addr = receipt.contractAddress as Address | null;
  if (!addr) {
    throw new Error("deploy succeeded but receipt has no contractAddress");
  }
  console.log(`→ ${addr}`);
  return addr;
}

async function setEffectsOnchain(
  publicClient: PublicClientT,
  admin: Signer,
  registry: Address,
  schemaId: bigint,
  names: readonly CatalogEffectName[],
  label: string,
): Promise<void> {
  const encoded = names.map(encodeName);
  const hash = await admin.wallet.writeContract({
    address: registry,
    abi: catalogEffectRegistryAbi,
    functionName: "setEffects",
    args: [schemaId, encoded],
    account: admin.account,
    chain: admin.wallet.chain!,
  });
  process.stdout.write(`  setEffects ${label} → tx ${hash} `);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`setEffects(${label}) reverted (tx ${hash})`);
  }
  console.log("ok");
}

async function readEffectsOnchain(
  publicClient: PublicClientT,
  registry: Address,
  schemaId: bigint,
): Promise<readonly Hex[]> {
  return (await publicClient.readContract({
    address: registry,
    abi: catalogEffectRegistryAbi,
    functionName: "effectsOf",
    args: [schemaId],
  })) as readonly Hex[];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { publicClient, admin, chain } = buildKeyring();

  await assertChainId(publicClient, chain);
  const chainId = chain.id;

  console.log(`Seeding catalog effects on chainId ${chainId} (${chain.name})`);
  console.log(`  admin           : ${admin.account.address}\n`);

  const lootSchemas = readLootSchemaIds(chainId);
  console.log("Loot schemas from generated/realms.json:");
  for (const p of PRESETS) console.log(`  ${p.padEnd(9)} = ${lootSchemas[p]}`);
  console.log("");

  const doc = loadCatalogFile();
  const existing = (doc[String(chainId)] as SeededCatalogEntry | undefined) ?? {
    registry: ZERO,
    schemas: {},
    seededAt: null,
  };

  // --- Step 1: resolve registry address. Deploy if missing or stale.
  let registry = existing.registry;
  if (registry !== ZERO) {
    const code = await publicClient.getCode({ address: registry });
    if (!code || code === "0x") {
      console.log(`  stale registry at ${registry} (no code) — redeploying`);
      registry = ZERO;
    } else {
      console.log(`  reusing registry at ${registry}`);
    }
  }
  if (registry === ZERO) {
    const bytecode = loadRegistryBytecode();
    registry = await deployRegistry(publicClient, admin, bytecode);
    // Wipe the cached schemas; a new registry has nothing in it.
    existing.schemas = {};
  }

  // --- Step 2: per preset, diff on-chain vs desired and write if needed.
  let writes = 0;
  for (const preset of PRESETS) {
    const schemaId = lootSchemas[preset];
    const desired = CANONICAL_CATALOG_EFFECTS[preset];
    const onchain = await readEffectsOnchain(publicClient, registry, schemaId);
    if (sameEffectList(onchain, desired)) {
      console.log(
        `  skip ${preset.padEnd(9)} (schema ${schemaId}) — already [${desired.join(", ")}]`,
      );
    } else {
      await setEffectsOnchain(
        publicClient,
        admin,
        registry,
        schemaId,
        desired,
        `${preset} (schema ${schemaId})`,
      );
      writes++;
    }
    existing.schemas[String(schemaId)] = [...desired];
  }

  existing.registry = registry;
  existing.seededAt = new Date().toISOString();
  doc[String(chainId)] = existing;
  writeCatalogFile(doc);

  console.log("\n=== Done ===");
  console.log(`  registry  : ${registry}`);
  console.log(`  writes    : ${writes}`);
  console.log(`  schemas   :`);
  for (const preset of PRESETS) {
    const id = lootSchemas[preset];
    console.log(`    ${preset.padEnd(9)} (${id}) → [${CANONICAL_CATALOG_EFFECTS[preset].join(", ")}]`);
  }
  console.log(`\nWrote ${SEEDED_CATALOG_FILE}`);
}

main().catch((e) => {
  console.error("\nseed-catalog failed:");
  console.error(e);
  process.exit(1);
});
