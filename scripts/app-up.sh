#!/usr/bin/env bash
#
# Restartable APP layer — internal plumbing run by realms-app.service on the
# VPS (server-up.sh restarts that unit to redeploy). The chain (anvil +
# deployed contracts + user state) is owned by scripts/chain-up.sh and is NOT
# touched here — so updating the app is just:
#   git pull && sudo bash scripts/server-up.sh --app
#
# SERVES the Next.js app in production mode, bound to 0.0.0.0 so remote users
# can reach it. Use `pnpm local` instead for solo hot-reload development.
#
# Serving only — the build belongs to scripts/app-build.sh, which server-up.sh
# runs BEFORE restarting this unit. Building here would mean every restart took
# the site down for the whole build (~80s measured), and a broken build would
# take it down indefinitely instead of leaving the previous version serving.
# The one exception is a missing .next: first boot and local experiments should
# still work without a separate build step.
#
# Env overrides:
#   APP_HOST  host to bind (default 0.0.0.0)
#   APP_PORT  port to bind (default 3000)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

APP_HOST="${APP_HOST:-0.0.0.0}"
APP_PORT="${APP_PORT:-3000}"

if [[ ! -d "$ROOT/apps/web/.next" ]]; then
  echo "==> no apps/web/.next — building once (normally scripts/app-build.sh does this)"
  bash "$ROOT/scripts/app-build.sh"
fi

echo "==> starting web app on $APP_HOST:$APP_PORT"
# Run `next start` directly in the web package dir. Going through the package's
# `start` script (`pnpm --filter web start -- -H ...`) forwards the `--`
# literally to next, which then reads `-H` as the project directory and dies
# with "no such directory: .../apps/web/-H". `exec ... exec` avoids that.
exec pnpm --filter web exec next start -H "$APP_HOST" -p "$APP_PORT"
