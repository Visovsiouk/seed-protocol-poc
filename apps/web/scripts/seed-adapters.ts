/**
 * `pnpm seed:adapters` — deploys the PoC preset adapters and registers
 * them in the AdapterRegistry on the active chain. Run after `pnpm seed`
 * has placed the three preset realms and their loot schemas on-chain.
 *
 * Deployment cardinality (12 contracts total):
 *
 *   PresetWeaponAdapter × 6 ordered preset pairs
 *   PresetArmorAdapter  × 6 ordered preset pairs
 *
 *   The 6 ordered pairs are every (source, target) combination from
 *   {fantasy, scifi, cyberpunk} where source != target:
 *
 *     fantasy → scifi,    scifi → fantasy
 *     fantasy → cyberpunk, cyberpunk → fantasy
 *     scifi   → cyberpunk, cyberpunk → scifi
 *
 *   Each adapter is bound at construction to the actual on-chain loot
 *   schema ids (read from `.seeded-realms.json`) and then registered in
 *   AdapterRegistry under that same (source, target) pair so any
 *   ecosystem on-chain can discover them via `getAdapters(sourceSchemaId)`.
 *
 *   Registration is permissionless (IAdapterRegistry.sol:39) — any
 *   funded account can call it; we use the admin keyring slot.
 *
 * Idempotency: re-running checks `.seeded-adapters.json` and skips
 * deployments whose entry already has a non-zero address. The
 * AdapterRegistry is append-only — re-registering would emit a duplicate
 * `AdapterRegistered` event and bloat `getAdapters()` returns. The skip
 * check is per-(slot, source, target), not per-contract — moving the
 * mnemonic or rebuilding the contracts requires deleting the JSON entry.
 *
 * Run with:
 *   pnpm --filter web seed:adapters
 *
 * Prerequisites:
 *   - `pnpm seed` has succeeded on the active chain (loot schemas exist).
 *   - `forge build` in `contracts/` has produced the adapter artifacts
 *     under `contracts/out/`. The script reads bytecode + ABI from there
 *     rather than re-compiling.
 *   - `REALM_SIGNER_MNEMONIC`, `REALM_SIGNER_RPC_URL` (or
 *     `NEXT_PUBLIC_RPC_URL`) set in `.env.local`, same as `pnpm seed`.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  createPublicClient,
  createWalletClient,
  http,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { mnemonicToAccount, type HDAccount } from "viem/accounts";

import { adapterRegistryAbi } from "@abis/generated";
import { addressesByChain } from "../lib/contracts/addresses";
import { activeChain } from "../lib/chain";

// pnpm hoists multiple viem copies via wagmi/rainbowkit peer-dep variants
// — same TS2719 dodge the realm seeder uses. The cross-boundary call
// site is `deployContract` + `waitForTransactionReceipt` here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PublicClientT = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WalletClientT = any;

// ---------------------------------------------------------------------------
// Adapter constants
// ---------------------------------------------------------------------------

const PRESETS = ["fantasy", "scifi", "cyberpunk"] as const;
type Preset = (typeof PRESETS)[number];

// Must match `contracts/src/PresetTypes.sol :: Preset` enum order:
// Fantasy=0, SciFi=1, Cyberpunk=2. The adapter constructor consumes this
// as a uint8, so the value is on-chain meaningful, not just a label.
const PRESET_ENUM: Record<Preset, number> = {
  fantasy: 0,
  scifi: 1,
  cyberpunk: 2,
};

type Slot = "weapon" | "armor";
const SLOTS: readonly Slot[] = ["weapon", "armor"] as const;

// Forge artifact paths. The script reads bytecode + ABI straight from
// the build output — there's no need to re-compile or duplicate the ABI.
const CONTRACTS_OUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "contracts",
  "out",
);

const ARTIFACT_PATH: Record<Slot, string> = {
  weapon: resolve(CONTRACTS_OUT, "PresetWeaponAdapter.sol", "PresetWeaponAdapter.json"),
  armor: resolve(CONTRACTS_OUT, "PresetArmorAdapter.sol", "PresetArmorAdapter.json"),
};

type ForgeArtifact = {
  abi: Abi;
  bytecode: { object: Hex };
};

function loadArtifact(slot: Slot): ForgeArtifact {
  const path = ARTIFACT_PATH[slot];
  if (!existsSync(path)) {
    throw new Error(
      `Missing forge artifact at ${path} — run \`forge build\` in contracts/ first`,
    );
  }
  const raw = JSON.parse(readFileSync(path, "utf-8")) as ForgeArtifact;
  if (!raw.bytecode?.object || raw.bytecode.object === "0x") {
    throw new Error(`Empty bytecode in artifact ${path}`);
  }
  return raw;
}

// ---------------------------------------------------------------------------
// Env + keyring
// ---------------------------------------------------------------------------

function loadEnv() {
  const mnemonic = process.env.REALM_SIGNER_MNEMONIC;
  const rpcUrl =
    process.env.REALM_SIGNER_RPC_URL ?? process.env.NEXT_PUBLIC_RPC_URL;
  if (!mnemonic) {
    throw new Error("REALM_SIGNER_MNEMONIC is not set");
  }
  if (!rpcUrl) {
    throw new Error("REALM_SIGNER_RPC_URL (or NEXT_PUBLIC_RPC_URL) is not set");
  }
  return { mnemonic, rpcUrl };
}

type Signer = { account: HDAccount; wallet: WalletClientT };

function buildKeyring(mnemonic: string, rpcUrl: string) {
  const transport = http(rpcUrl);
  const chain = activeChain;
  const publicClient = createPublicClient({ chain, transport });

  // Admin slot (index 0) is used for both deployments and registry
  // writes. registerAdapter is permissionless so any funded account
  // would work — using admin keeps the gas burn on one address.
  const account = mnemonicToAccount(mnemonic, { addressIndex: 0 });
  const wallet = createWalletClient({ account, chain, transport });
  const admin: Signer = { account, wallet };

  return { publicClient, admin, chain };
}

// ---------------------------------------------------------------------------
// .seeded-realms.json — read the on-chain loot schema ids
// ---------------------------------------------------------------------------

const SEEDED_REALMS_FILE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "lib",
  "contracts",
  ".seeded-realms.json",
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
    throw new Error(`No .seeded-realms.json entry for chainId ${chainId}`);
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
// .seeded-adapters.json — output
// ---------------------------------------------------------------------------

const SEEDED_ADAPTERS_FILE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "lib",
  "contracts",
  ".seeded-adapters.json",
);

const ZERO: Address = "0x0000000000000000000000000000000000000000";

/**
 * Output schema: per-chain map of (slot, source, target) → adapter
 * address. Keys use preset labels (rather than schema ids) so the web
 * app's reads layer doesn't need to round-trip through `.seeded-realms`
 * to figure out which adapter to call.
 */
type AdaptersBySlot = Record<Slot, Record<Preset, Record<Preset, Address>>>;
type SeededAdaptersEntry = {
  adapters: AdaptersBySlot;
  seededAt: string | null;
};

function emptySlotMap(): Record<Preset, Record<Preset, Address>> {
  const m = {} as Record<Preset, Record<Preset, Address>>;
  for (const s of PRESETS) {
    m[s] = {} as Record<Preset, Address>;
    for (const t of PRESETS) m[s][t] = ZERO;
  }
  return m;
}

function emptyEntry(): SeededAdaptersEntry {
  return {
    adapters: { weapon: emptySlotMap(), armor: emptySlotMap() },
    seededAt: null,
  };
}

// The on-disk doc is a top-level object whose keys are either a chainId
// string mapping to a SeededAdaptersEntry, or the literal `$schema` key
// mapping to a docstring. Union'ing `string` into the value type covers
// the docstring branch.
type AdaptersDoc = Record<string, SeededAdaptersEntry | string | undefined>;

function loadAdaptersFile(): AdaptersDoc {
  if (!existsSync(SEEDED_ADAPTERS_FILE)) {
    return {
      $schema:
        "Per-chainId map of deployed adapter addresses keyed by (slot, sourcePreset, targetPreset), written by `pnpm seed:adapters`.",
    };
  }
  return JSON.parse(readFileSync(SEEDED_ADAPTERS_FILE, "utf-8")) as AdaptersDoc;
}

function writeAdaptersFile(doc: AdaptersDoc): void {
  writeFileSync(SEEDED_ADAPTERS_FILE, JSON.stringify(doc, null, 2) + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// Deploy + register
// ---------------------------------------------------------------------------

async function deployAdapter(
  publicClient: PublicClientT,
  admin: Signer,
  artifact: ForgeArtifact,
  args: readonly [bigint, bigint, number, number],
  label: string,
): Promise<Address> {
  const hash = await admin.wallet.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
    args,
    account: admin.account,
    chain: admin.wallet.chain!,
  });
  process.stdout.write(`    deploy ${label} → tx ${hash} `);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`deploy ${label} reverted (tx ${hash})`);
  }
  const addr = receipt.contractAddress as Address | null;
  if (!addr) {
    throw new Error(`deploy ${label} succeeded but receipt has no contractAddress`);
  }
  console.log(`→ ${addr}`);
  return addr;
}

async function registerAdapter(
  publicClient: PublicClientT,
  admin: Signer,
  adapterRegistry: Address,
  adapter: Address,
  sourceSchemaId: bigint,
  targetSchemaId: bigint,
  label: string,
): Promise<void> {
  const hash = await admin.wallet.writeContract({
    address: adapterRegistry,
    abi: adapterRegistryAbi,
    functionName: "registerAdapter",
    args: [adapter, sourceSchemaId, targetSchemaId],
    account: admin.account,
    chain: admin.wallet.chain!,
  });
  process.stdout.write(`    register ${label} → tx ${hash} `);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`registerAdapter(${label}) reverted (tx ${hash})`);
  }
  console.log("ok");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { mnemonic, rpcUrl } = loadEnv();
  const { publicClient, admin, chain } = buildKeyring(mnemonic, rpcUrl);

  const chainId = await publicClient.getChainId();
  if (chainId !== chain.id) {
    throw new Error(
      `RPC chainId ${chainId} doesn't match NEXT_PUBLIC_CHAIN target ${chain.id} (${chain.name})`,
    );
  }

  const addrMap = addressesByChain[chainId];
  if (!addrMap) {
    throw new Error(`No addresses configured for chainId ${chainId}`);
  }
  const adapterRegistry = addrMap.adapterRegistry;
  if (adapterRegistry === ZERO) {
    throw new Error(
      `AdapterRegistry address is zero for chainId ${chainId} — fill in addresses.ts`,
    );
  }

  // Sanity check: registry must have code.
  const code = await publicClient.getCode({ address: adapterRegistry });
  if (!code || code === "0x") {
    throw new Error(
      `No contract at AdapterRegistry ${adapterRegistry} — has Deploy.s.sol been run?`,
    );
  }

  console.log(`Seeding adapters on chainId ${chainId} (${chain.name})`);
  console.log(`  AdapterRegistry : ${adapterRegistry}`);
  console.log(`  admin           : ${admin.account.address}\n`);

  const lootSchemas = readLootSchemaIds(chainId);
  console.log(`Loot schemas (source of truth from .seeded-realms.json):`);
  for (const p of PRESETS) console.log(`  ${p.padEnd(9)} = ${lootSchemas[p]}`);
  console.log("");

  const artifacts: Record<Slot, ForgeArtifact> = {
    weapon: loadArtifact("weapon"),
    armor: loadArtifact("armor"),
  };

  // Hydrate existing state so re-runs are idempotent at slot×pair granularity.
  const doc = loadAdaptersFile();
  const existing = (doc[String(chainId)] as SeededAdaptersEntry | undefined) ?? emptyEntry();

  for (const slot of SLOTS) {
    console.log(`=== slot=${slot} ===`);
    for (const src of PRESETS) {
      for (const tgt of PRESETS) {
        if (src === tgt) continue;
        const label = `${slot} ${src}→${tgt}`;
        const prior = existing.adapters[slot][src][tgt];
        if (prior && prior !== ZERO) {
          console.log(`  skip ${label} — already at ${prior}`);
          continue;
        }
        const sourceSchemaId = lootSchemas[src];
        const targetSchemaId = lootSchemas[tgt];
        const addr = await deployAdapter(
          publicClient,
          admin,
          artifacts[slot],
          [sourceSchemaId, targetSchemaId, PRESET_ENUM[src], PRESET_ENUM[tgt]],
          label,
        );
        await registerAdapter(
          publicClient,
          admin,
          adapterRegistry,
          addr,
          sourceSchemaId,
          targetSchemaId,
          label,
        );
        existing.adapters[slot][src][tgt] = addr;
      }
    }
    console.log("");
  }

  existing.seededAt = new Date().toISOString();
  doc[String(chainId)] = existing;
  writeAdaptersFile(doc);

  console.log("=== Done ===");
  for (const slot of SLOTS) {
    for (const src of PRESETS) {
      for (const tgt of PRESETS) {
        if (src === tgt) continue;
        console.log(`  ${slot} ${src}→${tgt} : ${existing.adapters[slot][src][tgt]}`);
      }
    }
  }
  console.log(`\nWrote ${SEEDED_ADAPTERS_FILE}`);
}

main().catch((e) => {
  console.error("\nseed-adapters failed:");
  console.error(e);
  process.exit(1);
});
