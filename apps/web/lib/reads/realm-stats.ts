import { ecosystemTemplateAbi } from "@abis/generated";
import { getReadClient } from "./client";
import { fetchAssetSummary } from "./provenance";
import { decodeMetadataURI } from "@/lib/metadata/decode";
import { getSeededSchemaIds } from "@/lib/contracts/seeded-realms";
import type { Preset } from "@/lib/engine/types";

/**
 * Aggregate realm reads for the `/realm/[address]` panels
 * (`<MetricsRow/>` + `<BossLeaderboard/>`).
 *
 * A single `AssetMinted` scan + per-token attribute hydration powers
 * both surfaces, since the per-preset clearReceipt schemaId determines
 * which mints carry the boss-clear payload. The metrics row is
 * derivable from the same hydrated rows (lootMints / clearReceipts /
 * distinct holders / first-clear block).
 *
 * Capped at `limit` events on the scan side to keep RPC pressure
 * predictable; at PoC scale even a busy starter realm has fewer mints
 * than the cap, so the leaderboard sees the full set.
 */

export type RealmMetrics = {
  totalMints: number;
  lootMints: number;
  clearReceipts: number;
  distinctHolders: number;
  firstClearBlock: bigint | null;
};

export type BossLeaderboardEntry = {
  player: `0x${string}`;
  turns: number;
  finalHp: number;
  blockNumber: bigint;
  tokenId: bigint;
};

export type RealmStats = {
  metrics: RealmMetrics;
  leaderboard: BossLeaderboardEntry[];
};

function readNumericAttr(
  attrs: { trait_type: string; value: string | number }[],
  key: string,
): number {
  const found = attrs.find((a) => a.trait_type === key);
  if (!found) return 0;
  const n = typeof found.value === "number" ? found.value : Number(found.value);
  return Number.isFinite(n) ? n : 0;
}

export async function fetchRealmStats(args: {
  realm: `0x${string}`;
  preset: Preset | null;
  /**
   * The realm's own schema ids. Player realms register their own pair on
   * their clone, so the caller passes them through; when omitted we fall
   * back to the seeded per-preset pair (starter realms / legacy rows).
   */
  lootSchemaId?: bigint;
  clearReceiptSchemaId?: bigint;
  scanLimit?: number;
  leaderboardLimit?: number;
}): Promise<RealmStats> {
  const {
    realm,
    preset,
    lootSchemaId,
    clearReceiptSchemaId,
    scanLimit = 200,
    leaderboardLimit = 10,
  } = args;
  const client = getReadClient();

  const events = await client.getContractEvents({
    address: realm,
    abi: ecosystemTemplateAbi,
    eventName: "AssetMinted",
    fromBlock: 0n,
    toBlock: "latest",
  });
  if (events.length === 0) {
    return {
      metrics: {
        totalMints: 0,
        lootMints: 0,
        clearReceipts: 0,
        distinctHolders: 0,
        firstClearBlock: null,
      },
      leaderboard: [],
    };
  }

  // Newest first; cap so the per-token hydration stays bounded.
  const sorted = [...events].sort((a, b) =>
    b.blockNumber === a.blockNumber
      ? b.logIndex - a.logIndex
      : b.blockNumber > a.blockNumber
        ? 1
        : -1,
  );
  const window = sorted.slice(0, scanLimit);

  const seeded = preset ? getSeededSchemaIds(preset) : null;
  const lootId = Number(lootSchemaId ?? seeded?.loot ?? -1n);
  const clearId = Number(clearReceiptSchemaId ?? seeded?.clearReceipt ?? -1n);

  const hydrated = await Promise.all(
    window.map(async (ev) => {
      const a = ev.args as {
        tokenId?: bigint;
        recipient?: `0x${string}`;
      };
      if (a.tokenId === undefined || a.recipient === undefined) return null;
      let schemaId = -1;
      let attrs: { trait_type: string; value: string | number }[] = [];
      try {
        const summary = await fetchAssetSummary(a.tokenId);
        schemaId = summary.schemaId;
        const decoded = decodeMetadataURI(summary.metadataURI);
        attrs = decoded.json.attributes;
      } catch {
        // Asset hydration failed — keep the row in totals but it can't
        // contribute to the leaderboard since we lack the receipt body.
      }
      return {
        tokenId: a.tokenId,
        recipient: a.recipient,
        blockNumber: ev.blockNumber,
        schemaId,
        attrs,
      };
    }),
  );

  const rows = hydrated.filter(
    (h): h is NonNullable<typeof h> => h !== null,
  );

  const recipients = new Set<string>();
  let lootMints = 0;
  let clearReceipts = 0;
  let firstClearBlock: bigint | null = null;
  const leaderboard: BossLeaderboardEntry[] = [];

  for (const r of rows) {
    recipients.add(r.recipient.toLowerCase());
    if (r.schemaId === lootId) lootMints += 1;
    if (r.schemaId === clearId) {
      clearReceipts += 1;
      if (firstClearBlock === null || r.blockNumber < firstClearBlock) {
        firstClearBlock = r.blockNumber;
      }
      leaderboard.push({
        player: r.recipient,
        turns: readNumericAttr(r.attrs, "turns"),
        finalHp: readNumericAttr(r.attrs, "final_hp"),
        blockNumber: r.blockNumber,
        tokenId: r.tokenId,
      });
    }
  }

  // Rank: fewest turns wins, ties broken by higher remaining HP, then
  // earlier blockNumber (first to clear at the same record).
  leaderboard.sort((a, b) => {
    if (a.turns !== b.turns) return a.turns - b.turns;
    if (a.finalHp !== b.finalHp) return b.finalHp - a.finalHp;
    return a.blockNumber < b.blockNumber ? -1 : 1;
  });

  return {
    metrics: {
      totalMints: rows.length,
      lootMints,
      clearReceipts,
      distinctHolders: recipients.size,
      firstClearBlock,
    },
    leaderboard: leaderboard.slice(0, leaderboardLimit),
  };
}
