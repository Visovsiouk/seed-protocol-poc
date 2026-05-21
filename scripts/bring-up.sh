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
#   3. forge-builds the 12 adapter contracts
#   4. seeds + registers all 12 adapters
#   5. starts `pnpm dev`
#
# `set -e` aborts on the first failing step so you don't accidentally
# end up running the dev server against a half-seeded chain.

set -euo pipefail

# Always run relative to repo root, regardless of cwd.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> pnpm install"
pnpm install

echo "==> seeding realms (3 ecosystems + 6 schemas)"
pnpm --filter web seed

echo "==> forge build (12 adapter contracts)"
( cd contracts && forge build )

echo "==> seeding adapters (12 deploys + registry writes)"
pnpm --filter web seed:adapters

echo "==> starting dev server"
exec pnpm dev
