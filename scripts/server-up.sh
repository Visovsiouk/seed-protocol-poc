#!/usr/bin/env bash
#
# SERVER route — one idempotent command for the VPS deploy:
#
#   sudo bash scripts/server-up.sh                 # checks, units, start, status
#   sudo bash scripts/server-up.sh --app           # fast path: rebuild + restart the app only
#   sudo bash scripts/server-up.sh --check         # prerequisite checks only
#   sudo bash scripts/server-up.sh --no-explorer   # skip the docker/Otterscan bits
#
# Installs/refreshes the systemd units from deploy/systemd/, wires the
# Otterscan explorer (env derived from NEXT_PUBLIC_RPC_URL — no extra config),
# (re)starts every stateless service, and prints a per-service status summary
# with journalctl hints.
#
# It NEVER restarts realms-chain: on-chain state (players' Seeds, realms,
# balances) lives there, and a restart mid-provisioning would re-wipe. The
# chain unit is only enabled/started if not already running.
#
# App update after `git pull`:  sudo bash scripts/server-up.sh --app
# Full runbook: deploy/README.md

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MODE=full
EXPLORER=true
for arg in "$@"; do
  case "$arg" in
    --app)         MODE=app ;;
    --check)       MODE=check ;;
    --no-explorer) EXPLORER=false ;;
    *) echo "unknown flag: $arg (use --app | --check | --no-explorer)" >&2; exit 1 ;;
  esac
done

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "run as root:  sudo bash scripts/server-up.sh" >&2
  exit 1
fi

SERVICE_USER="${SERVICE_USER:-realms}"
SISTER_REPO="${SISTER_REPO:-$(dirname "$ROOT")/seed-protocol}"
ENV_LOCAL="$ROOT/apps/web/.env.local"
CHAIN_ENV=/etc/realms/chain.env
EXPLORER_ENV=/etc/realms/explorer.env

STATELESS_UNITS=(realms-rpc-guard realms-app)
$EXPLORER && STATELESS_UNITS+=(realms-explorer)
ALL_UNITS=(realms-chain "${STATELESS_UNITS[@]}")

# ---------------------------------------------------------------- status ----

probe_rpc() { # label, method, expected-substring
  local out
  out="$(curl -s -m 5 -X POST http://127.0.0.1:8546 \
    -H 'Content-Type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"method\":\"$2\",\"params\":[],\"id\":1}" || true)"
  if grep -q "$3" <<<"$out"; then echo "  OK   $1"; else echo "  FAIL $1"; fi
}

probe_http() { # label, url
  local code
  code="$(curl -s -o /dev/null -m 5 -w '%{http_code}' "$2" || true)"
  case "$code" in
    200|301|302|307|308) echo "  OK   $1 (HTTP $code)" ;;
    *)                   echo "  FAIL $1 (HTTP $code)" ;;
  esac
}

status_summary() {
  local u state
  echo
  echo "== services =="
  for u in "${ALL_UNITS[@]}"; do
    state="$(systemctl is-active "$u" 2>/dev/null || true)"
    printf "  %-20s %s\n" "$u" "$state"
    [[ "$state" == active ]] || echo "      -> journalctl -u $u -n 50 --no-pager"
  done
  echo
  echo "== probes =="
  probe_rpc  "guard allows eth_chainId"          eth_chainId      '"result"'
  probe_rpc  "guard allows ots_getApiLevel"      ots_getApiLevel  '"result"'
  probe_rpc  "guard blocks anvil_setBalance"     anvil_setBalance 'not allowed'
  probe_http "app      127.0.0.1:3000"           http://127.0.0.1:3000
  $EXPLORER && probe_http "explorer 127.0.0.1:5100" http://127.0.0.1:5100
  echo
  echo "First run: realms-chain provisioning takes minutes — follow with: journalctl -fu realms-chain"
  echo "App update after git pull:  sudo bash scripts/server-up.sh --app"
}

# ------------------------------------------------------------- fast path ----

if [[ "$MODE" == app ]]; then
  echo "==> restarting realms-app (app-up.sh: pnpm install + build + next start)"
  systemctl restart realms-app
  status_summary
  exit 0
fi

# ------------------------------------------------------ prerequisite checks -

FAILS=()
WARNS=()
fail() { FAILS+=("$1"); }
warn() { WARNS+=("$1"); }

if [[ -f "$CHAIN_ENV" ]]; then
  perms="$(stat -c '%a' "$CHAIN_ENV" 2>/dev/null || echo '?')"
  [[ "$perms" == 600 ]] || warn "$CHAIN_ENV perms are $perms (expected 600 — it holds the chain mnemonic)"
else
  fail "$CHAIN_ENV missing — generate FRESH demo keys first (deploy/README.md §1; anvil's default keys are public knowledge)"
fi

RPC_PUBLIC=""
if [[ -f "$ENV_LOCAL" ]]; then
  RPC_PUBLIC="$(grep -E '^NEXT_PUBLIC_RPC_URL=' "$ENV_LOCAL" | tail -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
  if [[ -z "$RPC_PUBLIC" ]]; then
    fail "NEXT_PUBLIC_RPC_URL not set in apps/web/.env.local"
  elif [[ "$RPC_PUBLIC" == *127.0.0.1* || "$RPC_PUBLIC" == *localhost* ]]; then
    warn "NEXT_PUBLIC_RPC_URL is loopback ($RPC_PUBLIC) — remote browsers and the explorer can't reach the chain"
  fi
  if $EXPLORER && ! grep -qE '^NEXT_PUBLIC_EXPLORER_URL=' "$ENV_LOCAL"; then
    warn "NEXT_PUBLIC_EXPLORER_URL not set in apps/web/.env.local — the app UI won't link tx/addresses to the explorer (set it to https://explorer.<your-domain>, then: server-up.sh --app)"
  fi
else
  fail "apps/web/.env.local missing — configure the app first (deploy/README.md §2)"
fi

command -v caddy >/dev/null 2>&1 || fail "caddy not installed (apt install caddy)"
if $EXPLORER; then
  command -v docker >/dev/null 2>&1 || fail "docker not installed (apt install docker.io) — or rerun with --no-explorer"
fi
[[ -d "$SISTER_REPO" ]] || fail "sister contracts repo not found at $SISTER_REPO (set SISTER_REPO=...)"

if id "$SERVICE_USER" >/dev/null 2>&1; then
  sudo -u "$SERVICE_USER" bash -lc 'command -v anvil && command -v forge && command -v node && command -v pnpm' >/dev/null 2>&1 \
    || fail "toolchain incomplete for user '$SERVICE_USER' (needs anvil, forge, node, pnpm on their PATH)"
else
  fail "service user '$SERVICE_USER' does not exist (set SERVICE_USER=... or create it)"
fi

for w in "${WARNS[@]+"${WARNS[@]}"}"; do echo "WARN: $w" >&2; done
if [[ "${#FAILS[@]}" -gt 0 ]]; then
  echo "prerequisites not met:" >&2
  for f in "${FAILS[@]}"; do echo "  - $f" >&2; done
  exit 1
fi
echo "==> prerequisites OK"
[[ "$MODE" == check ]] && exit 0

# ------------------------------------------------------------- explorer env -

if $EXPLORER; then
  mkdir -p /etc/realms
  printf 'ERIGON_URL=%s\n' "$RPC_PUBLIC" > "$EXPLORER_ENV"
  echo "==> wrote $EXPLORER_ENV (ERIGON_URL=$RPC_PUBLIC, from NEXT_PUBLIC_RPC_URL)"
fi

# ------------------------------------------------------------------- units --

echo "==> installing systemd units from deploy/systemd/"
cp "$ROOT"/deploy/systemd/*.service "$ROOT"/deploy/systemd/*.timer /etc/systemd/system/
systemctl daemon-reload

# Caddyfile is user-owned config (real domains) — install once, never clobber.
if [[ ! -f /etc/caddy/Caddyfile ]]; then
  cp "$ROOT/deploy/Caddyfile" /etc/caddy/Caddyfile
  echo "==> installed /etc/caddy/Caddyfile — EDIT THE DOMAINS, then: systemctl reload caddy"
elif ! cmp -s "$ROOT/deploy/Caddyfile" /etc/caddy/Caddyfile; then
  echo "==> NOTE: /etc/caddy/Caddyfile differs from deploy/Caddyfile — NOT overwritten."
  echo "    Make sure it has the explorer route:  explorer.<your-domain> { reverse_proxy 127.0.0.1:5100 }"
fi

# ------------------------------------------------------------------- start --

if $EXPLORER; then
  docker pull otterscan/otterscan:latest \
    || echo "==> docker pull failed (offline?) — will use a cached image if present"
fi

echo "==> enabling + starting services"
systemctl enable --now "${ALL_UNITS[@]}" realms-state-backup.timer
# Redeploy the stateless layer: picks up a new app build (app-up.sh rebuilds),
# guard code, or explorer image. realms-chain is deliberately NOT restarted.
systemctl restart "${STATELESS_UNITS[@]}"
systemctl reload caddy || echo "WARN: caddy reload failed — check /etc/caddy/Caddyfile" >&2

status_summary
