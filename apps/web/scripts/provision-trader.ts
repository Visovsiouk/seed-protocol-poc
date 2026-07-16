/**
 * `pnpm seed:trader` — provisions the Wandering Trader's dedicated burner
 * key and float (anvil only). Invoked by `scripts/seed-all.sh` so every
 * bring-up gets a trader that can actually sign and pay.
 *
 * What it does:
 *   1. Rotates `TRADER_PRIVATE_KEY` in `.env.local` to a freshly generated
 *      random key when the current value is missing, the all-zeros
 *      placeholder, or one of anvil's ten well-known default accounts.
 *      Those defaults are shared with the demo player (#9), the realm
 *      signer keyring (0–3) and player-realm minter delegates (4+), so the
 *      trader must not squat on any of them.
 *   2. Tops the trader's balance up to `TRADER_FUND_WEI` (default 10 ETH)
 *      via `anvil_setBalance`. This is also the trader's *total spending
 *      budget* — together with the per-item appraisal cap it bounds what
 *      the trader can ever pay out.
 *
 * Idempotency: a healthy dedicated key is kept (rotating would reset the
 * on-chain "one deal per seller" history); the balance is only raised,
 * never lowered.
 *
 * Non-anvil chains are refused — a real deployment must generate and fund
 * its trader key deliberately (see deploy/README.md).
 *
 * Run with:
 *   pnpm --filter web seed:trader
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { createPublicClient, formatEther, http } from "viem";
import {
  generatePrivateKey,
  mnemonicToAccount,
  privateKeyToAccount,
} from "viem/accounts";

const ENV_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  ".env.local",
);

const PLACEHOLDER_KEY = `0x${"0".repeat(64)}`;
const ANVIL_TEST_MNEMONIC =
  "test test test test test test test test test test test junk";
const DEFAULT_FUND_WEI = 10_000_000_000_000_000_000n; // 10 ETH

/** Addresses of anvil's ten default accounts (indices 0..9). */
const anvilDefaultAddresses = new Set(
  Array.from({ length: 10 }, (_, i) =>
    mnemonicToAccount(ANVIL_TEST_MNEMONIC, { addressIndex: i })
      .address.toLowerCase(),
  ),
);

function needsRotation(key: string | undefined): string {
  if (!key) return "not set";
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) return "malformed";
  if (key === PLACEHOLDER_KEY) return "all-zeros placeholder";
  const address = privateKeyToAccount(key as `0x${string}`).address;
  if (anvilDefaultAddresses.has(address.toLowerCase())) {
    return `anvil default account ${address} (shared with player/signer keys)`;
  }
  return "";
}

async function main() {
  if (process.env.NEXT_PUBLIC_CHAIN !== "anvil") {
    console.error(
      "seed:trader only provisions anvil. On a real chain, generate a key " +
        "with `cast wallet new`, fund it, and set TRADER_PRIVATE_KEY yourself.",
    );
    process.exit(1);
  }

  const rpcUrl =
    process.env.TRADER_RPC_URL ??
    process.env.NEXT_PUBLIC_RPC_URL ??
    "http://127.0.0.1:8545";

  // --- 1. Key: rotate if shared or unusable, keep if already dedicated ----
  let key = process.env.TRADER_PRIVATE_KEY;
  const reason = needsRotation(key);
  if (reason) {
    key = generatePrivateKey();
    const env = readFileSync(ENV_PATH, "utf8");
    const line = `TRADER_PRIVATE_KEY=${key}`;
    const patched = /^TRADER_PRIVATE_KEY=.*$/m.test(env)
      ? env.replace(/^TRADER_PRIVATE_KEY=.*$/m, line)
      : `${env.trimEnd()}\n\n# Dedicated Wandering Trader burner (written by seed:trader)\n${line}\n`;
    writeFileSync(ENV_PATH, patched);
    console.log(`rotated TRADER_PRIVATE_KEY (was ${reason})`);
  } else {
    console.log("keeping existing dedicated trader key");
  }
  const trader = privateKeyToAccount(key as `0x${string}`);

  // --- 2. Float: top up to the fund target (never lowered) ---------------
  const target = BigInt(process.env.TRADER_FUND_WEI ?? DEFAULT_FUND_WEI);
  const client = createPublicClient({ transport: http(rpcUrl) });
  const balance = await client.getBalance({ address: trader.address });
  if (balance < target) {
    await client.request({
      // anvil cheat method — the reason this script is anvil-only.
      method: "anvil_setBalance" as never,
      params: [trader.address, `0x${target.toString(16)}`] as never,
    });
    console.log(
      `funded trader to ${formatEther(target)} ETH (was ${formatEther(balance)})`,
    );
  } else {
    console.log(`trader already holds ${formatEther(balance)} ETH`);
  }

  const floor = BigInt(process.env.TRADER_FLOAT_MIN_WEI ?? "0");
  if (target < floor) {
    console.warn(
      `warning: fund target ${formatEther(target)} ETH is below TRADER_FLOAT_MIN_WEI — the trader will refuse to act`,
    );
  }

  console.log(`trader ready: ${trader.address}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
