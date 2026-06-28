#!/usr/bin/env bash
#
# Restartable APP layer. The chain (anvil + deployed contracts + user state)
# is owned by scripts/chain-up.sh and is NOT touched here — so updating the app
# is just:  git pull && bash scripts/app-up.sh
#
# Builds and serves the Next.js app in production mode, bound to 0.0.0.0 so
# remote users can reach it. Use `pnpm demo-up` / `pnpm dev` instead for solo
# hot-reload development.
#
# Env overrides:
#   APP_HOST  host to bind (default 0.0.0.0)
#   APP_PORT  port to bind (default 3000)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

APP_HOST="${APP_HOST:-0.0.0.0}"
APP_PORT="${APP_PORT:-3000}"

echo "==> pnpm install"
pnpm install

echo "==> building web app"
pnpm --filter web build

echo "==> starting web app on $APP_HOST:$APP_PORT"
# Run `next start` directly in the web package dir. Going through the package's
# `start` script (`pnpm --filter web start -- -H ...`) forwards the `--`
# literally to next, which then reads `-H` as the project directory and dies
# with "no such directory: .../apps/web/-H". `exec ... exec` avoids that.
exec pnpm --filter web exec next start -H "$APP_HOST" -p "$APP_PORT"
