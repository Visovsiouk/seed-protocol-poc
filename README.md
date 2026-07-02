# Realms — Seed Protocol PoC

Next.js / wagmi web app exercising the Seed Protocol contracts (ERC-1155
`UniversalAsset`, `ProtocolExchange`, `EmissionController`, `SeedSBT`, the
per-preset `EcosystemTemplate` clones, and the cross-realm adapter +
catalog-effect registries). The goal is a playable, end-to-end demonstration of
the protocol's royalty-routed bazaar, Seed-gated realm creation, and emission
engine on a local anvil chain, with a clean migration path to base-sepolia.

It is a **deterministic dice-driven text RPG** with three genre presets
(Fantasy, Sci-Fi, Cyberpunk). A player clears the three founding realms to earn
a soulbound **Seed**, which unlocks authoring their own realm. Loot is minted
under each realm's provenance, traded on a shared bazaar with perpetual creator
royalties, and translated across presets by adapters.

> Contracts live in a sibling repo (`../seed-protocol`). This repo is frontend +
> server-side helpers + the cross-realm adapter Foundry project (`contracts/`).

## Status

- **Phase 0** — workspace scaffold, wallet stack, env validation. _Done._
- **Phase 1** — bazaar reads + writes, Wandering Trader server signer. _Done._
- **Phase 2** — engine signer, presets, tutorial, loot bounds validator. _Done._
- **Phase 3** — cross-realm adapters (§6.9), on-chain element vocabulary. _Done._
- **Phase 4** — sci-fi + cyberpunk flavor parity with the fantasy bank. _Done._
- **Phase 5a** — user-signed `createRealm` flow + trial-mode play route. _Done._
- **Onboarding** — in-browser burner wallet + ConnectWizard + `/api/faucet`
  auto-fund (anvil) so a first-time visitor plays with no extension. _Done._
- **Seed claim** — Genesis altar (`/genesis`): clear all three founding realms,
  then mint the `SeedSBT` (server reconstructs the proof from on-chain receipts). _Done._
- **Per-realm tiers** — earned `maxTier` from distinct clearers (T3 base, T4 @20,
  T5 @50); see [`apps/web/lib/reads/realm-tier.ts`](apps/web/lib/reads/realm-tier.ts). _Done._

## Stack

- Next.js 15 (App Router) + React 19
- wagmi v2 + viem v2 (workspace-pinned to `2.48.11`) + RainbowKit v2.2 (`getDefaultConfig`)
- `burner-connector` for the in-browser play-instantly wallet (anvil only)
- TanStack Query v5 for client cache
- Tailwind v4 + tailwind-variants + `framer-motion` for styling/motion
- Zod for runtime env + request validation
- `better-sqlite3` for the off-chain realm registry; `obscenity` to profanity-gate realm names
- Vitest for unit tests (Playwright wired for future e2e)
- Foundry (`contracts/`) for the 12 cross-realm adapters + catalog-effect registry
- Node ≥ 20, pnpm 11 workspaces (`apps/*`, `packages/*`)

## Contracts

Nine core contracts (deployed by the sibling repo, address book in
[`apps/web/lib/contracts/addresses.ts`](apps/web/lib/contracts/addresses.ts) —
the frontend always calls the UUPS proxies, never implementations):

| Contract | Role |
| --- | --- |
| `SeedSBT` | Soulbound Seed token. `admin` holds `GOVERNANCE_ROLE` and calls `mintGenesis` once to bootstrap the founding realms; players later mint their own via `/api/realm/claim-seed`. |
| `EcosystemFactory` | `createEcosystem` clones a realm; enforces the **1 Seed = 1 Ecosystem** invariant (spends the caller's Seed). |
| `EcosystemRegistry` | Index of every deployed realm clone. |
| `EcosystemTemplate` | Per-realm clone (impl behind proxies). Emits `BossClearEvent` + `AssetMinted`; owner-gated `mintAsset` / `registerSchema` / `triggerSeedMint` / `setMinter`. |
| `UniversalAsset` | Single ERC-1155 holding all loot across every realm (provenance in tokenId). |
| `ProtocolExchange` | Royalty-routed bazaar: `list` / `purchase` / `cancel`. |
| `SchemaRegistry` | Loot schemas (weapon/armor type, tier, effects) — 2 per starter preset. |
| `AdapterRegistry` | Permissionless registry of the 12 cross-realm adapters. |
| `EmissionController` | Loot drop rates + mint caps. |

The cross-realm layer lives in this repo's Foundry project ([`contracts/`](contracts),
Solidity 0.8.24): **12 adapters** (6 weapon + 6 armor — every ordered pair of the
three presets) plus a `CatalogEffectRegistry`, seeded by `pnpm seed:adapters` /
`pnpm seed:catalog`.

## How it works

**The crux of the deploy model is server-signed vs user-signed flows.** The
player's wallet is mostly an *identity*: most state-changing game actions are
signed server-side by a keyring derived from `REALM_SIGNER_MNEMONIC`, so a
player needs no gas for normal play. Only realm *creation* asks the user to sign
and broadcast real transactions themselves.

| Flow | Signed by | Route |
| --- | --- | --- |
| Boss clear → `BossCleared` receipt | realm-signer keyring (server) | `POST /api/realm/boss-cleared` |
| Loot mint | realm-signer keyring (server) | `POST /api/realm/mint-loot` |
| `SeedSBT` mint (Seed claim) | realm-signer keyring (server) | `POST /api/realm/claim-seed` |
| Realm registration (off-chain index) | server | `POST /api/realm/register` |
| Wandering Trader buy/list/cancel | trader burner EOA (server) | `POST /api/trader/*` |
| Faucet top-up (`anvil_setBalance`) | server cheat call | `POST /api/faucet` |
| **Realm creation (Founding Rite)** | **the user's own wallet** | `/create` page (4 txs) |

The realm-signer keyring (`apps/web/lib/server/realm-signer.ts`) derives:
admin @ index 0, the three founding-realm owners @ indices 1–3, and player-realm
delegate signers @ indices 4+ — all from the single `REALM_SIGNER_MNEMONIC`. The
default Anvil test mnemonic derives Anvil's deterministic accounts 0..3, so it
works out of the box locally.

Seed eligibility is reconstructed purely from on-chain `BossClearEvent`s: a
player who has cleared all three founding (starter) realms and does not already
hold a Seed is eligible. See
[`apps/web/lib/tutorial/progress.ts`](apps/web/lib/tutorial/progress.ts). At claim
time [`/api/realm/claim-seed`](apps/web/app/api/realm/claim-seed/route.ts) does not
trust the client — it independently rescans `AssetMinted` events to rebuild the
proof before the server signs the `SeedSBT` mint.

### The deterministic engine

Play is a **deterministic dice RPG** ([`apps/web/lib/engine/`](apps/web/lib/engine)):

- **Three presets** — fantasy / sci-fi / cyberpunk — each with its own 6-value
  element vocabulary (fantasy: fire/ice/shock/holy/unholy/none, etc.). Loot and
  gear translate across genres through the on-chain adapters.
- **Two-button combat.** Every turn is *Attack* vs a *Secondary* action that
  varies by equipped armor (Dodge / Brace / Steady / Reflect / Focus). Round order
  is preTurn → player → monster → postTurn → boss-phase check; elemental matchups
  apply a 1.5× weakness / 0.5× resist multiplier.
- **Seeded RNG.** All randomness flows through a deterministic **sfc32** generator
  (128-bit state, no `Math.random()` anywhere) seeded from
  `keccak256(playerAddr ‖ blockhash ‖ encounterId)` — same seed, same run, on any
  machine or tab. See [`apps/web/lib/engine/rng.ts`](apps/web/lib/engine/rng.ts).
- **Tiers T1–T5.** Weapons scale d4→d12 (+0→+4 to-hit/damage); armor +1/+5 HP →
  +5/+50 HP, uniform across presets so adapters map without a balance audit
  ([`apps/web/lib/engine/tier.ts`](apps/web/lib/engine/tier.ts)). Starter realms
  cap at **T3** (boss depth 3). Player-made realms earn their ceiling from distinct
  clearers: T3 base, **T4 @ 20**, **T5 @ 50**
  ([`apps/web/lib/reads/realm-tier.ts`](apps/web/lib/reads/realm-tier.ts)).

## Layout

```
apps/web/
  app/
    page.tsx              Pocket-realm hub — realm picker, loadout, station rail
    play/[preset]/        Run an encounter in a founding realm (fantasy/scifi/cyberpunk)
    play/realm/[address]/ Run an encounter in a community/player realm (trial fallback)
    bazaar/               Royalty-routed marketplace
    create/               Founding Rite — user-signed 4-tx realm creation
    genesis/              Seed-claim altar (three shards → one Seed)
    realm/[address]/      Realm dashboard (activity, leaderboard, royalties)
    about/                What the PoC proves
    api/
      trader/             Wandering Trader endpoints (buy/list/cancel)
      realm/              boss-cleared, mint-loot, claim-seed, register,
                          next-signer, list, [address]/meta
      faucet/             anvil_setBalance top-up (anvil only)
  components/
    wallet/               WalletProvider, ConnectWizard, AnvilOnboarding,
                          DemoAutoConnect, AutoFaucet, DisconnectGuard,
                          ConnectButton, AddNetworkButton
    hub/                  PocketRealmHub + LoadoutStaging (base / station rail)
    game/                 Delve loop: combat, escrow tray, gear translation, boss phases
    bazaar/               Listings grid, recent sales, purchase receipts
    realm/                Realm dashboard panels (activity, leaderboard, royalties)
    story/  tutorial/     Cold-open, cinematic beats, interstitials + onboarding overlay
    genesis/  create/     Seed ledger + realm-spawn choreography
    guards/               ProtocolSurfaceGate (locks bazaar/create/genesis pre-clears)
    inventory/  landing/  ui/  Asset drawer, featured realm, shared primitives
  lib/
    contracts/            Address book + write hooks + gear translation + seeded-* caches
    engine/               Deterministic dice/combat engine, tiers, loot rolls
    flavor/               Per-preset banks (bosses, monsters, loot vocab)
    loot/  metadata/      Procedural loot naming + on-chain metadata decode
    reads/                Listings, inventory, realms, tutorial progress, tiers
    server/               realm-signer keyring, sqlite realm registry, nonce locks
    faucet-server/        anvil_setBalance faucet (rate-limited, idempotent)
    trader-server/  trader-client/  Wandering Trader EOA signer + guards + client
    story/  tutorial/     Progression arc + on-chain Seed-eligibility reconstruction
    persistence/  ui/     Equipped-gear localStorage + theming/keyboard hooks
    env.ts                Zod-validated env (server + client)
    chain.ts              Active chain selector (anvil vs base-sepolia)
  scripts/                seed-realms, seed-adapters, seed-catalog-effects,
                          balance-sweep, heal-variants
  data/                   anvil-state.json, realms.db (gitignored runtime state)
packages/abis/            Generated typed contract bindings (wagmi:gen output)
contracts/                Foundry project — 12 adapters + CatalogEffectRegistry
scripts/                  chain-up.sh, app-up.sh, bring-up.sh (deploy/dev)
docs/seed-scripts-spec.md Spec handed to the contracts repo
```

## Environment

Validated in [`apps/web/lib/env.ts`](apps/web/lib/env.ts) via Zod. Copy
[`apps/web/.env.example`](apps/web/.env.example) → `apps/web/.env.local`.
Server-only vars are never importable from a `"use client"` module.

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
| `REALM_SIGNER_MNEMONIC` | server | yes | BIP-39 mnemonic for the realm-signer keyring (admin + realm owners + delegates) |
| `REALM_SIGNER_RPC_URL` | server | yes | RPC the realm signers broadcast against |
| `TRADER_PRIVATE_KEY` | server | yes | Wandering Trader burner EOA |
| `TRADER_RPC_URL` | server | yes | RPC the trader signs against |
| `TRADER_FLOAT_MIN_WEI` | server | yes | Trader refuses to act below this balance |
| `TRADER_MAX_BUY_WEI` | server | no | Hard cap per buy (default 0.2 ETH) |
| `TRADER_RATE_LIMIT_PER_IP_PER_10MIN` | server | no | Trader per-IP rate limit (default 10) |
| `FAUCET_RPC_URL` | server | no | RPC for `anvil_setBalance`; falls back to `REALM_SIGNER_RPC_URL`. May stay `127.0.0.1` even when the public RPC is a LAN address |
| `FAUCET_AMOUNT_WEI` | server | no | Balance the faucet tops up to (default 10 ETH) |
| `FAUCET_RATE_LIMIT_PER_IP_PER_10MIN` | server | no | Faucet per-IP rate limit (default 5) |

`NEXT_PUBLIC_DEMO_MODE` and `NEXT_PUBLIC_FAUCET_ENABLED` only take effect when
`NEXT_PUBLIC_CHAIN=anvil` — the `demoMode`/`faucetEnabled` exports in `env.ts`
hard-gate them so the mock wallet and the `anvil_setBalance` cheat can never be
exposed on base-sepolia.

## Local development

### Prerequisites

- Node ≥ 20, pnpm 11
- Foundry (`anvil` + `forge`) for the sibling contracts repo + this repo's adapters
- The sibling `../seed-protocol` contracts repo (override with `SISTER_REPO=...`)
- A browser wallet for the real-wallet flow (MetaMask, Rabby, Frame, or Brave) —
  or just use demo / the in-browser burner

### Quick start (solo dev)

```bash
pnpm demo-up        # anvil mock wallet — fastest, no extension, hot reload
# or
pnpm bring-up       # real RainbowKit wallet (MetaMask / burner / injected)
```

`bring-up` / `demo-up` run: `pnpm install` → seed realms → `forge build` the
adapters → seed adapters → seed the catalog-effect registry → `pnpm dev`. The
`--clean` variants (`bring-up-clean` / `demo-up-clean`) wipe the SQLite game db
first. Both assume a running anvil with the core contracts already deployed (the
sibling repo's `./deploy-local.sh`, or `scripts/chain-up.sh` below).

Then open <http://localhost:3000>. On anvil the ConnectWizard offers
**Play instantly** (in-browser burner, auto-funded) or **Use your own wallet**
(adds the Anvil network and switches to it).

## Server deployment

For a public-ish deployment where users connect their **own** wallets from other
devices against a shared local anvil, use the two-layer scripts. The chain layer
is long-lived and owns all on-chain state; the app layer is freely restartable.

### Prerequisites

- A Linux host with Node ≥ 20, pnpm 11, Foundry (`anvil` + `forge`)
- The sibling `../seed-protocol` repo present on the host (override: `SISTER_REPO`)
- Ports **8545** (RPC) and **3000** (app) reachable by your users
- `apps/web/.env.local` filled in (see below)

### 1. Chain layer — run once, leave running

```bash
bash scripts/chain-up.sh
```

[`scripts/chain-up.sh`](scripts/chain-up.sh):

- Starts `anvil --host 0.0.0.0` (reachable by remote MetaMask) with persistent
  state at `apps/web/data/anvil-state.json`.
- On the **first** run only (until `apps/web/data/.chain-provisioned` exists):
  wipes stale state + seed caches, runs the sister `Deploy.s.sol`, then this
  repo's realm / adapter / catalog seeders, and writes the `.chain-provisioned`
  marker on success. Subsequent runs load the state file and **skip** deploy+seed,
  so contract addresses, players' Seeds, realms, and balances persist.
- A crashed seeder leaves no marker, so the next run re-provisions from clean.
- Refuses to start if something is already serving RPC on `8545` (avoids seeding
  against a foreign node).

Anvil runs in the foreground; `Ctrl+C` dumps state and exits. Overrides:
`SISTER_REPO` (contracts repo path), `ANVIL_HOST` (bind host, default `0.0.0.0`).
Run it under a process manager (systemd / tmux) to keep it alive.

### 2. Configure `.env.local`

```ini
NEXT_PUBLIC_CHAIN=anvil
# Point remote browsers at the host's LAN/public address — MetaMask runs in the
# user's browser and must reach anvil directly:
NEXT_PUBLIC_RPC_URL=http://<host-lan-or-public-ip>:8545
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_FAUCET_ENABLED=true

# Server-side RPCs run on the same host, so they can stay loopback:
REALM_SIGNER_RPC_URL=http://127.0.0.1:8545
REALM_SIGNER_MNEMONIC="test test test test test test test test test test test junk"
FAUCET_RPC_URL=http://127.0.0.1:8545
TRADER_RPC_URL=http://127.0.0.1:8545
TRADER_PRIVATE_KEY=0x...          # any unused anvil account
TRADER_FLOAT_MIN_WEI=10000000000000000
```

### 3. App layer — restartable

```bash
bash scripts/app-up.sh
```

[`scripts/app-up.sh`](scripts/app-up.sh) runs `pnpm install` → `pnpm --filter web
build` → `next start -H 0.0.0.0 -p 3000`. It does **not** touch the chain, so
shipping an update is just:

```bash
git pull && bash scripts/app-up.sh
```

Overrides: `APP_HOST` (default `0.0.0.0`), `APP_PORT` (default `3000`).

### Security notes

- **Anvil is an unauthenticated dev node** and the faucet exposes the
  `anvil_setBalance` cheat. Only expose RPC `8545` to a **trusted** network or
  behind a reverse proxy — never the open internet.
- `REALM_SIGNER_MNEMONIC` controls minting and the admin role. Treat it as a
  secret even on local chains; rotate away from the public Anvil test mnemonic
  for anything beyond a throwaway demo.
- **Vercel / serverless is not viable for this model** — it needs a long-lived
  anvil node plus a co-located server signer. The base-sepolia migration target
  (real testnet RPC, paymaster-sponsored txs) is the intended path off local
  anvil; that work is not yet built.

## Scripts

```bash
pnpm dev                        # Next.js dev server
pnpm build                      # Production build
pnpm start                      # next start (production)
pnpm typecheck                  # tsc --noEmit across the workspace
pnpm test                       # vitest run (all packages)
pnpm --filter web test:watch    # vitest watch mode
pnpm lint                       # eslint (web)
pnpm wagmi:gen                  # Regenerate typed contract bindings from ABIs
pnpm seed                       # Seed the three preset realms + schemas
pnpm --filter web seed:adapters # Deploy + register the 12 cross-realm adapters
pnpm --filter web seed:catalog  # Deploy + seed the CatalogEffectRegistry
pnpm --filter web seed:all      # seed + seed:adapters + seed:catalog
pnpm demo-up   / demo-up-clean  # Seed + dev with the anvil mock wallet
pnpm bring-up  / bring-up-clean # Seed + dev with the real RainbowKit wallet
pnpm chain-up                   # Long-lived chain layer (anvil + one-time deploy/seed)
pnpm app-up                     # Restartable production app layer
```

## Notable design choices

- **Deterministic engine.** Every encounter is fully reproducible: sfc32 RNG
  seeded from `keccak256(playerAddr ‖ blockhash ‖ encounterId)`, no `Math.random()`.
  Same seed → same run, which keeps server-side loot validation honest.
- **Royalty math.** 5% total (`500` BPS): 4.5% creator + 0.5% treasury, 95% to
  the seller. Integer `bigint` math (no float drift) in
  [`apps/web/lib/contracts/exchange.ts`](apps/web/lib/contracts/exchange.ts),
  mirrored client-side so the fee display is trustless.
- **Inventory discovery.** No subgraph — scans `TransferSingle` / `TransferBatch`
  logs (both `to` and `from`), dedupes tokenIds, then resolves balances via a
  single `balanceOfBatch`.
- **Server-signed clears + mint.** Players never pay gas for normal play; the
  realm-signer keyring signs `BossCleared`, loot mints, and the `SeedSBT` mint.
  Realm creation is the one user-signed flow (the 4-tx Founding Rite on `/create`).
- **Play-instantly burner.** On anvil the first thing a visitor sees is the
  ConnectWizard, offering an in-browser burner wallet (`burner-connector`) that
  signs locally and is auto-funded by `/api/faucet` on connect — no extension.
- **Wandering Trader.** Server-side EOA fronted by `/api/trader/*` with in-process
  sliding-window rate limit, float guard, Zod-validated bodies, and revert-vs-
  internal error classification. Never exposes the private key to the client.
- **Wallets via RainbowKit.** Bare wagmi connectors don't surface in the RK modal
  in v2; everything is registered through `getDefaultConfig`.
- **Coinbase Smart Wallet gated off anvil.** It's a hosted account-abstraction
  wallet that signs/broadcasts through Coinbase's backend and only knows Coinbase-
  supported networks, so it can't reach a local `127.0.0.1` anvil or chainId
  31337. Offered only on base-sepolia; on anvil use the burner or an injected wallet.
- **No WalletConnect.** Its universal provider touches `indexedDB` at module-eval
  time and crashes Next.js SSR. Re-add via the `cookieStorage` +
  `cookieToInitialState` pattern when base-sepolia + QR pairing is needed.

## Contracts handoff

The Foundry seed-scripts spec (one-shot governance-gated
`SeedSBT.mintGenesis(address)` to break the deploy bootstrap chicken-and-egg,
plus `DeployGenesis.s.sol` and `SeedBazaar.s.sol`) lives in
[`docs/seed-scripts-spec.md`](docs/seed-scripts-spec.md) — hand-carried to the
sibling contracts repo.
