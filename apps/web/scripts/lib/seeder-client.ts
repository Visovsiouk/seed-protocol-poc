/**
 * Shared env + viem keyring bootstrap for the seed scripts
 * (`seed-realms`, `seed-adapters`, `seed-catalog-effects`). Node-only —
 * never imported by app code.
 *
 * All signers derive from the single `REALM_SIGNER_MNEMONIC`:
 * admin @ index 0, the three founding-realm owners @ indices 1–3
 * (mirrors `lib/server/realm-signer.ts`).
 */

import { createPublicClient, createWalletClient, http } from "viem";
import { mnemonicToAccount, type HDAccount } from "viem/accounts";

import { activeChain } from "../../lib/chain";

// pnpm hoists multiple viem copies for wagmi/rainbowkit peer-dep variants
// (TS2719 "Two different types with this name exist"). Even with inferred
// `ReturnType<typeof createPublicClient>`, passing that client across a
// function boundary makes TS pick the "wrong" copy's `getBlock` return
// type and emit TS2345. We type the cross-boundary params as `any` —
// runtime behavior is unchanged; the seeders only ever see the one client
// built in `buildSeederClients`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PublicClientT = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WalletClientT = any;

export type Signer = { account: HDAccount; wallet: WalletClientT };

export function loadSeederEnv(): { mnemonic: string; rpcUrl: string } {
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

/**
 * One public client on the active chain plus a `signerAt(addressIndex)`
 * factory for wallet clients derived from the seeder mnemonic.
 */
export function buildSeederClients() {
  const { mnemonic, rpcUrl } = loadSeederEnv();
  const transport = http(rpcUrl);
  const chain = activeChain;
  const publicClient: PublicClientT = createPublicClient({ chain, transport });

  const signerAt = (addressIndex: number): Signer => {
    const account = mnemonicToAccount(mnemonic, { addressIndex });
    const wallet = createWalletClient({ account, chain, transport });
    return { account, wallet };
  };

  return { publicClient, signerAt, chain };
}

/** Refuse to seed against an RPC that isn't the configured chain. */
export async function assertChainId(
  publicClient: PublicClientT,
  chain: { id: number; name: string },
): Promise<void> {
  const chainId = await publicClient.getChainId();
  if (chainId !== chain.id) {
    throw new Error(
      `RPC chainId ${chainId} doesn't match NEXT_PUBLIC_CHAIN target ${chain.id} (${chain.name})`,
    );
  }
}
