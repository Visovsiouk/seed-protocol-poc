#!/usr/bin/env bash
#
# Wipes demo state and puts the chain back to its post-seed genesis.
#
#   sudo bash scripts/chain-reset.sh            # FAST: restore the genesis snapshot (~2s)
#   sudo bash scripts/chain-reset.sh --full     # re-provision from source (minutes)
#   sudo bash scripts/chain-reset.sh --yes      # skip the confirmation prompt
#
# Fast path restores apps/web/data/genesis/ (captured by chain-snapshot.sh):
# same contract addresses, same seeded realms/adapters/catalog, so the app needs
# no rebuild. It cannot half-fail the way re-provisioning can — a crashed seeder
# leaves no marker and the demo stays down until someone notices.
#
# --full deletes the bundle AND the provisioned marker so chain-up.sh re-runs
# Deploy.s.sol + all six seeders, then re-captures the bundle. Use it when the
# contracts or the seeders changed; the fast path would otherwise restore a
# genesis that predates the new code.
#
# Either way this DESTROYS player progress — Seeds, realms, balances, listings.
# Announce it first. Browser burner wallets live in localStorage, so players
# also need a fresh profile.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

source "$ROOT/scripts/lib/state-paths.sh"

CHAIN_UNIT="${CHAIN_UNIT:-realms-chain}"
APP_UNIT="${APP_UNIT:-realms-app}"
BACKUP_UNIT="${BACKUP_UNIT:-realms-state-backup}"
RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
APP_URL="${APP_URL:-http://127.0.0.1:3000}"

FULL=false
ASSUME_YES=false
for arg in "$@"; do
  case "$arg" in
    --full) FULL=true ;;
    --yes|-y) ASSUME_YES=true ;;
    *) echo "unknown flag: $arg (use --full | --yes)" >&2; exit 1 ;;
  esac
done

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "run as root:  sudo bash scripts/chain-reset.sh" >&2
  exit 1
fi

if ! $FULL && ! genesis_present; then
  echo "ERROR: no genesis snapshot at $GENESIS_DIR — nothing to restore." >&2
  echo "       Capture one from a pristine chain:  sudo bash scripts/chain-snapshot.sh" >&2
  echo "       Or re-provision from source:        sudo bash scripts/chain-reset.sh --full" >&2
  exit 1
fi

if ! $ASSUME_YES; then
  if $FULL; then
    echo "FULL reset: re-deploys the protocol and re-runs all six seeders (minutes)."
  else
    echo "Fast reset: restores the genesis snapshot in $GENESIS_DIR."
  fi
  echo "Every player loses their Seed, realms, balances and listings."
  read -r -p "Type 'reset' to continue: " confirm
  [[ "$confirm" == reset ]] || { echo "aborted"; exit 1; }
fi

# ------------------------------------------------------------- helpers -----

stop_chain() {
  echo "==> stopping $CHAIN_UNIT"
  systemctl stop "$CHAIN_UNIT"
  # Must be fully inactive before we touch the files: the unit is
  # KillSignal=SIGINT and anvil dumps its state from that handler, so a running
  # (or still-stopping) chain would overwrite whatever we just restored.
  for _ in {1..60}; do
    [[ "$(systemctl is-active "$CHAIN_UNIT" 2>/dev/null || true)" != active ]] && return 0
    sleep 1
  done
  echo "ERROR: $CHAIN_UNIT still active after 60s — aborting before touching state" >&2
  exit 1
}

wait_rpc() {
  for _ in {1..180}; do
    if curl -s -m 2 -X POST "$RPC_URL" -H 'Content-Type: application/json' \
         --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
         2>/dev/null | grep -q '"result"'; then
      return 0
    fi
    sleep 1
  done
  echo "ERROR: chain did not answer RPC — journalctl -u $CHAIN_UNIT -n 50" >&2
  exit 1
}

wait_provisioned() {
  # --full re-runs deploy + seed; the marker appears only when every step passed.
  for _ in {1..600}; do
    [[ -f "$PROVISIONED_MARKER" ]] && return 0
    sleep 1
  done
  echo "ERROR: provisioning did not finish — journalctl -u $CHAIN_UNIT -n 100" >&2
  exit 1
}

# ---------------------------------------------------------------- main -----

echo "==> backing up current state first (via $BACKUP_UNIT)"
systemctl start "$BACKUP_UNIT" || echo "WARN: backup unit failed — continuing" >&2

stop_chain

if $FULL; then
  echo "==> FULL reset — dropping the genesis bundle and the provisioned marker"
  rm -rf "$GENESIS_DIR"
  rm -f "$PROVISIONED_MARKER"
  systemctl start "$CHAIN_UNIT"
  echo "==> re-provisioning (Deploy.s.sol + 6 seeders) — follow: journalctl -fu $CHAIN_UNIT"
  wait_rpc
  wait_provisioned
  echo "==> re-capturing the genesis snapshot"
  bash "$ROOT/scripts/chain-snapshot.sh"
else
  echo "==> restoring genesis snapshot from $GENESIS_DIR"
  genesis_restore
  systemctl start "$CHAIN_UNIT"
  wait_rpc
fi

# The app caches nothing across a restart, but it holds open handles on the
# realms db we just replaced — restart it so it reopens the restored file.
echo "==> restarting $APP_UNIT"
systemctl restart "$APP_UNIT"

for _ in {1..30}; do
  code="$(curl -s -o /dev/null -m 5 -w '%{http_code}' "$APP_URL" || true)"
  case "$code" in 200|301|302|307|308) break ;; esac
  sleep 1
done

echo
echo "== reset complete =="
printf "  %-14s %s\n" "$CHAIN_UNIT" "$(systemctl is-active "$CHAIN_UNIT")"
printf "  %-14s %s\n" "$APP_UNIT" "$(systemctl is-active "$APP_UNIT")"
printf "  %-14s HTTP %s\n" "app" "${code:-?}"
echo "  Players need a fresh browser profile — burner wallets live in localStorage."
