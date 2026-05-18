import "server-only";

/**
 * Realm signer keyring.
 *
 * Four accounts derived from one BIP-39 mnemonic at the standard Ethereum
 * BIP-44 path `m/44'/60'/0'/0/{addressIndex}`:
 *
 *   - index 0 — **admin**       (holds GOVERNANCE_ROLE on SeedSBT; calls
 *                                `mintGenesis` exactly once in the seeder).
 *   - index 1 — **fantasy** realm owner   (Seed #1 consumed on createEcosystem)
 *   - index 2 — **scifi** realm owner     (Seed #2 consumed on createEcosystem)
 *   - index 3 — **cyberpunk** realm owner (Seed #3 consumed on createEcosystem)
 *
 * The 1 Seed = 1 Ecosystem invariant (EcosystemFactory.sol:130) means each
 * preset *must* have a distinct owner — admin can't own the realms or admin's
 * Seed would be spent, locking admin out of governance ceremonies that need
 * a non-Seed-holder. Three separate owners is the only configuration that
 * satisfies the invariant for a three-realm PoC.
 *
 * NEVER import this from a "use client" file. The `server-only` import
 * turns any client-bundle inclusion into a build error.
 */

import { createPublicClient, createWalletClient, http } from "viem";
import { mnemonicToAccount, type HDAccount } from "viem/accounts";
import { activeChain } from "@/lib/chain";
import { getServerEnv } from "@/lib/env";
import type { Preset } from "@/lib/engine/types";

/** BIP-44 address indices on the standard Ethereum path. */
export const KEYRING_INDEX = {
  admin: 0,
  fantasy: 1,
  scifi: 2,
  cyberpunk: 3,
} as const satisfies Record<"admin" | Preset, number>;

export type KeyringRole = keyof typeof KEYRING_INDEX;

// pnpm hoists multiple viem copies for wagmi/rainbowkit peer-dep variants
// (TS2719 "Two different types with this name exist"). Even with inferred
// `ReturnType<typeof createWalletClient>`, the resulting wallet type
// includes a `getBlock` shape that differs across copies and triggers
// TS2345 at call sites. We type the wallet/public client as `any` —
// runtime behavior is unchanged.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

type Signer = {
  account: HDAccount;
  wallet: AnyClient;
};

function build() {
  const env = getServerEnv();
  const transport = http(env.REALM_SIGNER_RPC_URL);

  const publicClient = createPublicClient({
    chain: activeChain,
    transport,
  });

  const roles: KeyringRole[] = ["admin", "fantasy", "scifi", "cyberpunk"];
  const signers = {} as Record<KeyringRole, Signer>;
  for (const role of roles) {
    const account = mnemonicToAccount(env.REALM_SIGNER_MNEMONIC, {
      addressIndex: KEYRING_INDEX[role],
    });
    const wallet = createWalletClient({
      account,
      chain: activeChain,
      transport,
    });
    signers[role] = { account, wallet };
  }

  return { publicClient, signers };
}

type Keyring = ReturnType<typeof build>;

let cached: Keyring | undefined;

function loadKeyring(): Keyring {
  if (!cached) cached = build();
  return cached;
}

/** Public client (reads). Shared across all roles — same RPC, same chain. */
export function getPublicClient() {
  return loadKeyring().publicClient;
}

/** Admin signer — holds GOVERNANCE_ROLE on SeedSBT (granted in deploy). */
export function getAdminSigner(): Signer {
  return loadKeyring().signers.admin;
}

/**
 * Realm-owner signer for `preset`. After seeding, this account owns the
 * `EcosystemTemplate` clone for the preset and is the only address that can
 * call its `onlyOwner` methods (`mintAsset`, `registerSchema`,
 * `triggerSeedMint`).
 */
export function getOwnerSigner(preset: Preset): Signer {
  return loadKeyring().signers[preset];
}

/** All four addresses (admin + 3 owners) in one shot — useful for seeder logs. */
export function listKeyringAddresses(): Record<KeyringRole, `0x${string}`> {
  const { signers } = loadKeyring();
  return {
    admin: signers.admin.account.address,
    fantasy: signers.fantasy.account.address,
    scifi: signers.scifi.account.address,
    cyberpunk: signers.cyberpunk.account.address,
  };
}

/**
 * Derive a player-realm minter delegate from the same master mnemonic
 * at BIP-44 index `index` (must be ≥ 4 — indices 0–3 are reserved for
 * admin + starter owners). The on-chain `EcosystemTemplate.setMinter`
 * flow authorizes this address; subsequent `mintAsset` calls signed by
 * this account go through the `onlyOwnerOrMinter` modifier. The realm's
 * `owner()` keeps royalty / dashboard control — the delegate can only
 * mint.
 *
 * Cached on the keyring so we don't re-derive on every mint.
 */
const playerSignerCache = new Map<number, Signer>();

export function getPlayerRealmSigner(index: number): Signer {
  if (index < 4) {
    throw new Error(
      `getPlayerRealmSigner: index ${index} is reserved (0=admin, 1..3=starter owners)`,
    );
  }
  const hit = playerSignerCache.get(index);
  if (hit) return hit;
  const env = getServerEnv();
  const transport = http(env.REALM_SIGNER_RPC_URL);
  const account = mnemonicToAccount(env.REALM_SIGNER_MNEMONIC, {
    addressIndex: index,
  });
  const wallet = createWalletClient({
    account,
    chain: activeChain,
    transport,
  });
  const signer: Signer = { account, wallet };
  playerSignerCache.set(index, signer);
  return signer;
}

/** Just the address — no wallet client. Cheap; safe to call from API
 * routes that only need to *show* the player what they're authorizing
 * before they sign `setMinter`. */
export function derivePlayerRealmSignerAddress(index: number): `0x${string}` {
  if (index < 4) {
    throw new Error(
      `derivePlayerRealmSignerAddress: index ${index} is reserved`,
    );
  }
  const env = getServerEnv();
  return mnemonicToAccount(env.REALM_SIGNER_MNEMONIC, {
    addressIndex: index,
  }).address;
}
