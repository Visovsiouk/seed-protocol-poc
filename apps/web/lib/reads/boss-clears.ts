import { ecosystemTemplateAbi, seedSbtAbi } from "@abis/generated";
import { getReadClient } from "./client";
import { fetchAssetSummary } from "./provenance";
import { decodeMetadataURI } from "@/lib/metadata/decode";
import { getAddress } from "@/lib/contracts/addresses";
import { getSeededSchemaIds } from "@/lib/contracts/seeded-realms";
import {
  listStarterRealms,
  isStarterRealmDeployed,
} from "@/lib/contracts/starter-realms";
import type { Preset } from "@/lib/engine/types";
import type { BossClearEvent } from "@/lib/tutorial/progress";

/**
 * Tutorial-progress readers.
 *
 * Two on-chain reads back the tutorial overlay:
 *
 *   1. `fetchBossClears(player)` — scans `AssetMinted(tokenId, recipient,
 *      amount)` on each *deployed* starter-realm template, hydrates each
 *      tokenId's attributes to filter down to the per-realm clearReceipt
 *      schemaId, and decodes the metadata data URI to surface the
 *      `turns` + `final_hp` recorded by the realm-owner mint.
 *
 *   2. `fetchHasSeed(player)` — `SeedSBT.balanceOf(player) > 0`.
 *
 * Both feed `deriveTutorialProgress` to compute Act + `eligibleForSeed`.
 *
 * Note on schemaId scoping: every realm clone registers its own
 * (clearReceipt, loot) pair against the global SchemaRegistry, so the
 * id is per-preset. We resolve it via `getSeededSchemaIds(preset)`.
 * Zero means "schema not seeded yet" on this chain — we skip the realm.
 */

type StarterRealmEntry = { preset: Preset; realm: `0x${string}` };

function deployedStarterRealms(): StarterRealmEntry[] {
  return listStarterRealms()
    .filter(({ realm }) => isStarterRealmDeployed(realm))
    .map(({ preset, realm }) => ({ preset, realm }));
}

/**
 * Pull a numeric attribute out of the decoded metadata. The mint route
 * writes integers but downstream decoders surface them as `string |
 * number`; we accept either and clamp the result.
 */
function readNumericAttr(
  attrs: { trait_type: string; value: string | number }[],
  key: string,
): number {
  const found = attrs.find((a) => a.trait_type === key);
  if (!found) return 0;
  const n = typeof found.value === "number" ? found.value : Number(found.value);
  return Number.isFinite(n) ? n : 0;
}

export async function fetchBossClears(
  player: `0x${string}`,
): Promise<BossClearEvent[]> {
  const realms = deployedStarterRealms();
  if (realms.length === 0) return [];

  const client = getReadClient();

  const perRealm = await Promise.all(
    realms.map(async ({ realm, preset }) => {
      const clearReceiptSchemaId = getSeededSchemaIds(preset).clearReceipt;
      if (clearReceiptSchemaId === 0n) return [] as BossClearEvent[];

      // AssetMinted is emitted on the realm clone itself when the owner
      // calls `mintAsset`. Filter by `recipient` (indexed) so we only
      // pull this player's mints — across both loot and clearReceipt
      // mints, which we disambiguate below by schemaId.
      const events = await client.getContractEvents({
        address: realm,
        abi: ecosystemTemplateAbi,
        eventName: "AssetMinted",
        args: { recipient: player },
        fromBlock: 0n,
        toBlock: "latest",
      });
      if (events.length === 0) return [] as BossClearEvent[];

      const wantedSchemaId = Number(clearReceiptSchemaId);

      // Resolve each minted tokenId to (schemaId, metadataURI) so we
      // can keep only the clearReceipt mints and decode the receipt
      // body. fetchAssetSummary reads UniversalAsset, which is the
      // canonical attribute store — the realm clone doesn't hold its
      // own copy.
      const hydrated = await Promise.all(
        events.map(async (ev) => {
          const tokenId = (ev.args as { tokenId?: bigint }).tokenId;
          if (tokenId === undefined) return null;
          try {
            const summary = await fetchAssetSummary(tokenId);
            if (summary.schemaId !== wantedSchemaId) return null;
            const decoded = decodeMetadataURI(summary.metadataURI);
            return {
              tokenId,
              attrs: decoded.json.attributes,
              blockNumber: ev.blockNumber,
              logIndex: ev.logIndex,
            };
          } catch {
            // Either the read failed, the asset has no metadata yet, or
            // the metadata isn't our base64-JSON shape (e.g. an
            // externally-minted asset). Either way it isn't a
            // clearReceipt we can read — drop it.
            return null;
          }
        }),
      );

      // Resolve real wall-clock timestamps from the block headers so the
      // UI can render "cleared Nm/h/d ago" without faking the math.
      // Deduped per blockNumber because a single block can carry several
      // mints (Anvil with auto-mining batches an entire test's txs into
      // one block). Bounded by the number of distinct clear blocks for
      // this player — small, well below any RPC concern.
      const uniqueBlocks = new Map<bigint, Promise<bigint>>();
      const blockTs = async (bn: bigint): Promise<bigint> => {
        let p = uniqueBlocks.get(bn);
        if (!p) {
          p = client
            .getBlock({ blockNumber: bn })
            .then((b) => b.timestamp);
          uniqueBlocks.set(bn, p);
        }
        return p;
      };

      const out: BossClearEvent[] = [];
      for (const h of hydrated) {
        if (!h) continue;
        out.push({
          realm,
          preset,
          finalHp: readNumericAttr(h.attrs, "final_hp"),
          turns: readNumericAttr(h.attrs, "turns"),
          ts: Number(await blockTs(h.blockNumber)),
          blockNumber: h.blockNumber,
          logIndex: h.logIndex,
        });
      }
      return out;
    }),
  );

  return perRealm.flat();
}

/**
 * SeedSBT balance check. The SBT is soulbound — a balance ≥ 1 means the
 * player owns it. Returns false for zero addresses or RPC failures so
 * the tutorial overlay degrades gracefully.
 */
export async function fetchHasSeed(player: `0x${string}`): Promise<boolean> {
  const client = getReadClient();
  const balance = await client.readContract({
    address: getAddress("seedSBT"),
    abi: seedSbtAbi,
    functionName: "balanceOf",
    args: [player],
  });
  return balance > 0n;
}
