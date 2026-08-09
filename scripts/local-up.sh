#!/usr/bin/env bash
#
# LOCAL route — the one-command dev bring-up:
#
#   pnpm local            # prompts: demo (mock wallet) vs real wallet
#   pnpm local --demo     # non-interactive: anvil mock wallet (AI / CI testing)
#   pnpm local --wallet   # non-interactive: real RainbowKit wallet
#   pnpm local --clean    # wipe chain + game db first (fresh provisioning)
#   pnpm local --reset    # restore the genesis snapshot (seconds, if captured)
#   pnpm local --explorer # also run Otterscan (needs Docker) at :5100 and
#                         # turn on explorer links in the app UI
#
# What it does:
#   1. creates apps/web/.env.local from .env.example if missing — the example
#      defaults are fully local-viable (anvil test mnemonic, loopback RPCs,
#      trader key rotated by seed:trader), so a fresh clone needs no setup
#   2. starts scripts/chain-up.sh as a background child bound to 127.0.0.1 —
#      first run deploys the core protocol from the sister repo and seeds
#      everything (takes minutes); later runs reload persisted state in seconds
#   3. once the chain is provisioned, runs the Next.js dev server in the
#      chosen wallet mode
#
# Ctrl+C tears down both layers; anvil state is dumped before exit, so the
# next `pnpm local` resumes where you left off.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DEMO=""
CLEAN=false
RESET=false
EXPLORER=false
for arg in "$@"; do
  case "$arg" in
    --demo)     DEMO=true ;;
    --wallet)   DEMO=false ;;
    --clean)    CLEAN=true ;;
    --reset)    RESET=true ;;
    --explorer) EXPLORER=true ;;
    *) echo "unknown flag: $arg (use --demo | --wallet | --clean | --reset | --explorer)" >&2; exit 1 ;;
  esac
done

if $EXPLORER && ! command -v docker >/dev/null 2>&1; then
  echo "--explorer needs Docker (the Otterscan image). Install Docker Desktop" >&2
  echo "or drop the flag — the stack runs fine without the explorer." >&2
  exit 1
fi

# No default wallet mode: ask on a TTY, demand a flag otherwise (AI/CI).
if [[ -z "$DEMO" ]]; then
  if [[ -t 0 ]]; then
    echo "Wallet mode?"
    echo "  [1] demo   — auto-connected mock wallet (no extension needed)"
    echo "  [2] wallet — your real wallet via RainbowKit (MetaMask / burner / injected)"
    while true; do
      read -r -p "Choose 1 or 2: " choice
      case "$choice" in
        1) DEMO=true;  break ;;
        2) DEMO=false; break ;;
      esac
    done
  else
    echo "non-interactive session: pass --demo or --wallet (e.g. pnpm local --demo)" >&2
    exit 1
  fi
fi

ENV_LOCAL="$ROOT/apps/web/.env.local"
if [[ ! -f "$ENV_LOCAL" ]]; then
  cp "$ROOT/apps/web/.env.example" "$ENV_LOCAL"
  echo "==> created apps/web/.env.local from .env.example (anvil defaults)"
fi

# PROVISIONED_MARKER / GENESIS_DIR / genesis_present / genesis_restore
source "$ROOT/scripts/lib/state-paths.sh"

if $CLEAN; then
  # Dropping the marker is enough: chain-up.sh's FRESH branch wipes the state
  # file + game db and resets the generated addresses itself.
  echo "==> --clean: forcing fresh chain provisioning"
  rm -f "$PROVISIONED_MARKER"
elif $RESET; then
  # Fast local equivalent of scripts/chain-reset.sh. Safe to do here because the
  # chain has not started yet — nothing is holding the state file open.
  if genesis_present; then
    echo "==> --reset: restoring genesis snapshot from $GENESIS_DIR"
    genesis_restore
  else
    echo "==> --reset: no genesis snapshot yet — falling back to a full re-provision"
    echo "    (capture one with scripts/chain-snapshot.sh after this run finishes)"
    rm -f "$PROVISIONED_MARKER"
  fi
fi

echo "==> pnpm install"
pnpm install

# The local chain binds loopback only. chain-up.sh owns persistent state and
# the first-run deploy + seed.
export ANVIL_HOST=127.0.0.1
RPC_URL="http://127.0.0.1:8545"

rpc_up() {
  curl -s -X POST "$RPC_URL" \
    -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
    2>/dev/null | grep -q '"result"'
}

# Pre-flight BEFORE spawning anything: if RPC already answers, another
# `pnpm local` (or a stale anvil) owns the port. chain-up.sh has the same
# check, but by the time it fires our readiness poll below could have already
# accepted the foreign node and started a second dev server against it.
if rpc_up; then
  echo "ERROR: something is already serving RPC at $RPC_URL." >&2
  echo "       Another 'pnpm local' or a stale anvil is running. Stop it first, e.g.:" >&2
  echo "         Linux/macOS : kill \$(lsof -ti tcp:8545)" >&2
  echo "         Windows     : netstat -ano | grep 8545   # then taskkill //PID <pid> //F" >&2
  exit 1
fi

bash "$ROOT/scripts/chain-up.sh" &
CHAIN_PID=$!

cleanup() {
  trap - EXIT INT TERM
  if $EXPLORER; then
    docker stop realms-local-explorer >/dev/null 2>&1 || true
  fi
  if kill -0 "$CHAIN_PID" 2>/dev/null; then
    kill -INT "$CHAIN_PID" 2>/dev/null || true
  fi
  # Let chain-up's own trap dump anvil state before we exit.
  wait "$CHAIN_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Ready when the chain answers RPC AND the provisioning marker exists. The
# marker is written by chain-up.sh only after the deploy + every seeder
# succeeded, so a fresh run can never race the dev server against a
# half-seeded chain. No overall timeout: first provisioning legitimately
# takes minutes — the chain child's liveness check is the failure detector.
i=0
until [[ -f "$PROVISIONED_MARKER" ]] && rpc_up; do
  if ! kill -0 "$CHAIN_PID" 2>/dev/null; then
    echo "ERROR: chain layer exited — see output above" >&2
    exit 1
  fi
  if (( i % 15 == 0 )); then
    echo "==> waiting for chain provisioning..."
  fi
  i=$((i + 1))
  sleep 1
done

# Belt-and-braces: the poll can pass on the same tick the chain child dies
# (e.g. a port grab it detected after our pre-flight). Never start the dev
# server unless our own chain layer is actually alive.
if ! kill -0 "$CHAIN_PID" 2>/dev/null; then
  echo "ERROR: chain layer exited — see output above" >&2
  exit 1
fi

# Explorer sidecar: Otterscan is a static app that runs in the BROWSER, so it
# talks to anvil directly at 127.0.0.1:8545 (anvil serves the ots_* API with
# permissive CORS — no rpc-guard needed on a solo machine).
EXPLORER_URL=""
if $EXPLORER; then
  docker rm -f realms-local-explorer >/dev/null 2>&1 || true
  echo "==> starting Otterscan (docker) at http://localhost:5100"
  docker run -d --rm --name realms-local-explorer \
    -p 127.0.0.1:5100:80 \
    -e ERIGON_URL=http://127.0.0.1:8545 \
    otterscan/otterscan:latest >/dev/null
  EXPLORER_URL="http://localhost:5100"
fi

echo
if $DEMO; then
  echo "==> chain ready — starting dev server (DEMO MODE: anvil mock wallet)"
else
  echo "==> chain ready — starting dev server (real wallet / RainbowKit)"
fi
echo "==> open http://localhost:3000  (Ctrl+C stops the dev server AND anvil)"
[[ -n "$EXPLORER_URL" ]] && echo "==> explorer: $EXPLORER_URL"

# Foreground, NOT exec — the trap above must survive to tear down anvil.
# Process env overrides whatever .env.local holds, so the wallet-mode and
# explorer choices are deterministic per run.
env NEXT_PUBLIC_DEMO_MODE="$DEMO" NEXT_PUBLIC_EXPLORER_URL="$EXPLORER_URL" \
  pnpm --filter web dev || true
