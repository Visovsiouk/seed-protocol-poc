# Realms (Seed Protocol PoC)

This Next.js and wagmi web app exercises the Seed Protocol contracts: ERC-1155
`UniversalAsset`, `ProtocolExchange`, `EmissionController`, `SeedSBT`, the
per-preset `EcosystemTemplate` clones, and the cross-realm adapter and
catalog-effect registries. It is a playable, end-to-end demo of the protocol on
a local anvil chain. The demo covers the royalty-routed bazaar, Seed-gated realm
creation, and the emission engine. It has a direct migration path to
base-sepolia.

It is a **deterministic dice-driven text RPG** with three genre presets
(Fantasy, Sci-Fi, Cyberpunk). A player clears the three founding realms to earn
a soulbound **Seed**. The Seed unlocks the right to author their own realm. Each
realm mints loot under its own provenance. Players trade the loot on a shared
bazaar with perpetual creator royalties, and adapters translate it across
presets.

> Contracts live in a sibling repo (`../seed-protocol`). This repo holds the
> frontend, the server-side helpers, and the cross-realm adapter Foundry project
> (`contracts/`).

Two ways to run it, one command each:

```bash
pnpm local                       # LOCAL: full dev stack — anvil + contracts + seeders + app
                                 # (see “Local development”; needs the sibling repo cloned)
sudo bash scripts/server-up.sh   # SERVER: all VPS services under systemd, incl. the
                                 # Otterscan explorer (see “Server deployment” + deploy/)
```

## Stack

- Next.js 15 (App Router) + React 19
- wagmi v2 + viem v2 (workspace-pinned to `2.48.11`) + RainbowKit v2.2 (`getDefaultConfig`)
- `burner-connector` for the in-browser play-instantly wallet (anvil only)
- TanStack Query v5 for client cache
- Tailwind v4 + tailwind-variants + `framer-motion` for styling/motion
- Zod for runtime env + request validation
- `better-sqlite3` for the off-chain realm registry. `obscenity` to profanity-gate realm names
- Vitest for unit tests (Playwright wired for future e2e)
- Foundry (`contracts/`) for the 12 cross-realm adapters + catalog-effect registry
- Node ≥ 22.13, pnpm 11 workspaces (`apps/*`, `packages/*`)

## Contracts

Nine core contracts. The sibling repo deploys them, and the address book lives in
[`apps/web/lib/contracts/addresses.ts`](apps/web/lib/contracts/addresses.ts).
The frontend always calls the UUPS proxies, never implementations:

| Contract | Role |
| --- | --- |
| `SeedSBT` | Soulbound Seed token. `admin` holds `GOVERNANCE_ROLE` and calls `mintGenesis` once to bootstrap the founding realms. Players later mint their own via `/api/realm/claim-seed`. |
| `EcosystemFactory` | `createEcosystem` clones a realm. It enforces the **1 Seed = 1 Ecosystem** invariant (it spends the caller's Seed). |
| `EcosystemRegistry` | Index of every deployed realm clone. |
| `EcosystemTemplate` | Per-realm clone (impl behind proxies). Emits `BossClearEvent` and `AssetMinted`. Owner-gated `mintAsset` / `registerSchema` / `triggerSeedMint` / `setMinter`. |
| `UniversalAsset` | Single ERC-1155 that holds all loot across every realm (provenance in tokenId). |
| `ProtocolExchange` | Royalty-routed bazaar: `list` / `purchase` / `cancel`. |
| `SchemaRegistry` | Loot schemas (weapon/armor type, tier, effects), 2 per starter preset. |
| `AdapterRegistry` | Permissionless registry of the 12 cross-realm adapters. |
| `EmissionController` | Loot drop rates + mint caps. |

The cross-realm layer lives in this repo's Foundry project ([`contracts/`](contracts),
Solidity 0.8.24). It has **12 adapters** (6 weapon + 6 armor, every ordered pair
of the three presets) plus a `CatalogEffectRegistry`. Chain provisioning seeds
them during `pnpm local` (`pnpm --filter web seed:adapters` / `seed:catalog`).

## How it works

**The deploy model turns on server-signed versus user-signed flows.** The
player's wallet is mostly an *identity*. A keyring derived from
`REALM_SIGNER_MNEMONIC` signs most state-changing game actions server-side, so a
player needs no gas for normal play. Only realm *creation* asks the user to sign
and broadcast real transactions.

| Flow | Signed by | Route |
| --- | --- | --- |
| Boss clear → `BossCleared` receipt | realm-signer keyring (server) | `POST /api/realm/boss-cleared` |
| Loot mint | realm-signer keyring (server) | `POST /api/realm/mint-loot` |
| `SeedSBT` mint (Seed claim) | realm-signer keyring (server) | `POST /api/realm/claim-seed` |
| Realm registration (off-chain index) | server | `POST /api/realm/register` |
| Wandering Trader buy/list/cancel | trader burner EOA (server) | `POST /api/trader/*` |
| Hail the Trader (one fair-priced buy per seller) | trader burner EOA (server) | `POST /api/trader/hail` |
| Faucet top-up (`anvil_setBalance`) | server cheat call | `POST /api/faucet` |
| **Realm creation (Founding Rite)** | **the user's own wallet** | `/create` page (4 txs) |

The realm-signer keyring (`apps/web/lib/server/realm-signer.ts`) derives four
kinds of signer from the single `REALM_SIGNER_MNEMONIC`: admin at index 0, the
three founding-realm owners at indices 1–3, and player-realm delegate signers at
indices 4+. The default Anvil test mnemonic derives Anvil's deterministic
accounts 0..3, so it works locally with no setup.

The app reconstructs Seed eligibility purely from on-chain `BossClearEvent`s. A
player is eligible after they clear all three founding (starter) realms and do
not already hold a Seed. See
[`apps/web/lib/tutorial/progress.ts`](apps/web/lib/tutorial/progress.ts). At claim
time, [`/api/realm/claim-seed`](apps/web/app/api/realm/claim-seed/route.ts) does not
trust the client. It rescans `AssetMinted` events itself to rebuild the proof
before the server signs the `SeedSBT` mint.

### The deterministic engine

Play is a **deterministic dice RPG** ([`apps/web/lib/engine/`](apps/web/lib/engine)):

- **Three presets** (fantasy / sci-fi / cyberpunk), each with its own 6-value
  element vocabulary (fantasy: fire/ice/shock/holy/unholy/none, and so on). Loot
  and gear translate across genres through the on-chain adapters.
- **Two-button combat.** Every turn is *Attack* vs a *Secondary* action that
  varies by equipped armor (Dodge / Brace / Steady / Reflect / Focus). Round order
  is preTurn → player → monster → postTurn → boss-phase check. Elemental matchups
  apply a 1.5× weakness / 0.5× resist multiplier.
- **Seeded RNG.** All randomness flows through a deterministic **sfc32** generator
  (128-bit state, no `Math.random()` anywhere). It is seeded from
  `keccak256(playerAddr ‖ blockhash ‖ encounterId)`. Same seed, same run, on any
  machine or tab. See [`apps/web/lib/engine/rng.ts`](apps/web/lib/engine/rng.ts).
- **Tiers T1–T5.** Weapons scale d4→d12 (+0→+4 to-hit/damage). Armor scales
  +1/+5 HP → +5/+50 HP, uniform across presets, so adapters map without a balance
  audit ([`apps/web/lib/engine/tier.ts`](apps/web/lib/engine/tier.ts)). Starter
  realms cap at **T3** (boss depth 3). Player-made realms earn their ceiling from
  distinct clearers: T3 base, **T4 @ 20**, **T5 @ 50**
  ([`apps/web/lib/reads/realm-tier.ts`](apps/web/lib/reads/realm-tier.ts)).

## Environment

[`apps/web/lib/env.ts`](apps/web/lib/env.ts) validates the environment with Zod.
For local dev there is nothing to do. `pnpm local` creates `apps/web/.env.local`
from [`apps/web/.env.example`](apps/web/.env.example) automatically, and it never
overwrites an existing one. Edit it only to change the defaults. Server
deployments set it by hand ([`deploy/README.md`](deploy/README.md) §2). You can
never import server-only vars from a `"use client"` module.

| Var | Scope | Required | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_CHAIN` | client | yes | `anvil` or `base-sepolia` |
| `NEXT_PUBLIC_RPC_URL` | client | yes | Browser-reachable RPC for the active chain |
| `NEXT_PUBLIC_DEMO_MODE` | client | no | `true` auto-connects a mock wallet (anvil only) |
| `NEXT_PUBLIC_DEMO_ADDRESS` | client | no | Override demo player (an unlocked anvil account) |
| `NEXT_PUBLIC_FAUCET_ENABLED` | client | no | `true` auto-funds a fresh real wallet (anvil only) |
| `NEXT_PUBLIC_PRESEED_SELLERS` | client | no | Comma-separated addresses tagged "Genesis liquidity" |
| `NEXT_PUBLIC_PAYMASTER_URL` | client | no | Paymaster (base-sepolia only) |
| `NEXT_PUBLIC_WC_PROJECT_ID` | client | no | Reserved for WalletConnect (currently stubbed) |
| `NEXT_PUBLIC_EXPLORER_URL` | client | no | Block-explorer base URL (Otterscan). When set, tx/address/block references in the UI become links and the anvil chain gains `blockExplorers`. `pnpm local --explorer` sets it automatically. On a VPS use `https://explorer.<domain>` |
| `REALM_SIGNER_MNEMONIC` | server | yes | BIP-39 mnemonic for the realm-signer keyring (admin + realm owners + delegates) |
| `REALM_SIGNER_RPC_URL` | server | yes | RPC the realm signers broadcast against |
| `TRADER_PRIVATE_KEY` | server | yes | Wandering Trader burner EOA |
| `TRADER_RPC_URL` | server | yes | RPC the trader signs against |
| `TRADER_FLOAT_MIN_WEI` | server | yes | Trader refuses to act below this balance |
| `TRADER_MAX_BUY_WEI` | server | no | Hard cap per buy (default 0.2 ETH) |
| `TRADER_RATE_LIMIT_PER_IP_PER_10MIN` | server | no | Trader per-IP rate limit (default 10) |
| `FAUCET_RPC_URL` | server | no | RPC for `anvil_setBalance`. Falls back to `REALM_SIGNER_RPC_URL`. May stay `127.0.0.1` even when the public RPC is a LAN address |
| `FAUCET_AMOUNT_WEI` | server | no | Balance the faucet tops up to (default 10 ETH) |
| `FAUCET_RATE_LIMIT_PER_IP_PER_10MIN` | server | no | Faucet per-IP rate limit (default 5) |

`NEXT_PUBLIC_DEMO_MODE` and `NEXT_PUBLIC_FAUCET_ENABLED` take effect only when
`NEXT_PUBLIC_CHAIN=anvil`. The `demoMode`/`faucetEnabled` exports in `env.ts`
hard-gate them. The mock wallet and the `anvil_setBalance` cheat can therefore
never reach base-sepolia.

## Local development

### Prerequisites

- Node ≥ 22.13, pnpm 11
- Foundry (`anvil` + `forge`) for the sibling contracts repo + this repo's adapters
- The sibling `../seed-protocol` contracts repo (override with `SISTER_REPO=...`)
- A browser wallet for the real-wallet flow (MetaMask, Rabby, Frame, or Brave).
  Or just use demo / the in-browser burner

### Quick start: one command

```bash
pnpm local            # prompts: demo (mock wallet) vs real wallet
pnpm local --demo     # non-interactive: anvil mock wallet (AI / CI testing)
pnpm local --wallet   # non-interactive: real RainbowKit wallet
pnpm local --clean    # wipe the chain + game db first (fresh provisioning)
pnpm local --explorer # + Otterscan block explorer at :5100 (needs Docker)
```

[`scripts/local-up.sh`](scripts/local-up.sh) starts the **entire stack**
from a fresh clone with zero manual setup:

1. Creates `apps/web/.env.local` from `.env.example` if missing (the defaults
   are fully local-viable: anvil test mnemonic, loopback RPCs).
2. Starts [`scripts/chain-up.sh`](scripts/chain-up.sh) on `127.0.0.1`. The
   **first run** deploys the sister repo's core protocol and runs every seeder
   (realms, adapters, catalog, trader). This takes a few minutes. Later runs
   reload the persisted chain state in seconds, so your Seeds/realms/balances
   survive restarts.
3. Starts the Next.js dev server (hot reload) in the chosen wallet mode.

`Ctrl+C` stops both the dev server and anvil (it dumps state first). There is no
default wallet mode. On a terminal it asks. Non-interactive sessions must pass
`--demo` or `--wallet`.

With `--explorer` (requires Docker), an Otterscan container runs at
<http://localhost:5100> against the local anvil. Anvil natively serves
Otterscan's `ots_*` API. The run also sets `NEXT_PUBLIC_EXPLORER_URL`, so every
tx hash / address in the app UI links to the explorer.

Then open <http://localhost:3000>. In `--wallet` mode the ConnectWizard offers
**Play instantly** (in-browser burner, auto-funded) or **Use your own wallet**
(it adds the Anvil network and switches to it). `--demo` auto-connects a mock
anvil wallet, so you can test the whole game with no extension at all.

## Server deployment

The VPS runs **all** production services under systemd, behind Caddy TLS. These
are the demo chain, the Next.js app, the JSON-RPC allowlist proxy, the Otterscan
block explorer, and nightly state backups. After the one-time configuration in
[`deploy/README.md`](deploy/README.md) (fresh chain keys, `.env.local`,
domains), the whole stack is one idempotent command:

```bash
sudo bash scripts/server-up.sh            # checks, units, start, status summary
sudo bash scripts/server-up.sh --app      # after git pull: rebuild + restart the app only
sudo bash scripts/server-up.sh --check    # prerequisite checks only
```

[`scripts/server-up.sh`](scripts/server-up.sh) verifies prerequisites,
installs or refreshes the systemd units, wires the explorer, restarts the
stateless services, and prints a per-service status report with `journalctl`
hints. It derives the explorer RPC URL from `NEXT_PUBLIC_RPC_URL`, so there is
nothing extra to configure. It **never restarts the chain**, so players' Seeds,
realms, and balances survive every deploy. Manage faults with plain systemd:
`systemctl status realms-chain`, `journalctl -fu realms-app`, and so on.

<details>
<summary><b>Advanced: trusted-LAN setup without systemd/Caddy</b></summary>

The internal layers still run standalone. `bash scripts/chain-up.sh` starts
the long-lived chain (anvil on `ANVIL_HOST`, default `0.0.0.0`, persistent
state, first-run deploy+seed). `bash scripts/app-up.sh` builds and serves
the app on `APP_HOST:APP_PORT`. Point `NEXT_PUBLIC_RPC_URL` at the host's LAN
address. Only do this on a **trusted** network. Bare anvil exposes cheat
methods (see Security notes).

</details>

### Security notes

- **Anvil is an unauthenticated dev node**, and the faucet exposes the
  `anvil_setBalance` cheat. Only expose RPC `8545` to a **trusted** network or
  behind a reverse proxy. Never expose it to the open internet.
- `REALM_SIGNER_MNEMONIC` controls minting and the admin role. Treat it as a
  secret even on local chains. Rotate away from the public Anvil test mnemonic
  for anything beyond a throwaway demo.
- **Vercel / serverless does not fit this model.** It needs a long-lived
  anvil node plus a co-located server signer. The base-sepolia migration target
  (real testnet RPC, paymaster-sponsored txs) is the intended path off local
  anvil. That work is not yet built.

## Scripts

There are two entry points. Everything else is a quality gate or internal plumbing:

```bash
# Entry points
pnpm local                      # LOCAL: full dev stack (anvil + deploy + seed + dev server)
                                #   flags: --demo | --wallet | --clean
sudo bash scripts/server-up.sh  # SERVER: all VPS services under systemd (see deploy/README.md)
                                #   flags: --app | --check | --no-explorer

# Quality gates (same as CI)
pnpm typecheck                  # tsc --noEmit across the workspace
pnpm test                       # vitest run (all packages)
pnpm --filter web test:watch    # vitest watch mode
pnpm lint                       # eslint (web)
pnpm build                      # Production build

# Codegen + seeding
pnpm wagmi:gen                  # Regenerate typed contract bindings from ABIs
pnpm seed                       # Seed the three preset realms + schemas
pnpm --filter web seed:adapters # Deploy + register the 12 cross-realm adapters
pnpm --filter web seed:catalog  # Deploy + seed the CatalogEffectRegistry
pnpm --filter web seed:all      # seed + seed:adapters + seed:catalog (TS seeders only)

# Foundry adapters (run inside contracts/)
forge build                     # Compile the 12 adapters + CatalogEffectRegistry
forge test                      # Adapter + catalog-registry unit tests

# Engine tuning harnesses (stdout-only, no chain needed; run inside apps/web/)
pnpm exec tsx scripts/balance-sweep.ts   # Win-rate / TTK / HP tables per preset × tier
pnpm exec tsx scripts/heal-variants.ts   # Compare inter-room recovery variants
```

Internal plumbing lives in [`scripts/`](scripts). The entry points invoke it,
but you can still run it by hand: `chain-up.sh` (long-lived anvil + one-time
deploy/seed), `app-up.sh` (production app build + serve), `seed-all.sh`
(`pnpm install` + `forge build` + all seeders, for re-seeding against a running
chain).

CI ([`.github/workflows/test.yml`](.github/workflows/test.yml)) gates every
push/PR with `forge build --sizes` + `forge test -vvv` in `contracts/` and
`pnpm typecheck` + `pnpm test` across the workspace.

## Notable design choices

- **Deterministic engine.** Every encounter is reproducible: sfc32 RNG
  seeded from `keccak256(playerAddr ‖ blockhash ‖ encounterId)`, no `Math.random()`.
  Same seed gives the same run, which keeps server-side loot validation honest.
- **Royalty math.** 5% total (`500` BPS): 4.5% creator + 0.5% treasury, 95% to
  the seller. Integer `bigint` math (no float drift) in
  [`apps/web/lib/contracts/exchange.ts`](apps/web/lib/contracts/exchange.ts),
  mirrored client-side so the fee display is trustless.
- **Inventory discovery.** No subgraph. It scans `TransferSingle` / `TransferBatch`
  logs (both `to` and `from`), dedupes tokenIds, then resolves balances with a
  single `balanceOfBatch`.
- **Server-signed clears + mint.** Players never pay gas for normal play. The
  realm-signer keyring signs `BossCleared`, loot mints, and the `SeedSBT` mint.
  Realm creation is the one user-signed flow (the 4-tx Founding Rite on `/create`).
- **Play-instantly burner.** On anvil the visitor first sees the ConnectWizard.
  It offers an in-browser burner wallet (`burner-connector`) that signs locally.
  `/api/faucet` auto-funds it on connect, with no extension.
- **Wandering Trader.** A server-side EOA sits behind `/api/trader/*`, with an
  in-process sliding-window rate limit, a float guard, Zod-validated bodies, and
  revert-vs-internal error classification. It never exposes the private key to
  the client.
- **Wallets via RainbowKit.** Bare wagmi connectors do not surface in the RK modal
  in v2. Everything registers through `getDefaultConfig`.
- **Coinbase Smart Wallet gated off anvil.** It is a hosted account-abstraction
  wallet. It signs and broadcasts through Coinbase's backend and knows only
  Coinbase-supported networks. It therefore cannot reach a local `127.0.0.1`
  anvil or chainId 31337. It is offered only on base-sepolia. On anvil, use the
  burner or an injected wallet.
- **No WalletConnect.** Its universal provider touches `indexedDB` at module-eval
  time and crashes Next.js SSR. Re-add it with the `cookieStorage` +
  `cookieToInitialState` pattern when you need base-sepolia + QR pairing.
