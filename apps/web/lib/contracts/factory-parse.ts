/**
 * Pure log decoder for `EcosystemFactory.EcosystemCreated`.
 *
 * Split from `factory.ts` so tests can exercise the parser without
 * pulling `chain.ts`/`addresses.ts` (which validates env vars at module
 * load). Same isolation pattern as `realm-display.ts`.
 */

import { decodeEventLog } from "viem";
import { ecosystemFactoryAbi } from "@abis/generated";

export type EcosystemCreatedLog = {
  ecosystem: `0x${string}`;
  owner: `0x${string}`;
};

/**
 * Scan a tx-receipt log array for the first `EcosystemCreated` emitted
 * by `factoryAddress`. Returns null when no match is found.
 *
 * Filters by emitter address so we don't accidentally pick up an event
 * with the same topic shape from an unrelated contract in the same tx.
 */
export function parseEcosystemCreated(
  logs: readonly {
    address: `0x${string}`;
    topics: readonly `0x${string}`[];
    data: `0x${string}`;
  }[],
  factoryAddress: `0x${string}`,
): EcosystemCreatedLog | null {
  const factory = factoryAddress.toLowerCase();
  for (const log of logs) {
    if (log.address.toLowerCase() !== factory) continue;
    try {
      const decoded = decodeEventLog({
        abi: ecosystemFactoryAbi,
        data: log.data,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });
      if (decoded.eventName === "EcosystemCreated") {
        const args = decoded.args as {
          ecosystem?: `0x${string}`;
          owner?: `0x${string}`;
        };
        if (args.ecosystem && args.owner) {
          return { ecosystem: args.ecosystem, owner: args.owner };
        }
      }
    } catch {
      // Not an EcosystemCreated log — keep scanning.
    }
  }
  return null;
}
