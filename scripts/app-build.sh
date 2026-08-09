#!/usr/bin/env bash
#
# Builds the web app WITHOUT touching the running one.
#
#   sudo -u realms bash scripts/app-build.sh
#
# Split out of app-up.sh so a deploy is build-then-restart rather than
# restart-then-build. The build used to run inside realms-app.service's
# ExecStart, which meant every `server-up.sh --app` took the site down for the
# whole install + `next build` (~80s measured) — and a build that failed left
# the site down instead of leaving the previous version serving.
#
# Run this first; only restart realms-app if it exits 0. scripts/server-up.sh
# does exactly that.
#
# Env overrides:
#   PNPM_INSTALL_FLAGS  default --frozen-lockfile (fail on a lockfile that does
#                       not match package.json, the way CI does). Clear it if
#                       you are deliberately deploying an updated dependency
#                       set without a refreshed lockfile.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PNPM_INSTALL_FLAGS="${PNPM_INSTALL_FLAGS:---frozen-lockfile}"

echo "==> pnpm install ${PNPM_INSTALL_FLAGS}"
# shellcheck disable=SC2086 # deliberate word splitting: may be empty or multi-flag
pnpm install ${PNPM_INSTALL_FLAGS}

echo "==> building web app (the running app is untouched until it restarts)"
pnpm --filter web build

echo "==> build OK — restart realms-app to serve it"
