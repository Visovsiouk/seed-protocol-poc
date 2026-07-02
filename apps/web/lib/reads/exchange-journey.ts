import { protocolExchangeAbi } from "@abis/generated";
import { getReadClient } from "./client";
import { getAddress } from "@/lib/contracts/addresses";
import { fetchAssetSummaries } from "./provenance";

/**
 * Exchange-journey scan for the Protocol Codex (and the hail button state).
 *
 * One pass over the exchange's full `Listed` + `Purchased` history answers
 * three per-player questions the codex needs:
 *
 *   - hasListed:    the player has ever escrowed a listing (seller side)
 *   - hasPurchased: the player has ever bought a listing (buyer side)
 *   - royaltyEarned: any sold listing's token was minted by `ownedRealm`,
 *     i.e. the player's realm has earned its 4.5% creator royalty at least
 *     once (regardless of who sold or bought)
 *
 * Same full-range strategy as lib/reads/listings.ts — fine at PoC scale,
 * Ponder is the documented escape hatch.
 */

const EXCHANGE = () => getAddress("protocolExchange");

export type ExchangeJourney = {
  hasListed: boolean;
  hasPurchased: boolean;
  royaltyEarned: boolean;
};

export async function fetchExchangeJourney(
  player: `0x${string}`,
  ownedRealm: `0x${string}` | null,
): Promise<ExchangeJourney> {
  const client = getReadClient();
  const address = EXCHANGE();

  const [listed, purchased] = await Promise.all([
    client.getContractEvents({
      address,
      abi: protocolExchangeAbi,
      eventName: "Listed",
      fromBlock: 0n,
      toBlock: "latest",
    }),
    client.getContractEvents({
      address,
      abi: protocolExchangeAbi,
      eventName: "Purchased",
      fromBlock: 0n,
      toBlock: "latest",
    }),
  ]);

  const me = player.toLowerCase();

  const hasListed = listed.some(
    (ev) => ev.args.seller?.toLowerCase() === me,
  );
  const hasPurchased = purchased.some(
    (ev) => ev.args.buyer?.toLowerCase() === me,
  );

  let royaltyEarned = false;
  if (ownedRealm && purchased.length > 0) {
    // Join Purchased → Listed to recover each sold listing's tokenId, then
    // resolve provenance to see whether the player's realm minted it.
    const tokenByListing = new Map<string, bigint>();
    for (const ev of listed) {
      if (ev.args.listingId !== undefined && ev.args.tokenId !== undefined) {
        tokenByListing.set(ev.args.listingId.toString(), ev.args.tokenId);
      }
    }
    const soldTokenIds: bigint[] = [];
    for (const ev of purchased) {
      if (ev.args.listingId === undefined) continue;
      const tokenId = tokenByListing.get(ev.args.listingId.toString());
      if (tokenId !== undefined) soldTokenIds.push(tokenId);
    }
    if (soldTokenIds.length > 0) {
      const summaries = await fetchAssetSummaries(soldTokenIds);
      const realm = ownedRealm.toLowerCase();
      royaltyEarned = soldTokenIds.some(
        (t) =>
          summaries.get(t.toString())?.mintedByRealm.toLowerCase() === realm,
      );
    }
  }

  return { hasListed, hasPurchased, royaltyEarned };
}
