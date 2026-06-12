import { ecosystemTemplateAbi } from "@abis/generated";
import { getReadClient } from "./client";
import { fetchAssetSummary } from "./provenance";
import { getSeededSchemaIds } from "@/lib/contracts/seeded-realms";
import type { Preset } from "@/lib/engine/types";

/**
 * Per-realm activity feed.
 *
 * Scans the realm clone's `AssetMinted(tokenId, recipient, amount)`
 * events and disambiguates them into `loot` vs `clearReceipt` via the
 * per-preset seeded schema IDs. Recipient is included so the surface
 * can show "X claimed a clearReceipt".
 *
 * Capped at the most recent N events to keep the on-chain scan + the
 * follow-up `fetchAssetSummary` fan-out predictable. The realm
 * dashboard renders the top 8; the full history isn't a PoC-stage
 * requirement.
 */

export type RealmActivityKind = "loot" | "clear-receipt" | "unknown";

export type RealmActivityEntry = {
  tokenId: bigint;
  recipient: `0x${string}`;
  blockNumber: bigint;
  logIndex: number;
  txHash: `0x${string}`;
  kind: RealmActivityKind;
};

export async function fetchRealmActivity(args: {
  realm: `0x${string}`;
  preset: Preset | null;
  /**
   * The realm's own schema ids. Player realms register their own pair on
   * their clone, so the caller passes them through; when omitted we fall
   * back to the seeded per-preset pair (starter realms / legacy rows).
   */
  lootSchemaId?: bigint;
  clearReceiptSchemaId?: bigint;
  limit?: number;
}): Promise<RealmActivityEntry[]> {
  const { realm, preset, lootSchemaId, clearReceiptSchemaId, limit = 12 } = args;
  const client = getReadClient();

  const events = await client.getContractEvents({
    address: realm,
    abi: ecosystemTemplateAbi,
    eventName: "AssetMinted",
    fromBlock: 0n,
    toBlock: "latest",
  });
  if (events.length === 0) return [];

  // Sort newest first and cap before hydrating attributes — the
  // schemaId read is per-token and we don't want to fan-out hundreds
  // of reads on a busy realm.
  const sorted = [...events].sort((a, b) =>
    b.blockNumber === a.blockNumber
      ? b.logIndex - a.logIndex
      : b.blockNumber > a.blockNumber
        ? 1
        : -1,
  );
  const window = sorted.slice(0, limit);

  const seeded = preset ? getSeededSchemaIds(preset) : null;
  const lootId = Number(lootSchemaId ?? seeded?.loot ?? -1n);
  const clearId = Number(clearReceiptSchemaId ?? seeded?.clearReceipt ?? -1n);

  const hydrated = await Promise.all(
    window.map(async (ev): Promise<RealmActivityEntry | null> => {
      const a = ev.args as {
        tokenId?: bigint;
        recipient?: `0x${string}`;
      };
      if (a.tokenId === undefined || a.recipient === undefined) return null;
      let kind: RealmActivityKind = "unknown";
      try {
        const summary = await fetchAssetSummary(a.tokenId);
        if (summary.schemaId === lootId) kind = "loot";
        else if (summary.schemaId === clearId) kind = "clear-receipt";
      } catch {
        // Asset summary read failed (e.g. revert on an unindexed token).
        // Leave as "unknown" rather than dropping the row — the feed is
        // a visual history, not a load-bearing read.
      }
      return {
        tokenId: a.tokenId,
        recipient: a.recipient,
        blockNumber: ev.blockNumber,
        logIndex: ev.logIndex,
        txHash: ev.transactionHash,
        kind,
      };
    }),
  );

  return hydrated.filter((e): e is RealmActivityEntry => e !== null);
}
