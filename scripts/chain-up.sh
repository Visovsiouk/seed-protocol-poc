#!/usr/bin/env bash
#
# Chain layer — internal plumbing, not a user entry point. Invoked by:
#   - scripts/local-up.sh (background child, ANVIL_HOST=127.0.0.1)  → `pnpm local`
#   - deploy/systemd/realms-chain.service (VPS)                     → server-up.sh
# The chain is long-lived and owns all on-chain state; the app layer restarts
# freely against it without touching that state.
#
# What it does:
#   1. Starts anvil bound to 0.0.0.0 (reachable by remote MetaMask users) with
#      persistent state at apps/web/data/anvil-state.json.
#   2. FIRST run only (until apps/web/data/.chain-provisioned exists): wipes any
#      stale state + seed caches, runs the sister repo's Deploy.s.sol (core
#      protocol), then this repo's realm/adapter/catalog seeders, and writes the
#      .chain-provisioned marker on success. On subsequent runs the state file
#      is loaded and deploy+seed are SKIPPED so contract addresses
#      (lib/contracts/addresses.ts) stay valid and users keep their
#      Seeds/realms/balances. A crashed seeder leaves no marker, so the next run
#      re-provisions from a clean slate.
#
# Anvil runs in the foreground; Ctrl+C dumps state to the state file and exits.
#
# Env overrides:
#   SISTER_REPO     path to the seed-protocol contracts repo (default ../seed-protocol)
#   ANVIL_HOST      anvil bind host (default 0.0.0.0; use 127.0.0.1 behind
#                   deploy/rpc-guard.mjs for anything internet-reachable)
#   ANVIL_MNEMONIC  custom mnemonic for anvil's funded accounts (public deploys
#                   MUST set this — the default anvil keys are public knowledge)
#   ADMIN / TREASURY / EMERGENCY_MULTISIG / DEPLOYER_PK
#                   deploy roles; default to anvil dev accounts 0/1/2
#
# See scripts/app-up.sh for the restartable app layer (VPS) and
# scripts/local-up.sh for the local dev bring-up.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SISTER_REPO="${SISTER_REPO:-$ROOT/../seed-protocol}"
ANVIL_HOST="${ANVIL_HOST:-0.0.0.0}"
RPC_URL="http://127.0.0.1:8545"
STATE_FILE="$ROOT/apps/web/data/anvil-state.json"
# Written only AFTER deploy + seed fully succeed. Its presence — not the
# auto-dumped state file — is what marks the chain as provisioned, so a
# half-finished run (e.g. a seeder crash) re-provisions cleanly next time
# instead of loading a partially-seeded chain.
PROVISIONED_MARKER="$ROOT/apps/web/data/.chain-provisioned"
# Seed-address caches. These are (deployer, nonce)-deterministic. On a fresh
# chain they must NOT carry stale addresses: both the sister deploy and these
# seeders deploy from anvil account 0, so if the deploy footprint shifts, a
# cached address can land on a different contract on the new chain and get
# silently (and wrongly) reused (seed:adapters/seed:catalog getCode-check the
# cached address and reuse on any code — a foreign contract passes that check).
#
# We RESET rather than delete: seed-realms.ts does a bare readFileSync (no
# existsSync guard) and ENOENT-crashes if the file is gone. Each reset doc keeps
# only its `$schema` note — no chainId entry — so the seeders see "nothing
# cached", deploy fresh, and re-stamp the file with this chain's addresses.
SEED_REALMS_CACHE="$ROOT/apps/web/lib/contracts/.seeded-realms.json"
SEED_ADAPTERS_CACHE="$ROOT/apps/web/lib/contracts/.seeded-adapters.json"
SEED_CATALOG_CACHE="$ROOT/apps/web/lib/contracts/.seeded-catalog.json"
DB_FILES=(
  "$ROOT/apps/web/data/realms.db"
  "$ROOT/apps/web/data/realms.db-shm"
  "$ROOT/apps/web/data/realms.db-wal"
)

if [[ ! -d "$SISTER_REPO" ]]; then
  echo "ERROR: sister contracts repo not found at $SISTER_REPO" >&2
  echo "       set SISTER_REPO=/path/to/seed-protocol" >&2
  exit 1
fi

# No success marker => fresh chain that needs a clean deploy + seed.
FRESH=false
[[ -f "$PROVISIONED_MARKER" ]] || FRESH=true

mkdir -p "$(dirname "$STATE_FILE")"

if $FRESH; then
  # Clean slate: drop any leftover anvil state + game db, and reset the seed
  # caches to schema-only docs (no chainId entry) so the seeders deploy from
  # scratch and write addresses that match THIS chain. See the SEED_*_CACHE
  # note above for why we reset instead of delete.
  echo "==> FRESH chain — wiping stale anvil state + game db, resetting seed caches"
  rm -f "$STATE_FILE" "${DB_FILES[@]}"
  cat > "$SEED_REALMS_CACHE" <<'EOF'
{
  "$schema": "Per-chainId map of seeded realm addresses + per-preset schema IDs, written by `pnpm seed`. Placeholder zeros until the seeder runs."
}
EOF
  cat > "$SEED_ADAPTERS_CACHE" <<'EOF'
{
  "$schema": "Per-chainId map of deployed adapter addresses keyed by (slot, sourcePreset, targetPreset), written by `pnpm seed:adapters`."
}
EOF
  cat > "$SEED_CATALOG_CACHE" <<'EOF'
{
  "$schema": "Per-chainId map of the deployed CatalogEffectRegistry address + per-schema effect lists, written by `pnpm seed:catalog`. Placeholder zeros until the seeder runs."
}
EOF
fi

# Deploy.s.sol PoC-mode env for the sister repo's deploy script.
# Every value is overridable so a public deploy can use fresh keys — the
# defaults are anvil's WELL-KNOWN dev accounts, which anyone can sign for.
# See deploy/README.md: for anything reachable from the internet, generate a
# fresh mnemonic, pass it as ANVIL_MNEMONIC (so anvil funds its accounts), and
# derive ADMIN/DEPLOYER_PK from index 0.
export ADMIN="${ADMIN:-0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266}"
export TREASURY="${TREASURY:-0x70997970C51812dc3A010C7d01b50e0d17dc79C8}"
export EMERGENCY_MULTISIG="${EMERGENCY_MULTISIG:-0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC}"
export DEPLOYER_PK="${DEPLOYER_PK:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
export AUTO_AUTHORIZE_SEED_MINTING="${AUTO_AUTHORIZE_SEED_MINTING:-true}"
# Optional custom account set: when set, anvil derives + funds its unlocked
# accounts from THIS mnemonic instead of the public test mnemonic.
ANVIL_MNEMONIC="${ANVIL_MNEMONIC:-}"

ANVIL_LOG="$(mktemp -t anvil.XXXXXX.log)"
cleanup() {
  if [[ -n "${ANVIL_PID:-}" ]] && kill -0 "$ANVIL_PID" 2>/dev/null; then
    echo "==> stopping anvil (PID $ANVIL_PID) — dumping state to $STATE_FILE"
    kill "$ANVIL_PID" 2>/dev/null || true
    wait "$ANVIL_PID" 2>/dev/null || true
  fi
  rm -f "$ANVIL_LOG"
}
trap cleanup EXIT INT TERM

if $FRESH; then
  echo "==> will deploy + seed once anvil is up"
else
  echo "==> chain already provisioned — loading state, skipping deploy + seed"
fi

# Pre-flight: refuse to start if something is ALREADY serving RPC at this URL.
# Our anvil binds the same port, so a squatter (e.g. a stale anvil from a prior
# session) would make our node fail to bind and die — but the readiness poll
# below would still see a live RPC and we'd silently deploy/seed against the
# FOREIGN node's state. Abort loudly instead.
if curl -s -X POST "$RPC_URL" \
     -H "Content-Type: application/json" \
     --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
     2>/dev/null | grep -q '"result"'; then
  echo "ERROR: something is already serving RPC at $RPC_URL." >&2
  echo "       A stale anvil is likely still running. Stop it first, e.g.:" >&2
  echo "         Linux/macOS : kill \$(lsof -ti tcp:8545)" >&2
  echo "         Windows     : netstat -ano | grep 8545   # then taskkill //PID <pid> //F" >&2
  exit 1
fi

echo "==> starting anvil (host $ANVIL_HOST, state $STATE_FILE, logs $ANVIL_LOG)"
# --state-interval: periodic dumps on top of the exit-time dump. On Windows
# (Git Bash) `kill` can hard-terminate the native anvil.exe and skip the exit
# dump entirely — the 30s interval bounds any loss.
ANVIL_ARGS=(--host "$ANVIL_HOST" --state "$STATE_FILE" --state-interval 30)
[[ -n "$ANVIL_MNEMONIC" ]] && ANVIL_ARGS+=(--mnemonic "$ANVIL_MNEMONIC")
anvil "${ANVIL_ARGS[@]}" > "$ANVIL_LOG" 2>&1 &
ANVIL_PID=$!

echo "==> waiting for anvil RPC at $RPC_URL ..."
for i in {1..40}; do
  # Liveness FIRST: if our anvil died, fail now — never accept an RPC reply
  # that might be coming from a foreign node that grabbed the port.
  if ! kill -0 "$ANVIL_PID" 2>/dev/null; then
    echo "anvil exited before becoming ready. Log:" >&2
    cat "$ANVIL_LOG" >&2
    exit 1
  fi
  if curl -s -X POST "$RPC_URL" \
       -H "Content-Type: application/json" \
       --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
       | grep -q '"result"'; then
    echo "==> anvil is up"
    break
  fi
  sleep 0.25
  [[ $i -eq 40 ]] && { echo "timed out waiting for anvil" >&2; cat "$ANVIL_LOG" >&2; exit 1; }
done

if $FRESH; then
  echo "==> deploying core protocol (sister Deploy.s.sol, PoC mode)"
  ( cd "$SISTER_REPO" && forge script script/Deploy.s.sol \
      --fork-url "$RPC_URL" --broadcast --private-key "$DEPLOYER_PK" -vvvv )

  # The addresses committed in addresses.ts are deterministic for anvil's
  # DEFAULT account 0. A public deploy uses fresh keys (deploy/README.md §1),
  # so the contracts land elsewhere and every seeder/read path would point at
  # empty accounts. Re-point the address book at what actually got deployed.
  echo "==> syncing addresses.ts from the sister repo's deployment artifact"
  node "$ROOT/scripts/sync-addresses.mjs" "$SISTER_REPO"

  bash "$ROOT/scripts/seed-all.sh"

  # Mark provisioned only after every step above succeeded. `set -e` aborts
  # before this line on any failure, so a crashed seeder leaves no marker and
  # the next run starts clean.
  touch "$PROVISIONED_MARKER"
  echo "==> seed complete. Chain is ready."
fi

echo
echo "Anvil running at $RPC_URL (PID $ANVIL_PID), bound to $ANVIL_HOST."
echo "Press Ctrl+C to stop anvil (state is dumped to $STATE_FILE)."
wait "$ANVIL_PID"
