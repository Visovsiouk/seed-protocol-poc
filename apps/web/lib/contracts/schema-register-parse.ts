/**
 * Pure log decoder for `EcosystemTemplate.SchemaRegistered`.
 *
 * Split from `register-schemas.ts` so tests can exercise the parser
 * without pulling wagmi/chain wiring. Same isolation pattern as
 * `factory-parse.ts`.
 */

import { decodeEventLog } from "viem";
import { ecosystemTemplateAbi } from "@abis/generated";

/**
 * Scan a tx-receipt log array for the first `SchemaRegistered` emitted by
 * `realmAddress` and return its `schemaId`. Returns null when no match is
 * found.
 *
 * Filters by emitter address so a same-tx event with the same topic shape
 * from an unrelated contract can't be mistaken for this realm's schema.
 */
export function parseSchemaRegistered(
  logs: readonly {
    address: `0x${string}`;
    topics: readonly `0x${string}`[];
    data: `0x${string}`;
  }[],
  realmAddress: `0x${string}`,
): bigint | null {
  const realm = realmAddress.toLowerCase();
  for (const log of logs) {
    if (log.address.toLowerCase() !== realm) continue;
    try {
      const decoded = decodeEventLog({
        abi: ecosystemTemplateAbi,
        data: log.data,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });
      if (decoded.eventName === "SchemaRegistered") {
        const args = decoded.args as { schemaId?: bigint };
        if (args.schemaId !== undefined) return args.schemaId;
      }
    } catch {
      // Not a SchemaRegistered log — keep scanning.
    }
  }
  return null;
}
