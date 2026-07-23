# Public demo deployment (VPS + demo chain)

This directory contains everything needed to run the Realms PoC as a **public,
playable demo** on a single Linux VPS: a long-lived anvil demo chain, the
Next.js app, a JSON-RPC allowlist proxy, an Otterscan block explorer, TLS via
Caddy, and systemd units to keep it all alive. After the one-time
configuration below, the whole stack is driven by a single idempotent command:

```bash
sudo bash scripts/server-up.sh
```

> **What this is / is not.** This is a *demo chain*: a private EVM network
> whose assets have no monetary value. It is honest about that (the app shows a
> banner). It is not a testnet deployment — that is the separate base-sepolia
> migration tracked in the project roadmap.

## Architecture

```
                          ┌──────────────────────── VPS ────────────────────────┐
browser ── https ── Caddy ┤ play.example.com     → 127.0.0.1:3000 (Next.js)     │
                          │ rpc.example.com      → 127.0.0.1:8546 (rpc-guard)   │
                          │                          │ eth_/net_/web3_/ots_ only│
                          │                          ▼                          │
                          │                    127.0.0.1:8545 (anvil, loopback) │
                          │                          ▲                          │
                          │   Next.js server routes (faucet/signers/trader) ────┘
                          │ explorer.example.com → 127.0.0.1:5100 (Otterscan,   │
                          │   docker; the browser reads the chain through       │
                          │   rpc.example.com — anvil serves the ots_* API)     │
                          └──────────────────────────────────────────────────────┘
```

Two things make this safe enough to expose:

1. **anvil binds loopback only.** Browsers reach the chain through
   [`rpc-guard.mjs`](rpc-guard.mjs), which forwards only `eth_*` / `net_*` /
   `web3_*` methods. The cheat namespaces (`anvil_*`, `evm_*`, `hardhat_*`)
   are unreachable from outside; the app's own faucet route calls
   `anvil_setBalance` over loopback and keeps working.
2. **Fresh keys.** anvil's default accounts are public knowledge — anyone
   could sign an admin transaction offline and broadcast it through the guard.
   The chain MUST therefore run on a fresh mnemonic (below).

## 0. Prerequisites

- Ubuntu 22.04+ (or similar) VPS, ~2 vCPU / 4 GB RAM
- A domain with three A records pointing at the VPS: `play.`, `rpc.`, `explorer.`
- Installed as the `realms` user: Node ≥ 22.13 (pnpm 11's floor), pnpm 11, Foundry (`foundryup`)
- Installed as root: Caddy (`apt install caddy`), Docker (`apt install
  docker.io` — runs the Otterscan explorer), sqlite3 (for backups)
- Both repos cloned side by side:
  ```bash
  git clone https://github.com/Visovsiouk/seed-protocol.git      /home/realms/seed-protocol
  git clone https://github.com/Visovsiouk/seed-protocol-poc.git  /home/realms/seed-protocol-poc
  cd /home/realms/seed-protocol && forge install
  ```

## 1. Generate fresh demo keys

```bash
cast wallet new-mnemonic --words 12          # → the chain mnemonic
MNEMONIC="<paste the mnemonic here>"

cast wallet derive-private-key "$MNEMONIC" 0 # → admin/deployer (index 0)
cast wallet derive-private-key "$MNEMONIC" 1 # → treasury      (index 1)
cast wallet derive-private-key "$MNEMONIC" 2 # → emergency     (index 2)

cast wallet new                              # → trader (dedicated burner)
```

The trader gets its own random key, NOT a mnemonic index: mnemonic
accounts are shared with the demo player (index 9), the realm-signer
keyring (0–3) and player-realm minter delegates (4+ in creation order),
and the trader refuses to buy its own listings ("does not hail itself").
On anvil, `pnpm --filter web seed:trader` (part of `seed-all.sh`)
generates and funds this key automatically — the manual `cast wallet new`
above is only needed if you provision by hand.

Indices 0–3 double as the realm-signer keyring (admin + three founding-realm
owners), so the same mnemonic goes into `.env.local` as
`REALM_SIGNER_MNEMONIC`. anvil funds the first 10 accounts of the mnemonic it
is started with, so all of these start with 10,000 demo ETH; the trader
burner is funded by `seed:trader` (`TRADER_FUND_WEI`, default 10 ETH — its
total spending budget).

Write `/etc/realms/chain.env` (root-owned, `chmod 600`):

```ini
ANVIL_MNEMONIC=<the mnemonic>
ADMIN=<address of index 0>
DEPLOYER_PK=<private key of index 0>
TREASURY=<address of index 1>
EMERGENCY_MULTISIG=<address of index 2>
```

## 2. Configure the app

`/home/realms/seed-protocol-poc/apps/web/.env.local`:

```ini
NEXT_PUBLIC_CHAIN=anvil
NEXT_PUBLIC_RPC_URL=https://rpc.example.com
NEXT_PUBLIC_EXPLORER_URL=https://explorer.example.com
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_FAUCET_ENABLED=true
NEXT_PUBLIC_DEMO_BANNER=true

REALM_SIGNER_MNEMONIC="<the mnemonic>"
REALM_SIGNER_RPC_URL=http://127.0.0.1:8545
FAUCET_RPC_URL=http://127.0.0.1:8545
TRADER_RPC_URL=http://127.0.0.1:8545
TRADER_PRIVATE_KEY=<dedicated burner key — seed:trader writes it, or `cast wallet new`>
TRADER_FLOAT_MIN_WEI=10000000000000000
```

Server-side RPC URLs stay loopback (unfiltered anvil); only the browser URL
goes through the guard.

`NEXT_PUBLIC_EXPLORER_URL` makes tx hashes and addresses across the app UI
link out to Otterscan. It is inlined at build time — after changing it, rebuild
the app (`sudo bash scripts/server-up.sh --app`).

## 3. Bring everything up

```bash
sudo bash scripts/server-up.sh
```

One idempotent command. It:

1. **Checks prerequisites** and reports every failure at once: `chain.env`,
   `.env.local`, caddy, docker, the sister repo, and the `realms` user's
   toolchain (anvil/forge/node/pnpm). `--check` runs only this step.
2. **Derives the explorer config** — writes `/etc/realms/explorer.env` with
   `ERIGON_URL=<NEXT_PUBLIC_RPC_URL>` (Otterscan runs in the browser, so it
   reads the chain through the public rpc domain; no extra config to maintain).
3. **Installs the systemd units** (`realms-chain`, `realms-rpc-guard`,
   `realms-app`, `realms-explorer`, `realms-state-backup.timer`) — units are
   code and are always refreshed. The Caddyfile is *config*: installed only if
   `/etc/caddy/Caddyfile` doesn't exist (edit the domains!), never overwritten.
4. **Enables + starts everything**, restarting the *stateless* services
   (guard, app, explorer) so a `git pull` redeploys — but **never restarts
   `realms-chain`**: on-chain state (Seeds, realms, balances) survives every run.
5. **Prints a status summary**: per-unit `systemctl is-active` with
   `journalctl` hints, plus live probes (guard allows `eth_chainId` +
   `ots_getApiLevel`, still blocks `anvil_setBalance`; app and explorer answer
   HTTP).

Flags: `--app` (fast path — rebuild + restart only the app), `--check`
(prereqs only), `--no-explorer` (skip the docker bits).

First `realms-chain` start takes a few minutes: it deploys the core protocol
from the sister repo, then seeds the three founding realms, twelve adapters,
and the catalog registry. Watch with `journalctl -fu realms-chain`. State
persists in `apps/web/data/anvil-state.json`; restarts skip deploy+seed.

## 4. Smoke test (golden path)

From a fresh browser profile at `https://play.example.com`:

1. ConnectWizard → **Play instantly** (burner wallet) → auto-funded by faucet.
2. Enter the fantasy realm, complete a descent; loot appears in the escrow
   tray and mints on clear.
3. Clear all three founding realms (fantasy / sci-fi / cyberpunk).
4. `/genesis` → claim the Seed (server reconstructs the proof from on-chain
   boss-clear receipts).
5. `/create` → run the 4-tx Founding Rite with a funded wallet → realm live.
6. Descend into a different preset's realm carrying foreign gear → the
   translation screen shows the adapter mapping.
7. `/bazaar` → list an item, buy one; the receipt should show the 4.5% / 0.5%
   royalty split.

Then check the explorer: open `https://explorer.example.com`, browse the
latest blocks, and open one of the seeder transactions.

And verify the guard from any external machine:

```bash
# must succeed (allowed method)
curl -s https://rpc.example.com -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
# must succeed (Otterscan's read-only API, served natively by anvil)
curl -s https://rpc.example.com -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"ots_getApiLevel","params":[],"id":1}'
# must be rejected with "method not allowed" (cheat method)
curl -s https://rpc.example.com -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"anvil_setBalance","params":["0x0000000000000000000000000000000000000001","0x1"],"id":1}'
```

Finally reboot the VPS once and confirm the chain comes back with state
intact (your Seed and realm still exist).

## Operational notes

- **Resets.** If the chain must be reset, delete
  `apps/web/data/.chain-provisioned` and restart `realms-chain` — it wipes
  state and re-provisions from scratch. Announce it; players lose progress.
- **App updates.** `git pull && sudo bash scripts/server-up.sh --app`. The
  chain is untouched. (A plain re-run of `server-up.sh` also works and
  additionally refreshes units, guard, and explorer.)
- **Backups.** Nightly snapshots land in `/home/realms/backups` (state file +
  realm registry, last 14 kept). To restore, stop `realms-chain`, copy a
  snapshot over `apps/web/data/anvil-state.json` (and `realms.db`), start.
- **Known trust assumption.** Boss clears, loot mints, and Seed mints are
  signed by the demo server (that is the PoC's gasless design). The demo
  banner discloses this.
- **Trader float.** "Hail the Wandering Trader" purchases spend the trader
  account's ETH (bounded: tier-appraised prices, one deal per seller, ever).
  If the float-low error appears, top the trader account up — on the demo
  chain the faucet route or a direct transfer from a funded account works.
