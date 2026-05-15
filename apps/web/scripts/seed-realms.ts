/**
 * `pnpm seed` — bootstraps the three starter realms on the active chain.
 *
 * Enforces the 1 Seed = 1 Ecosystem invariant (EcosystemFactory.sol:130)
 * by using four distinct accounts derived from one BIP-39 mnemonic:
 *
 *   index 0 — admin       (holds GOVERNANCE_ROLE on SeedSBT)
 *   index 1 — fantasy     realm owner
 *   index 2 — scifi       realm owner
 *   index 3 — cyberpunk   realm owner
 *
 * Bootstrap sequence (idempotent — re-running picks up where it left off):
 *
 *   1.  admin.SeedSBT.mintGenesis(ownerFantasy)
 *   2.  ownerFantasy.factory.createEcosystem()  → Realm1
 *       (factory auto-authorizes Realm1 on SeedSBT — EcosystemFactory.sol:146)
 *   3.  ownerFantasy.Realm1.registerSchema(clearReceipt)
 *   4.  ownerFantasy.Realm1.registerSchema(loot)
 *   5.  ownerFantasy.Realm1.triggerSeedMint(ownerScifi, stubProof)
 *   6.  ownerScifi.factory.createEcosystem()    → Realm2
 *   7.  ownerScifi.Realm2.registerSchema(clearReceipt)
 *   8.  ownerScifi.Realm2.registerSchema(loot)
 *   9.  ownerFantasy.Realm1.triggerSeedMint(ownerCyberpunk, stubProof)
 *   10. ownerCyberpunk.factory.createEcosystem() → Realm3
 *   11. ownerCyberpunk.Realm3.registerSchema(clearReceipt)
 *   12. ownerCyberpunk.Realm3.registerSchema(loot)
 *
 * After success, writes `apps/web/lib/contracts/.seeded-realms.json` so the
 * play route picks up the addresses + schema IDs on the next reload.
 *
 * Run with:
 *   pnpm seed                          # uses NEXT_PUBLIC_CHAIN from .env.local
 *
 * Required env vars (see `.env.example`):
 *   REALM_SIGNER_MNEMONIC, REALM_SIGNER_RPC_URL, NEXT_PUBLIC_CHAIN
 *
 * Prerequisites:
 *   - Sister repo deployed with `forge script Deploy.s.sol` (NOT
 *     BootstrapLocal/DeployGenesis — those mint admin's Seed and lock
 *     admin out of governance).
 *   - `pnpm wagmi:gen` run after every contract change.
 *   - The four mnemonic-derived accounts funded with native ETH for gas.
 *     Anvil's default test mnemonic pre-funds indices 0..9.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  http,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { mnemonicToAccount, type HDAccount } from "viem/accounts";

// pnpm hoists multiple viem copies for wagmi/rainbowkit peer-dep variants
// (TS2719 "Two different types with this name exist"). Even with inferred
// `ReturnType<typeof createPublicClient>`, passing that client across a
// function boundary makes TS pick the "wrong" copy's `getBlock` return
// type and emit TS2345. We type the cross-boundary params as `any` —
// runtime behavior is unchanged; the seeder only ever sees the one client
// built in `buildKeyring`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PublicClientT = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WalletClientT = any;

import {
  ecosystemFactoryAbi,
  ecosystemTemplateAbi,
  seedSbtAbi,
} from "@abis/generated";
import { addressesByChain } from "../lib/contracts/addresses";
import { activeChain } from "../lib/chain";
import { SCHEMAS, SCHEMA_ORDER, type SchemaKey } from "../lib/contracts/schemas";
import { buildSeederStubProof } from "../lib/contracts/proof-stub";

// ---------------------------------------------------------------------------
// Inline ABI fragments for contract methods that aren't in the generated
// ABI yet (the sister-repo `EcosystemFactory.ecosystemOf` field and
// `SeedSBT.mintGenesis`/`genesisClaimed`). Re-running `pnpm wagmi:gen`
// after the next contract rebuild will absorb these; they're kept here so
// the seeder works without that step.
// ---------------------------------------------------------------------------
const seedSbtExtraAbi = parseAbi([
  "function mintGenesis(address founder)",
  "function genesisClaimed() view returns (bool)",
]);

const factoryExtraAbi = parseAbi([
  "function ecosystemOf(address) view returns (address)",
]);

// ---------------------------------------------------------------------------
// Keyring
// ---------------------------------------------------------------------------

type Role = "admin" | "fantasy" | "scifi" | "cyberpunk";
const ROLE_INDEX: Record<Role, number> = {
  admin: 0,
  fantasy: 1,
  scifi: 2,
  cyberpunk: 3,
};
const PRESETS = ["fantasy", "scifi", "cyberpunk"] as const;
type Preset = (typeof PRESETS)[number];

type Signer = { account: HDAccount; wallet: WalletClientT };

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

function buildKeyring(mnemonic: string, rpcUrl: string) {
  const transport = http(rpcUrl);
  const chain = activeChain;
  const publicClient = createPublicClient({ chain, transport });

  const signers = {} as Record<Role, Signer>;
  for (const role of Object.keys(ROLE_INDEX) as Role[]) {
    const account = mnemonicToAccount(mnemonic, {
      addressIndex: ROLE_INDEX[role],
    });
    const wallet = createWalletClient({ account, chain, transport });
    signers[role] = { account, wallet };
  }

  return { publicClient, signers, chain };
}

// ---------------------------------------------------------------------------
// State readers
// ---------------------------------------------------------------------------

async function readEcosystemOf(
  publicClient: PublicClientT,
  factory: Address,
  owner: Address,
): Promise<Address> {
  return (await publicClient.readContract({
    address: factory,
    abi: factoryExtraAbi,
    functionName: "ecosystemOf",
    args: [owner],
  })) as Address;
}

async function readHasSeed(
  publicClient: PublicClientT,
  seedSBT: Address,
  who: Address,
): Promise<boolean> {
  return (await publicClient.readContract({
    address: seedSBT,
    abi: seedSbtAbi,
    functionName: "hasSeed",
    args: [who],
  })) as boolean;
}

async function readGenesisClaimed(
  publicClient: PublicClientT,
  seedSBT: Address,
): Promise<boolean> {
  return (await publicClient.readContract({
    address: seedSBT,
    abi: seedSbtExtraAbi,
    functionName: "genesisClaimed",
  })) as boolean;
}

/** Recovers prior schema IDs by scanning SchemaRegistered logs on `realm`. */
async function readRegisteredSchemas(
  publicClient: PublicClientT,
  realm: Address,
): Promise<bigint[]> {
  const logs = await publicClient.getContractEvents({
    address: realm,
    abi: ecosystemTemplateAbi,
    eventName: "SchemaRegistered",
    fromBlock: 0n,
    toBlock: "latest",
  });
  // `logs` is `any[]` because `publicClient` was widened to `any` to dodge
  // viem multi-copy TS2719 errors (see top of file).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (logs as any[]).map((log) => {
    const args = log.args as { schemaId?: bigint };
    if (args.schemaId === undefined) {
      throw new Error(`SchemaRegistered log missing schemaId at ${log.transactionHash}`);
    }
    return args.schemaId;
  });
}

// ---------------------------------------------------------------------------
// Transaction helpers
// ---------------------------------------------------------------------------

async function send(
  publicClient: PublicClientT,
  txPromise: Promise<Hex>,
  label: string,
): Promise<Hex> {
  const hash = await txPromise;
  process.stdout.write(`    tx ${hash} — `);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`${label} reverted (tx ${hash})`);
  }
  console.log("ok");
  return hash;
}

/**
 * Calls `factory.createEcosystem` from `owner` and returns the clone
 * address parsed out of the `EcosystemCreated` event.
 */
async function createEcosystem(
  publicClient: PublicClientT,
  ownerSigner: Signer,
  factory: Address,
): Promise<Address> {
  const hash = await ownerSigner.wallet.writeContract({
    address: factory,
    abi: ecosystemFactoryAbi,
    functionName: "createEcosystem",
    account: ownerSigner.account,
    chain: ownerSigner.wallet.chain!,
  });
  process.stdout.write(`    tx ${hash} — `);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`createEcosystem reverted (tx ${hash})`);
  }
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== factory.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: ecosystemFactoryAbi,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (decoded.eventName === "EcosystemCreated") {
        const args = decoded.args as { ecosystem?: Address; clone?: Address };
        const clone = args.ecosystem ?? args.clone;
        if (clone) {
          console.log(`ok → ${clone}`);
          return clone;
        }
      }
    } catch {
      // Not the event we want.
    }
  }
  throw new Error("createEcosystem succeeded but EcosystemCreated event not found");
}

async function registerSchema(
  publicClient: PublicClientT,
  ownerSigner: Signer,
  realm: Address,
  key: SchemaKey,
): Promise<bigint> {
  const def = SCHEMAS[key];
  const hash = await ownerSigner.wallet.writeContract({
    address: realm,
    abi: ecosystemTemplateAbi,
    functionName: "registerSchema",
    args: [def.name, def.metadataURI, def.fields],
    account: ownerSigner.account,
    chain: ownerSigner.wallet.chain!,
  });
  process.stdout.write(`    tx ${hash} — `);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`registerSchema(${key}) reverted (tx ${hash})`);
  }
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== realm.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: ecosystemTemplateAbi,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (decoded.eventName === "SchemaRegistered") {
        const args = decoded.args as { schemaId?: bigint };
        if (args.schemaId !== undefined) {
          console.log(`ok → schemaId ${args.schemaId}`);
          return args.schemaId;
        }
      }
    } catch {
      // Not the event we want.
    }
  }
  throw new Error(`registerSchema(${key}) succeeded but SchemaRegistered event not found`);
}

// ---------------------------------------------------------------------------
// JSON output
// ---------------------------------------------------------------------------

const SEEDED_FILE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "lib",
  "contracts",
  ".seeded-realms.json",
);

type SchemaPair = { clearReceipt: string; loot: string };
type SeededEntry = {
  realms: Record<Preset, string>;
  schemas: Record<Preset, SchemaPair>;
  seededAt: string | null;
};

function loadSeededFile(): Record<string, SeededEntry | { $schema: string } | undefined> {
  return JSON.parse(readFileSync(SEEDED_FILE, "utf-8")) as Record<
    string,
    SeededEntry | { $schema: string } | undefined
  >;
}

function writeSeededFile(
  doc: Record<string, SeededEntry | { $schema: string } | undefined>,
): void {
  writeFileSync(SEEDED_FILE, JSON.stringify(doc, null, 2) + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { mnemonic, rpcUrl } = loadEnv();
  const { publicClient, signers, chain } = buildKeyring(mnemonic, rpcUrl);

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
  const seedSBT = addrMap.seedSBT;
  const factory = addrMap.ecosystemFactory;

  console.log(`Seeding chainId ${chainId} (${chain.name})`);
  console.log(`  SeedSBT          : ${seedSBT}`);
  console.log(`  EcosystemFactory : ${factory}`);
  console.log(`  admin            : ${signers.admin.account.address}`);
  for (const preset of PRESETS) {
    console.log(`  owner.${preset.padEnd(9)}: ${signers[preset].account.address}`);
  }
  console.log("");

  // Sanity check: deploy must have happened. If the factory address is the
  // zero address or has no code, abort with a clear message.
  const factoryCode = await publicClient.getCode({ address: factory });
  if (!factoryCode || factoryCode === "0x") {
    throw new Error(
      `No contract at EcosystemFactory address ${factory} — has Deploy.s.sol been run?`,
    );
  }

  // Pre-flight state
  const genesisClaimed = await readGenesisClaimed(publicClient, seedSBT);
  console.log(`Pre-flight: genesisClaimed = ${genesisClaimed}`);

  const realmsOut: Record<Preset, Address> = {
    fantasy: "0x0000000000000000000000000000000000000000",
    scifi: "0x0000000000000000000000000000000000000000",
    cyberpunk: "0x0000000000000000000000000000000000000000",
  };
  const schemasOut: Record<Preset, { clearReceipt: bigint; loot: bigint }> = {
    fantasy: { clearReceipt: 0n, loot: 0n },
    scifi: { clearReceipt: 0n, loot: 0n },
    cyberpunk: { clearReceipt: 0n, loot: 0n },
  };

  for (const preset of PRESETS) {
    console.log(`\n=== ${preset} ===`);
    const owner = signers[preset];
    const ownerAddr = owner.account.address;

    // ---- Step A: ensure Owner has a Seed ----
    let hasSeed = await readHasSeed(publicClient, seedSBT, ownerAddr);
    if (hasSeed) {
      console.log(`  [A] owner already holds a Seed — skip`);
    } else if (preset === "fantasy") {
      if (genesisClaimed) {
        throw new Error(
          "fantasy owner has no Seed but genesisClaimed=true — admin spent the genesis Seed elsewhere. " +
            "Re-deploy or pick a different mnemonic.",
        );
      }
      console.log(`  [A] admin.SeedSBT.mintGenesis(${ownerAddr})`);
      await send(
        publicClient,
        signers.admin.wallet.writeContract({
          address: seedSBT,
          abi: seedSbtExtraAbi,
          functionName: "mintGenesis",
          args: [ownerAddr],
          account: signers.admin.account,
          chain: signers.admin.wallet.chain!,
        }),
        "mintGenesis",
      );
    } else {
      // Pick a prior realm — Realm1 (fantasy) is always usable since it was
      // auto-authorized by `createEcosystem`'s `addAuthorizedEcosystem(clone)`
      // call (EcosystemFactory.sol:146).
      const minterRealm = realmsOut.fantasy;
      if (minterRealm === "0x0000000000000000000000000000000000000000") {
        throw new Error(
          `Cannot mint Seed for ${preset} owner — fantasy realm is not yet created`,
        );
      }
      const stub = buildSeederStubProof(
        ownerAddr,
        BigInt(PRESETS.indexOf(preset)),
        BigInt(Math.floor(Date.now() / 1000)),
      );
      console.log(
        `  [A] ownerFantasy.Realm1.triggerSeedMint(${ownerAddr}, stub)`,
      );
      await send(
        publicClient,
        signers.fantasy.wallet.writeContract({
          address: minterRealm,
          abi: ecosystemTemplateAbi,
          functionName: "triggerSeedMint",
          args: [ownerAddr, stub],
          account: signers.fantasy.account,
          chain: signers.fantasy.wallet.chain!,
        }),
        "triggerSeedMint",
      );
    }

    hasSeed = await readHasSeed(publicClient, seedSBT, ownerAddr);
    if (!hasSeed) throw new Error(`Step A finished but ${preset} owner still has no Seed`);

    // ---- Step B: ensure Owner has created their Ecosystem ----
    let realm = await readEcosystemOf(publicClient, factory, ownerAddr);
    if (realm !== "0x0000000000000000000000000000000000000000") {
      console.log(`  [B] owner already created realm at ${realm} — skip`);
    } else {
      console.log(`  [B] owner.factory.createEcosystem()`);
      realm = await createEcosystem(publicClient, owner, factory);
    }
    realmsOut[preset] = realm;

    // ---- Step C: ensure schemas registered ----
    const existing = await readRegisteredSchemas(publicClient, realm);
    if (existing.length >= SCHEMA_ORDER.length) {
      console.log(
        `  [C] schemas already registered (${existing.length}) — reuse [${existing.join(", ")}]`,
      );
      schemasOut[preset] = {
        clearReceipt: existing[0]!,
        loot: existing[1]!,
      };
    } else {
      const ids: bigint[] = [...existing];
      for (let i = existing.length; i < SCHEMA_ORDER.length; i++) {
        const key = SCHEMA_ORDER[i]!;
        console.log(`  [C] owner.realm.registerSchema(${key})`);
        ids.push(await registerSchema(publicClient, owner, realm, key));
      }
      schemasOut[preset] = {
        clearReceipt: ids[0]!,
        loot: ids[1]!,
      };
    }
  }

  // ---- Write .seeded-realms.json ----
  // Schema IDs come from the global SchemaRegistry counter, so each realm
  // has its own pair (fantasy={1,2}, scifi={3,4}, cyberpunk={5,6}). The
  // JSON stores the pair per-preset so consumers can filter `AssetMinted`
  // events with the correct schemaId for the realm they're querying.
  const doc = loadSeededFile();
  doc[String(chainId)] = {
    realms: {
      fantasy: realmsOut.fantasy,
      scifi: realmsOut.scifi,
      cyberpunk: realmsOut.cyberpunk,
    },
    schemas: {
      fantasy: {
        clearReceipt: schemasOut.fantasy.clearReceipt.toString(),
        loot: schemasOut.fantasy.loot.toString(),
      },
      scifi: {
        clearReceipt: schemasOut.scifi.clearReceipt.toString(),
        loot: schemasOut.scifi.loot.toString(),
      },
      cyberpunk: {
        clearReceipt: schemasOut.cyberpunk.clearReceipt.toString(),
        loot: schemasOut.cyberpunk.loot.toString(),
      },
    },
    seededAt: new Date().toISOString(),
  };
  writeSeededFile(doc);

  console.log("\n=== Seeded ===");
  for (const preset of PRESETS) {
    const s = schemasOut[preset];
    console.log(
      `  ${preset.padEnd(9)} realm=${realmsOut[preset]} schemas={clearReceipt=${s.clearReceipt}, loot=${s.loot}}`,
    );
  }
  console.log(`\nWrote ${SEEDED_FILE}`);
}

main().catch((e) => {
  console.error("\nSeeder failed:");
  console.error(e);
  process.exit(1);
});
