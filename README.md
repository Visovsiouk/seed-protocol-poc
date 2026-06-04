# Realms — Seed Protocol PoC

Next.js / wagmi web app exercising the Seed Protocol contracts (ERC-1155
`UniversalAsset`, `ProtocolExchange`, `EmissionController`, `SeedSBT`, …).
The goal is a playable, end-to-end demonstration of the protocol's
royalty-routed bazaar and emission engine on a local anvil chain, with a
clean migration path to base-sepolia.

> Contracts live in a sibling repo (`../seed-protocol`). This repo is
> frontend + server-side helpers only.

## Status

- **Phase 0** — workspace scaffold, wallet stack, env validation. _Done._
- **Phase 1** — bazaar reads + writes, Wandering Trader server signer. _Done._
- **Phase 2** — engine signer, presets, tutorial, loot bounds validator. _Done._
- **Phase 3** — cross-realm adapters (§6.9), on-chain element vocabulary. _Done._
- **Phase 4** — sci-fi + cyberpunk flavor parity with the fantasy bank. _Done._
- **Phase 5a** — user-signed `createRealm` flow + trial-mode play route. _Done._

## Stack

- Next.js 15 (App Router) + React 19
- wagmi v2 + viem v2 + RainbowKit v2.2 (`getDefaultConfig`)
- TanStack Query v5 for client cache
- Tailwind v4 + tailwind-variants for styling
- Zod for runtime env + request validation
- Vitest for unit tests, Playwright wired but not yet exercised

## Layout

```
apps/web/
  app/
    bazaar/            Phase 1 marketplace page
    api/trader/        Wandering Trader POST endpoints (buy/list/cancel)
  components/
    bazaar/            Listings grid, list dialog, purchase receipt, value-flow animation
    wallet/            RainbowKit provider + connect button
  lib/
    contracts/         Address book + write hooks (useList, usePurchase, useCancel)
    reads/             Listings, recent sales, provenance, inventory fetchers + hooks
    trader-client/     Typed fetch wrappers for /api/trader/*
    trader-server/     Server-only EOA signer, float guard, rate limit, action handlers
    metadata/          Asset metadata decoders (vitest covered)
    env.ts             Zod-validated env (server + client)
    chain.ts           Active chain selector (anvil vs base-sepolia)
docs/
  seed-scripts-spec.md Spec handed to the contracts repo for the
                       deploy + bazaar-seed Foundry scripts.
```

## Getting started

### Prerequisites

- Node ≥ 20, pnpm 11
- Foundry (for the sibling contracts repo's anvil + scripts)
- MetaMask (or any injected wallet) in the browser

### Install

```bash
pnpm install
```

### Run against local anvil

Every step assumes a fresh anvil. Re-running the full sequence after
`anvil` restarts is the safe path — the seeders are idempotent but
bytecode-aware (they redeploy when the chain has been wiped).

> **TL;DR** — once steps 1–2 below are done (`./deploy-local.sh` ran in
> `../seed-protocol`, `.env.local` filled in), the rest is one command:
>
> ```bash
> pnpm bring-up
> ```
>
> This runs `pnpm install` → `pnpm --filter web seed` →
> `cd contracts && forge build` → `pnpm --filter web seed:adapters` →
> `pnpm dev`. The script aborts on any failing step (see
> [`scripts/bring-up.sh`](scripts/bring-up.sh)).

1. **Start anvil + deploy the protocol contracts.** In the contracts
   sibling repo `../seed-protocol`:

   ```bash
   ./deploy-local.sh
   ```

   This brings up anvil and runs the genesis + bazaar-seed forge scripts
   in one go. Leave the resulting anvil process running in its own
   terminal.

2. **Configure env.** In this repo, copy `apps/web/.env.example` to
   `apps/web/.env.local` and fill in the addresses printed by
   `deploy-local.sh` plus the Wandering Trader's burner key (any unused
   anvil account).

3. **Install workspace deps**:

   ```bash
   pnpm install
   ```

4. **Seed realms.** Deploys one `Ecosystem`/`LootSchema` per preset,
   mints preseed liquidity, writes `apps/web/lib/contracts/.seeded-realms.json`:

   ```bash
   pnpm --filter web seed
   ```

5. **Build the adapter contracts** (this repo's Foundry project under
   `contracts/`):

   ```bash
   cd contracts && forge build && cd ..
   ```

6. **Seed the adapters.** Deploys 12 distinct adapter contracts — one
   per ordered preset pair × slot, named
   `{Source}To{Target}{Weapon|Armor}Adapter` (e.g.
   `FantasyToSciFiWeaponAdapter`, `CyberpunkToFantasyArmorAdapter`).
   Each is constructor-bound to the source + target loot schema ids and
   registered against `AdapterRegistry`. Writes
   `apps/web/lib/contracts/.seeded-adapters.json`:

   ```bash
   pnpm --filter web seed:adapters
   ```

   Safe to re-run any time. The script probes each prior address with
   `eth_getCode` and a `sourceElementLabel(0)` view call — if the
   bytecode is missing or stale (e.g. you restarted anvil, or the
   Solidity changed) it redeploys.

7. **Start the dev server**:

   ```bash
   pnpm dev
   ```

8. In MetaMask, add anvil as a custom network (`http://127.0.0.1:8545`,
   chainId `31337`) and import one of the funded anvil keys.

9. Open <http://localhost:3000/bazaar>, connect, and buy a listing —
   or jump straight to <http://localhost:3000/play/fantasy> to run an
   encounter and watch foreign-realm gear translate through the
   adapters.

## Environment

Validated in [`apps/web/lib/env.ts`](apps/web/lib/env.ts) via Zod. Server-
only vars are gated by the `server-only` package.

| Var | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_CHAIN` | client | `anvil` or `base-sepolia` |
| `NEXT_PUBLIC_RPC_URL` | client | RPC endpoint for the active chain |
| `NEXT_PUBLIC_PRESEED_SELLERS` | client | Comma-separated addresses tagged as protocol-seeded |
| `NEXT_PUBLIC_PAYMASTER_URL` | client | Coinbase Smart Wallet paymaster (base-sepolia only) |
| `NEXT_PUBLIC_WC_PROJECT_ID` | client | Reserved for WalletConnect (currently stubbed) |
| `TRADER_PRIVATE_KEY` | server | Wandering Trader burner EOA |
| `TRADER_RPC_URL` | server | RPC the trader signs against |
| `TRADER_FLOAT_MIN_WEI` | server | Refuses to act below this balance |
| `TRADER_MAX_BUY_WEI` | server | Hard cap per buy request (default 0.2 ETH) |
| `ENGINE_SIGNER_PRIVATE_KEY` | server | Reserved for Phase 2 emission engine |
| `ENGINE_SIGNER_RPC_URL` | server | Reserved for Phase 2 emission engine |

## Scripts

```bash
pnpm dev                       # Next.js dev server
pnpm build                     # Production build
pnpm typecheck                 # tsc --noEmit across the workspace
pnpm test                      # vitest run
pnpm wagmi:gen                 # Regenerate typed contract bindings from the ABI artifacts
pnpm --filter web seed         # Deploy + seed the three preset realms
pnpm --filter web seed:adapters # Deploy + register the cross-realm adapter contracts
pnpm bring-up                  # install + seed + forge build + seed:adapters + dev (one-shot)
```

## Notable design choices

- **Royalty math.** 5% total (`500` BPS): 4.5% creator + 0.5% treasury,
  95% to the seller. Computed via integer `bigint` math (no float drift)
  in [`apps/web/lib/contracts/exchange.ts`](apps/web/lib/contracts/exchange.ts).
- **Inventory discovery.** No subgraph — scans `TransferSingle` /
  `TransferBatch` logs (both `to` and `from`), dedupes tokenIds, then
  resolves balances via a single `balanceOfBatch`.
- **Wandering Trader.** Server-side EOA fronted by `/api/trader/*` with
  in-process sliding-window rate limit, float guard, Zod-validated body
  parsing, and revert-vs-internal error classification. Never exposes the
  private key to the client.
- **Wallets via RainbowKit.** Bare wagmi connectors don't surface in the
  RK modal in v2; everything is registered through `getDefaultConfig`.
- **No WalletConnect.** Its universal provider touches `indexedDB` at
  module-eval time and crashes Next.js SSR. Re-add via the
  `cookieStorage` + `cookieToInitialState` pattern when base-sepolia + QR
  pairing is needed.

## Contracts handoff

The Foundry seed-scripts spec (one-shot governance-gated
`SeedSBT.mintGenesis(address)` to break the deploy bootstrap chicken-and-
egg, plus `DeployGenesis.s.sol` and `SeedBazaar.s.sol`) lives in `docs/`
locally — gitignored, hand-carried to the sibling contracts repo.
