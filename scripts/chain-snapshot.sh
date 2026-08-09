#!/usr/bin/env bash
#
# Captures the PRISTINE genesis snapshot — the post-seed state that
# scripts/chain-reset.sh restores to wipe the demo in ~2s instead of re-running
# Deploy.s.sol and six seeders.
#
#   sudo bash scripts/chain-snapshot.sh            # capture (refuses to clobber)
#   sudo bash scripts/chain-snapshot.sh --force    # re-capture over an existing bundle
#
# Run this ONCE, immediately after first provisioning, before anyone plays —
# whatever is on the chain at this moment becomes what every future reset
# restores. scripts/server-up.sh calls it automatically when the chain is
# provisioned and no bundle exists yet.
#
# Bundle contents (apps/web/data/genesis/): the anvil state file, the realms db,
# and the four generated address/seeder documents. See scripts/lib/state-paths.sh.
#
# Why this stops the chain: anvil only writes its state file on SIGINT (and on
# --state-interval ticks), so a copy taken while it runs is stale. The unit is
# KillSignal=SIGINT precisely so `systemctl stop` produces a clean dump — we wait
# for the unit to actually go inactive before copying.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

source "$ROOT/scripts/lib/state-paths.sh"

CHAIN_UNIT="${CHAIN_UNIT:-realms-chain}"
RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
FORCE=false

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=true ;;
    *) echo "unknown flag: $arg (use --force)" >&2; exit 1 ;;
  esac
done

if [[ ! -f "$PROVISIONED_MARKER" ]]; then
  echo "ERROR: chain is not provisioned ($PROVISIONED_MARKER missing)." >&2
  echo "       Provision first — there is nothing to snapshot yet." >&2
  exit 1
fi

if genesis_present && ! $FORCE; then
  echo "ERROR: a genesis bundle already exists at $GENESIS_DIR" >&2
  echo "       Re-capturing bakes the CURRENT chain — including any player" >&2
  echo "       progress — into what future resets restore. Pass --force if" >&2
  echo "       that is what you want." >&2
  exit 1
fi

# --------------------------------------------------------------- systemd ----

have_systemd() { command -v systemctl >/dev/null 2>&1 && systemctl cat "$CHAIN_UNIT" >/dev/null 2>&1; }

stop_chain() {
  echo "==> stopping $CHAIN_UNIT (SIGINT -> anvil dumps state)"
  systemctl stop "$CHAIN_UNIT"
  # `systemctl stop` returns once the job completes, but be explicit: the dump
  # happens inside the SIGINT handler, and copying a half-written state file
  # would bake a corrupt chain into every future reset.
  for _ in {1..60}; do
    [[ "$(systemctl is-active "$CHAIN_UNIT" 2>/dev/null || true)" != active ]] && return 0
    sleep 1
  done
  echo "ERROR: $CHAIN_UNIT still active after 60s" >&2
  exit 1
}

start_chain() {
  echo "==> starting $CHAIN_UNIT"
  systemctl start "$CHAIN_UNIT"
  for _ in {1..60}; do
    if curl -s -m 2 -X POST "$RPC_URL" -H 'Content-Type: application/json' \
         --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
         2>/dev/null | grep -q '"result"'; then
      echo "==> chain is back up"
      return 0
    fi
    sleep 1
  done
  echo "ERROR: chain did not answer RPC within 60s — journalctl -u $CHAIN_UNIT -n 50" >&2
  exit 1
}

# ------------------------------------------------------------------ main ----

if have_systemd; then
  [[ "${EUID:-$(id -u)}" -eq 0 ]] || { echo "run as root:  sudo bash scripts/chain-snapshot.sh" >&2; exit 1; }
  stop_chain
  genesis_save
  start_chain
else
  # Local dev: no unit to manage. The chain must already be stopped.
  if curl -s -m 2 -X POST "$RPC_URL" -H 'Content-Type: application/json' \
       --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
       2>/dev/null | grep -q '"result"'; then
    echo "ERROR: a chain is still serving RPC at $RPC_URL." >&2
    echo "       Stop it first (Ctrl+C the \`pnpm local\` run) so anvil dumps its state." >&2
    exit 1
  fi
  genesis_save
fi

echo
echo "==> genesis snapshot captured in $GENESIS_DIR"
du -sh "$GENESIS_DIR" | sed 's/^/    /'
echo "    Reset to it any time with:  sudo bash scripts/chain-reset.sh"
