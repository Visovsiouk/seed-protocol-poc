#!/usr/bin/env node
/**
 * Materialises `lib/contracts/generated/` — the four JSON documents that
 * describe what is actually deployed on the active chain.
 *
 * Why the split. These four files are *generated*: `sync-addresses.mjs` writes
 * `addresses.json` after `Deploy.s.sol`, and the three seeders write the rest.
 * They used to be tracked in git, which meant every provisioned checkout had a
 * permanently dirty worktree that fought `git pull` — and a reflexive
 * `git checkout .` silently re-pointed the app at contracts that do not exist
 * on that chain. So `generated/` is gitignored, and `defaults/` is committed.
 *
 * The app imports `generated/*` statically (client components included, so a
 * runtime `fs` read is not an option); this script guarantees the directory
 * exists before `next build` / `next dev` / the seeders run.
 *
 * Modes:
 *   (no args)  fill in only what is MISSING, from `defaults/`. A fresh clone
 *              gets the committed defaults and can typecheck and build with no
 *              chain running. An already-provisioned tree is left untouched.
 *   --reset    FRESH-CHAIN reset, run by `scripts/chain-up.sh`: restore
 *              `addresses.json` from defaults (Deploy.s.sol + sync-addresses.mjs
 *              overwrite it moments later) and blank the three seeder caches to
 *              schema-only stubs.
 *
 * Why blank rather than delete on --reset: `seed-realms.ts` does a bare
 * `readFileSync` with no `existsSync` guard and ENOENT-crashes if the file is
 * gone. A stub doc with no chainId entry reads as "nothing cached", so the
 * seeders deploy fresh and re-stamp the file.
 *
 * Why blank rather than keep: the cached addresses are (deployer, nonce)-
 * deterministic. If the deploy footprint shifts, a stale cached address can land
 * on a *different* contract on the new chain — and `seed:adapters` /
 * `seed:catalog` only getCode-check the cached address before reusing it, which
 * a foreign contract passes.
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CONTRACTS = resolve(dirname(fileURLToPath(import.meta.url)), "..", "lib", "contracts");
const DEFAULTS = resolve(CONTRACTS, "defaults");
const GENERATED = resolve(CONTRACTS, "generated");

const FILES = ["addresses.json", "realms.json", "adapters.json", "catalog.json"];

/** Schema-only stubs — no chainId entry, so every seeder sees "nothing cached". */
const STUBS = {
  "realms.json": {
    $schema:
      "Per-chainId map of seeded realm addresses + per-preset schema IDs, written by `pnpm seed`. Placeholder zeros until the seeder runs.",
  },
  "adapters.json": {
    $schema:
      "Per-chainId map of deployed adapter addresses keyed by (slot, sourcePreset, targetPreset), written by `pnpm seed:adapters`.",
  },
  "catalog.json": {
    $schema:
      "Per-chainId map of the deployed CatalogEffectRegistry address + per-schema effect lists, written by `pnpm seed:catalog`. Placeholder zeros until the seeder runs.",
  },
};

const reset = process.argv.includes("--reset");

mkdirSync(GENERATED, { recursive: true });

for (const name of FILES) {
  const target = resolve(GENERATED, name);
  const stub = STUBS[name];

  if (reset && stub) {
    writeFileSync(target, JSON.stringify(stub, null, 2) + "\n", "utf-8");
    console.log(`reset  generated/${name} (schema-only stub)`);
    continue;
  }
  if (reset || !existsSync(target)) {
    copyFileSync(resolve(DEFAULTS, name), target);
    console.log(`${reset ? "reset " : "seeded"} generated/${name} from defaults/`);
  }
}
