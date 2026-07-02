# Public demo deployment (VPS + demo chain)

This directory contains everything needed to run the Realms PoC as a **public,
playable demo** on a single Linux VPS: a long-lived anvil demo chain, the
Next.js app, a JSON-RPC allowlist proxy, TLS via Caddy, and systemd units to
keep it all alive.

> **What this is / is not.** This is a *demo chain*: a private EVM network
> whose assets have no monetary value. It is honest about that (the app shows a
> banner). It is not a testnet deployment — that is the separate base-sepolia
> migration tracked in the project roadmap.

## Architecture

```
                          ┌──────────────────────── VPS ───────────────────────┐
browser ── https ── Caddy ┤ play.example.com  → 127.0.0.1:3000  (Next.js)      │
                          │ rpc.example.com   → 127.0.0.1:8546  (rpc-guard)    │
                          │                        │ eth_/net_/web3_ only      │
                          │                        ▼                           │
                          │                  127.0.0.1:8545 (anvil, loopback)  │
                          │                        ▲                           │
                          │   Next.js server routes (faucet/signers/trader) ───┘
                          └─────────────────────────────────────────────────────┘
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
- A domain with two A records pointing at the VPS: `play.` and `rpc.`
- Installed as the `realms` user: Node ≥ 20, pnpm 11, Foundry (`foundryup`)
- Installed as root: Caddy (`apt install caddy`), sqlite3 (for backups)
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
cast wallet derive-private-key "$MNEMONIC" 9 # → trader        (index 9)
```

Indices 0–3 double as the realm-signer keyring (admin + three founding-realm
owners), so the same mnemonic goes into `.env.local` as
`REALM_SIGNER_MNEMONIC`. anvil funds the first 10 accounts of the mnemonic it
is started with, so all of these start with 10,000 demo ETH.

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
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_FAUCET_ENABLED=true
NEXT_PUBLIC_DEMO_BANNER=true

REALM_SIGNER_MNEMONIC="<the mnemonic>"
REALM_SIGNER_RPC_URL=http://127.0.0.1:8545
FAUCET_RPC_URL=http://127.0.0.1:8545
TRADER_RPC_URL=http://127.0.0.1:8545
TRADER_PRIVATE_KEY=<private key of index 9>
TRADER_FLOAT_MIN_WEI=10000000000000000
```

Server-side RPC URLs stay loopback (unfiltered anvil); only the browser URL
goes through the guard.

## 3. Install the services

```bash
sudo cp deploy/systemd/*.service deploy/systemd/*.timer /etc/systemd/system/
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile   # edit the domains first
sudo systemctl daemon-reload
sudo systemctl enable --now realms-chain        # anvil + one-time deploy/seed
sudo systemctl enable --now realms-rpc-guard
sudo systemctl enable --now realms-app
sudo systemctl enable --now realms-state-backup.timer
sudo systemctl reload caddy
```

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

And verify the guard from any external machine:

```bash
# must succeed (allowed method)
curl -s https://rpc.example.com -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
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
- **App updates.** `git pull && sudo systemctl restart realms-app`. The chain
  is untouched.
- **Backups.** Nightly snapshots land in `/home/realms/backups` (state file +
  realm registry, last 14 kept). To restore, stop `realms-chain`, copy a
  snapshot over `apps/web/data/anvil-state.json` (and `realms.db`), start.
- **Known trust assumption.** Boss clears, loot mints, and Seed mints are
  signed by the demo server (that is the PoC's gasless design). The demo
  banner discloses this.
