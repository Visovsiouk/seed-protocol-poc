#!/usr/bin/env bash
#
# One-shot bring-up against a running local anvil.
#
# Assumes the sibling `../seed-protocol` repo has already run:
#   ./deploy-local.sh   (brings up anvil + runs the genesis/bazaar forge
#                        scripts; leave the resulting anvil running)
# and that `apps/web/.env.local` has the addresses + REALM_SIGNER_MNEMONIC.
#
# This script:
#   1. installs workspace deps
#   2. seeds the three preset realms + loot schemas
#   3. forge-builds the 12 adapter contracts + CatalogEffectRegistry
#   4. seeds + registers all 12 adapters
#   5. seeds the catalog-effect registry (per-preset loot schema effects)
#   6. starts `pnpm dev` (real wallet by default; `--demo` => anvil mock wallet)
#
# Flags: --clean (wipe SQLite first), --demo (force NEXT_PUBLIC_DEMO_MODE=true).
# See the `demo-up` / `demo-up-clean` package scripts.
#
# `set -e` aborts on the first failing step so you don't accidentally
# end up running the dev server against a half-seeded chain.

set -euo pipefail

CLEAN=false
DEMO=false
for arg in "$@"; do
  [[ "$arg" == "--clean" ]] && CLEAN=true
  [[ "$arg" == "--demo" ]] && DEMO=true
done

# Always run relative to repo root, regardless of cwd.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if $CLEAN; then
  echo "==> --clean: removing SQLite db"
  rm -f apps/web/data/realms.db apps/web/data/realms.db-shm apps/web/data/realms.db-wal
fi

echo "==> pnpm install"
pnpm install

echo "==> seeding realms (3 ecosystems + 6 schemas)"
pnpm --filter web seed

echo "==> forge build (12 adapter contracts)"
( cd contracts && forge build )

echo "==> seeding adapters (12 deploys + registry writes)"
pnpm --filter web seed:adapters

echo "==> seeding catalog-effect registry (1 deploy + 3 schema writes)"
pnpm --filter web seed:catalog

# `--demo` (used by `pnpm demo-up`) forces the anvil mock-wallet demo mode;
# the default (`pnpm bring-up`) forces it off for the real RainbowKit wallet.
# Setting it in the environment here overrides whatever `.env.local` holds,
# so the choice is deterministic per script.
if $DEMO; then
  echo "==> starting dev server (DEMO MODE: anvil mock wallet)"
else
  echo "==> starting dev server (real wallet / RainbowKit)"
fi
exec env NEXT_PUBLIC_DEMO_MODE="$DEMO" pnpm dev
