#!/usr/bin/env bash
#
# Shared install + seed sequence, invoked by scripts/chain-up.sh during
# fresh-chain provisioning (which `pnpm local` and the realms-chain systemd
# unit both run). Can also be run standalone against an already-running,
# already-deployed anvil:
#
#   1. installs workspace deps
#   2. seeds the three preset realms + loot schemas
#   3. forge-builds the 12 adapter contracts + CatalogEffectRegistry
#   4. seeds + registers all 12 adapters
#   5. seeds the catalog-effect registry (per-preset loot schema effects)
#   6. provisions the Wandering Trader (dedicated burner key + float)
#
# Assumes a reachable anvil with the core protocol already deployed and
# apps/web/.env.local filled in. `set -e` aborts on the first failing step
# so callers never continue against a half-seeded chain.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> pnpm install"
pnpm install

echo "==> seeding realms (3 ecosystems + 6 schemas)"
pnpm --filter web seed

echo "==> forge build (12 adapter contracts)"
# contracts/lib is gitignored and there is no .gitmodules, so a fresh clone has
# no forge-std and the build fails parsing the test sources. CI installs it
# explicitly (.github/workflows/test.yml); do the same here so provisioning
# works from a bare clone.
[ -d contracts/lib/forge-std ] || ( cd contracts && forge install foundry-rs/forge-std )
( cd contracts && forge build )

echo "==> seeding adapters (12 deploys + registry writes)"
pnpm --filter web seed:adapters

echo "==> seeding catalog-effect registry (1 deploy + 3 schema writes)"
pnpm --filter web seed:catalog

echo "==> provisioning the Wandering Trader (dedicated burner key + float)"
pnpm --filter web seed:trader
