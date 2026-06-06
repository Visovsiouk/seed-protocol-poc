import { z } from "zod";

/**
 * Public env (browser-visible). All NEXT_PUBLIC_* vars must be statically
 * referenced at build time for Next.js to inline them.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_CHAIN: z.enum(["base-sepolia", "anvil"]),
  NEXT_PUBLIC_RPC_URL: z.string().url(),
  // Optional: only required when the WalletConnect connector is re-enabled
  // (see WalletProvider.tsx). Leave unset for anvil dev.
  NEXT_PUBLIC_WC_PROJECT_ID: z.string().optional(),
  NEXT_PUBLIC_PAYMASTER_URL: z.string().url().optional(),
  // Comma-separated `0x...` addresses whose listings are flagged as
  // "Genesis liquidity" (pre-seed). Set to the dev wallet that runs
  // SeedBazaar.s.sol. Optional — without it everything is "Player-listed".
  NEXT_PUBLIC_PRESEED_SELLERS: z.string().optional(),
  // Demo mode (anvil only). When "true", the wallet layer auto-connects a
  // wagmi `mock` connector to a default anvil account so the whole game is
  // playable without a browser extension. See WalletProvider.tsx. The
  // `demoMode` export below additionally gates this to NEXT_PUBLIC_CHAIN=anvil.
  NEXT_PUBLIC_DEMO_MODE: z.enum(["true", "false"]).optional(),
  // Optional override for the demo player address. Must be one of anvil's
  // unlocked default accounts (it signs server-side). Defaults to anvil
  // account #9 in WalletProvider.tsx.
  NEXT_PUBLIC_DEMO_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .optional(),
});

/**
 * Server-only env. Lazily parsed; never importable from a `"use client"` file.
 */
const serverSchema = z.object({
  TRADER_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  TRADER_RPC_URL: z.string().url(),
  TRADER_FLOAT_MIN_WEI: z.string().regex(/^\d+$/),
  TRADER_MAX_BUY_WEI: z.string().regex(/^\d+$/).default("200000000000000000"),
  TRADER_RATE_LIMIT_PER_IP_PER_10MIN: z.coerce.number().int().positive().default(10),
  // Realm signer keyring. One BIP-39 mnemonic; admin@m/44'/60'/0'/0/0,
  // realm owners at indices 1/2/3 (one per preset — each owner's Seed is spent
  // when they call `createEcosystem`, enforcing the 1 Seed = 1 Ecosystem
  // invariant). See `lib/server/realm-signer.ts`.
  REALM_SIGNER_MNEMONIC: z.string().min(1),
  REALM_SIGNER_RPC_URL: z.string().url(),
});

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_CHAIN: process.env.NEXT_PUBLIC_CHAIN,
  NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL,
  NEXT_PUBLIC_WC_PROJECT_ID: process.env.NEXT_PUBLIC_WC_PROJECT_ID,
  NEXT_PUBLIC_PAYMASTER_URL: process.env.NEXT_PUBLIC_PAYMASTER_URL,
  NEXT_PUBLIC_PRESEED_SELLERS: process.env.NEXT_PUBLIC_PRESEED_SELLERS,
  NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE,
  NEXT_PUBLIC_DEMO_ADDRESS: process.env.NEXT_PUBLIC_DEMO_ADDRESS,
});

/**
 * True only when demo mode is explicitly enabled AND the active chain is
 * anvil — guards against ever auto-connecting a mock wallet on base-sepolia.
 */
export const demoMode =
  publicEnv.NEXT_PUBLIC_DEMO_MODE === "true" &&
  publicEnv.NEXT_PUBLIC_CHAIN === "anvil";

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

let cachedServerEnv: ServerEnv | null = null;

/**
 * Lazily parse server-only env. Throws if called from a client bundle
 * (because the variables won't be present).
 */
export function getServerEnv(): ServerEnv {
  if (cachedServerEnv) return cachedServerEnv;
  cachedServerEnv = serverSchema.parse(process.env);
  return cachedServerEnv;
}
