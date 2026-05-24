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
#   6. starts `pnpm dev`
#
# `set -e` aborts on the first failing step so you don't accidentally
# end up running the dev server against a half-seeded chain.

set -euo pipefail

CLEAN=false
for arg in "$@"; do
  [[ "$arg" == "--clean" ]] && CLEAN=true
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

echo "==> starting dev server"
exec pnpm dev
