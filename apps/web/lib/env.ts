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
  // Faucet (anvil only). When "true", the wallet layer auto-funds a freshly
  // connected real wallet via the `/api/faucet` route (anvil_setBalance) so a
  // brand-new MetaMask account on the local chain has ETH to sign with. The
  // `faucetEnabled` export below additionally gates this to NEXT_PUBLIC_CHAIN=anvil.
  NEXT_PUBLIC_FAUCET_ENABLED: z.enum(["true", "false"]).optional(),
  // Block-explorer base URL (Otterscan). When set, tx hashes / addresses /
  // block numbers across the UI become external links and the anvil chain
  // gains a `blockExplorers` entry (lib/chain.ts). Unset → plain text.
  // `pnpm local --explorer` sets it to the local docker Otterscan; on a VPS
  // set it to https://explorer.<domain> (see deploy/README.md).
  NEXT_PUBLIC_EXPLORER_URL: z.string().url().optional(),
  // Story AI (see `storyAiSchema` below for the server half). This public
  // mirror exists only so the client can skip the round-trip when generation
  // is off: with it unset — the default — a death renders the hand-authored
  // bank note and never touches `/api/story/*`. It is NOT the authority;
  // `storyAiEnabled()` on the server still gates every call, and the route
  // answers 200 with a bank note regardless of what the browser believes.
  NEXT_PUBLIC_STORY_AI: z.enum(["true", "false"]).optional(),
});

/**
 * True for the all-zeros key `.env.example` ships as a placeholder. Zero is
 * not a valid secp256k1 scalar — viem's `privateKeyToAccount` throws on it —
 * so catch it at env-parse time with a message that names the fix instead of
 * letting the trader routes crash on first use.
 */
export function isPlaceholderPrivateKey(key: string): boolean {
  return /^0x0{64}$/.test(key);
}

/**
 * Server-only env. Lazily parsed; never importable from a `"use client"` file.
 */
const serverSchema = z.object({
  TRADER_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/)
    .refine((key) => !isPlaceholderPrivateKey(key), {
      message:
        "TRADER_PRIVATE_KEY is the all-zeros placeholder — set a real key in apps/web/.env.local (any funded account the demo player doesn't use)",
    }),
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
  // Faucet (anvil only). RPC the server uses to call the `anvil_setBalance`
  // cheat method. Optional — falls back to REALM_SIGNER_RPC_URL at the call
  // site so existing envs don't break. Can stay 127.0.0.1 even when the
  // browser-facing NEXT_PUBLIC_RPC_URL is a LAN/public address.
  FAUCET_RPC_URL: z.string().url().optional(),
  // Target balance the faucet tops a wallet up to (wei). Default 10 ETH.
  FAUCET_AMOUNT_WEI: z
    .string()
    .regex(/^\d+$/)
    .default("10000000000000000000"),
  FAUCET_RATE_LIMIT_PER_IP_PER_10MIN: z.coerce
    .number()
    .int()
    .positive()
    .default(5),
});

/**
 * Realm-route rate limits (see `lib/server/realm-guards.ts`).
 *
 * Parsed SEPARATELY from `serverSchema` on purpose. `getServerEnv()` validates
 * the whole server surface — including `TRADER_PRIVATE_KEY`, whose all-zeros
 * placeholder is deliberately rejected — so reading the limits through it
 * would make `/api/realm/list` and `/api/realm/[address]/meta` fail on any
 * install that hasn't run `pnpm seed:trader`. Those two routes need neither a
 * trader nor a signer key today, and a rate limit must not stop working
 * because an unrelated secret is unset.
 *
 * Split write/read so UI polling of the read routes can never exhaust the
 * budget for the routes that sign transactions. The write default is
 * deliberately generous: end-of-descent fires a batch of `mint-loot` calls
 * plus one `boss-cleared`, so a single run can spend several. 60 leaves room
 * for repeated back-to-back runs while still bounding a tampered client,
 * which previously had no ceiling at all. Lower it if the demo is ever
 * fronted by a shared NAT where one IP is many players.
 */
const realmRateLimitSchema = z.object({
  REALM_WRITE_RATE_LIMIT_PER_IP_PER_10MIN: z.coerce
    .number()
    .int()
    .positive()
    .default(60),
  REALM_READ_RATE_LIMIT_PER_IP_PER_10MIN: z.coerce
    .number()
    .int()
    .positive()
    .default(300),
});

export type RealmRateLimits = z.infer<typeof realmRateLimitSchema>;

let cachedRealmRateLimits: RealmRateLimits | null = null;

/** Lazily parse the realm rate limits. Both fields have defaults, so this
 * cannot throw on a bare environment. */
export function getRealmRateLimits(): RealmRateLimits {
  if (cachedRealmRateLimits) return cachedRealmRateLimits;
  cachedRealmRateLimits = realmRateLimitSchema.parse(process.env);
  return cachedRealmRateLimits;
}

/**
 * Story AI (`/api/story/*`). Default OFF.
 *
 * Parsed SEPARATELY from `serverSchema`, for the same reason
 * `realmRateLimitSchema` is — see its docblock. `getServerEnv()` rejects the
 * all-zeros `TRADER_PRIVATE_KEY` placeholder, so reading these through it
 * would make the story routes fail on any install that hasn't run
 * `pnpm seed:trader`, which has nothing to do with narration.
 *
 * **Every field is defaulted or optional, so this cannot throw on a bare
 * environment.** That is load-bearing rather than tidy: the routes must
 * degrade to the hand-authored bank on a machine with no configuration at
 * all, and an env parse that throws would turn "no key" into a 500.
 */
const storyAiSchema = z.object({
  STORY_AI_ENABLED: z.enum(["true", "false"]).default("false"),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  /**
   * Pinned, not latest-aliased. A model swap changes the voice of every
   * epitaph, which is a content decision — it should show up in a diff.
   * Haiku is deliberate: the job is two sentences from a fixed fact list.
   */
  STORY_AI_MODEL: z.string().min(1).default("claude-haiku-4-5-20251001"),
  /**
   * Wall-clock ceiling for a single model call (ms). The player is staring at
   * a defeat overlay that already shows the bank note, so a slow answer is
   * worth less than a prompt one — this is tight on purpose.
   */
  STORY_AI_TIMEOUT_MS: z.coerce.number().int().positive().default(6000),
  /**
   * Its own budget, not the realm one. These calls cost outbound money, so
   * they must not be able to spend the ceiling that protects the routes which
   * sign transactions — and vice versa.
   */
  STORY_AI_RATE_LIMIT_PER_IP_PER_10MIN: z.coerce
    .number()
    .int()
    .positive()
    .default(30),
});

export type StoryAiEnv = z.infer<typeof storyAiSchema>;

let cachedStoryAiEnv: StoryAiEnv | null = null;

/** Lazily parse story-AI env. Cannot throw on a bare environment. */
export function getStoryAiEnv(): StoryAiEnv {
  if (cachedStoryAiEnv) return cachedStoryAiEnv;
  cachedStoryAiEnv = storyAiSchema.parse(process.env);
  return cachedStoryAiEnv;
}

/**
 * True only when generation is explicitly enabled AND a key is present.
 *
 * Two conditions, mirroring `demoMode`/`faucetEnabled`: the flag alone must
 * never be enough to attempt a call, or a half-configured deploy turns every
 * death into a wasted round-trip before falling back anyway.
 */
export function storyAiEnabled(): boolean {
  const env = getStoryAiEnv();
  return env.STORY_AI_ENABLED === "true" && !!env.ANTHROPIC_API_KEY;
}

/** Test-only: drops the memoised story-AI env so a case can re-stub it. */
export function __resetStoryAiEnv(): void {
  cachedStoryAiEnv = null;
}

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_CHAIN: process.env.NEXT_PUBLIC_CHAIN,
  NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL,
  NEXT_PUBLIC_WC_PROJECT_ID: process.env.NEXT_PUBLIC_WC_PROJECT_ID,
  NEXT_PUBLIC_PAYMASTER_URL: process.env.NEXT_PUBLIC_PAYMASTER_URL,
  NEXT_PUBLIC_PRESEED_SELLERS: process.env.NEXT_PUBLIC_PRESEED_SELLERS,
  NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE,
  NEXT_PUBLIC_DEMO_ADDRESS: process.env.NEXT_PUBLIC_DEMO_ADDRESS,
  NEXT_PUBLIC_FAUCET_ENABLED: process.env.NEXT_PUBLIC_FAUCET_ENABLED,
  // `|| undefined` so an empty string (e.g. local-up.sh without --explorer)
  // reads as "no explorer" instead of failing .url() validation.
  NEXT_PUBLIC_EXPLORER_URL: process.env.NEXT_PUBLIC_EXPLORER_URL || undefined,
  NEXT_PUBLIC_STORY_AI: process.env.NEXT_PUBLIC_STORY_AI,
});

/**
 * True only when demo mode is explicitly enabled AND the active chain is
 * anvil — guards against ever auto-connecting a mock wallet on base-sepolia.
 */
export const demoMode =
  publicEnv.NEXT_PUBLIC_DEMO_MODE === "true" &&
  publicEnv.NEXT_PUBLIC_CHAIN === "anvil";

/**
 * True only when the faucet is explicitly enabled AND the active chain is
 * anvil — guards against ever exposing the `anvil_setBalance` cheat on
 * base-sepolia. Mirrors `demoMode`.
 */
export const faucetEnabled =
  publicEnv.NEXT_PUBLIC_FAUCET_ENABLED === "true" &&
  publicEnv.NEXT_PUBLIC_CHAIN === "anvil";

/**
 * Whether the client should attempt a generated epitaph at all.
 *
 * A hint, not a gate. False (the default) means the defeat overlay renders
 * the bank note and issues no request — which is why the flag exists, since
 * the server flag isn't visible to the browser. True only means "it's worth
 * asking"; the server decides, and still answers with a bank note if it says
 * no. Nothing downstream may treat this as a promise of generated prose.
 */
export const storyAiClientHint = publicEnv.NEXT_PUBLIC_STORY_AI === "true";

/**
 * Explorer base URL without a trailing slash, or undefined when no explorer
 * is configured. Consumed by <ExplorerLink> and lib/chain.ts.
 */
export const explorerUrl = publicEnv.NEXT_PUBLIC_EXPLORER_URL?.replace(/\/+$/, "");

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
