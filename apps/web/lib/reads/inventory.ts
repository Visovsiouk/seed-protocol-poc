import { universalAssetAbi } from "@abis/generated";
import { getReadClient } from "./client";
import { getAddress } from "@/lib/contracts/addresses";

/**
 * Inventory read. Scans `TransferSingle` + `TransferBatch`
 * events involving `player` to find every tokenId they have ever touched,
 * then calls `balanceOf` / `balanceOfBatch` for the live balances. Filters
 * out zero balances so the UI only sees what's actually held.
 *
 * Why event-scan rather than enumerating all token IDs: ERC-1155 doesn't
 * expose enumeration. At PoC scale (single-digit-thousand token IDs across
 * the protocol) the log scan is fast; if it ever isn't, the spec's escape
 * hatch is Ponder.
 */

export type InventoryEntry = {
  tokenId: bigint;
  balance: bigint;
};

const ASSET = () => getAddress("universalAsset");

export async function fetchInventory(
  player: `0x${string}`,
): Promise<InventoryEntry[]> {
  const client = getReadClient();
  const address = ASSET();

  // Gather every tokenId where `player` was either the `from` or `to` of a
  // transfer. UniversalAsset emits TransferSingle on mint (from = 0x0) and
  // on user-to-user transfers; TransferBatch on batched transfers.
  const [singleIn, singleOut, batchIn, batchOut] = await Promise.all([
    client.getContractEvents({
      address,
      abi: universalAssetAbi,
      eventName: "TransferSingle",
      args: { to: player },
      fromBlock: 0n,
      toBlock: "latest",
    }),
    client.getContractEvents({
      address,
      abi: universalAssetAbi,
      eventName: "TransferSingle",
      args: { from: player },
      fromBlock: 0n,
      toBlock: "latest",
    }),
    client.getContractEvents({
      address,
      abi: universalAssetAbi,
      eventName: "TransferBatch",
      args: { to: player },
      fromBlock: 0n,
      toBlock: "latest",
    }),
    client.getContractEvents({
      address,
      abi: universalAssetAbi,
      eventName: "TransferBatch",
      args: { from: player },
      fromBlock: 0n,
      toBlock: "latest",
    }),
  ]);

  const seen = new Set<string>();
  for (const ev of [...singleIn, ...singleOut]) {
    const id = (ev.args as { id?: bigint }).id;
    if (id !== undefined) seen.add(id.toString());
  }
  for (const ev of [...batchIn, ...batchOut]) {
    const ids = (ev.args as { ids?: readonly bigint[] }).ids;
    if (ids) for (const id of ids) seen.add(id.toString());
  }

  if (seen.size === 0) return [];

  const tokenIds = Array.from(seen).map((s) => BigInt(s));

  // balanceOfBatch takes parallel accounts/ids arrays of equal length.
  const accounts = tokenIds.map(() => player);
  const balances = (await client.readContract({
    address,
    abi: universalAssetAbi,
    functionName: "balanceOfBatch",
    args: [accounts, tokenIds],
  })) as readonly bigint[];

  const out: InventoryEntry[] = [];
  for (let i = 0; i < tokenIds.length; i++) {
    if (balances[i] > 0n) {
      out.push({ tokenId: tokenIds[i], balance: balances[i] });
    }
  }
  out.sort((a, b) => (a.tokenId < b.tokenId ? -1 : 1));
  return out;
}
