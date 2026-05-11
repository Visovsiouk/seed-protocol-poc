import "server-only";

import { getServerEnv } from "@/lib/env";
import { loadTraderClient } from "./client";

export class FloatLowError extends Error {
  constructor(public balance: bigint, public floor: bigint) {
    super(
      `Trader balance ${balance.toString()} below floor ${floor.toString()}`,
    );
    this.name = "FloatLowError";
  }
}

/**
 * Ensures the Trader's native-token balance is at least
 * `TRADER_FLOAT_MIN_WEI` before signing a tx. Cheap (single RPC call) and
 * stops a depleted Trader from emitting cryptic "insufficient funds" errors
 * to users.
 */
export async function enforceFloat(): Promise<void> {
  const { publicClient, account } = loadTraderClient();
  const env = getServerEnv();
  const floor = BigInt(env.TRADER_FLOAT_MIN_WEI);

  const balance = await publicClient.getBalance({ address: account.address });
  if (balance < floor) {
    throw new FloatLowError(balance, floor);
  }
}
