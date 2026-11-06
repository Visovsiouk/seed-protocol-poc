import "server-only";

/**
 * The on-chain half of the kill-receipt queue: a `ReceiptChain` bound to the
 * real contracts.
 *
 * Everything structural lives in `lib/raid/receipt-queue.ts`, which takes
 * this as an argument — ordering, resumption and the three double-mint
 * guards are tested there against a fake. This file is only the viem.
 *
 * ## Minted from the fantasy starter realm
 *
 * The raid is global but `mintAsset` is a method on an `EcosystemTemplate`,
 * so a receipt has to come *from* some realm. Rather than give the Colophon
 * an ecosystem of its own — a deploy, an owner, a minter delegate, a seeding
 * step — it mints from the fantasy starter, which already has all of those
 * and whose owner key the server already holds. `colophonBoss` presents the
 * raid in the fantasy register for the same reason: the Colophon is the book
 * itself rather than any one realm's genre.
 *
 * ## Why the lock wraps the whole drain, not each mint
 *
 * `withSignerLock` serialises the pending-nonce read and the broadcast so two
 * callers cannot claim the same nonce. A drain sends N transactions from one
 * key, so the lock belongs *outside* the loop: taking it per mint would let
 * another route's mint interleave and leave this one reading a stale nonce
 * for its next send.
 */

import { ecosystemTemplateAbi, universalAssetAbi } from "@abis/generated";

import { getAddress } from "@/lib/contracts/addresses";
import { getSeededRealm, getSeededSchemaIds } from "@/lib/contracts/seeded-realms";
import { getOwnerSigner, getPublicClient } from "@/lib/server/realm-signer";
import { withSignerLock } from "@/lib/server/signer-nonce-lock";
import type { ReceiptChain } from "@/lib/raid/receipt-queue";

/** The register the raid is presented in — see `lib/raid/colophon.ts`. */
const RAID_PRESET = "fantasy" as const;

/**
 * Tier stamped on a kill receipt: 0, matching `clearReceipt`.
 *
 * A receipt has no tier semantics — it is a record, not gear — and
 * `SeedTypes.Tier` is a **0-indexed enum** where 0 is T1. An earlier version
 * of this used 5 on the reasoning that a receipt for the hardest thing in
 * the game should not read as a trinket; that is out of range for a
 * five-member enum and reverted every mint. Tier is also what the emission
 * controller charges against, so a high tier spends the realm's budget for
 * a token that carries no power.
 */
const RECEIPT_TIER = 0;

export class RaidReceiptChainUnavailable extends Error {}

/**
 * Build a `ReceiptChain` against the live contracts.
 *
 * Throws rather than returning a half-working object when the realm or the
 * schema is unseeded: a drain that silently minted nothing would look
 * identical to a drain with nothing owed, and the difference matters.
 */
export function createRaidReceiptChain(): ReceiptChain & {
  /** Runs `fn` with the mint signer's lock held for its whole duration. */
  locked: <T>(fn: () => Promise<T>) => Promise<T>;
} {
  const realm = getSeededRealm(RAID_PRESET);
  if (realm === "0x0000000000000000000000000000000000000000") {
    throw new RaidReceiptChainUnavailable(
      `${RAID_PRESET} realm is not seeded on this chain — run \`pnpm seed\``,
    );
  }
  const { killReceipt: schemaId } = getSeededSchemaIds(RAID_PRESET);
  if (schemaId === 0n) {
    throw new RaidReceiptChainUnavailable(
      "killReceipt schema is not registered on this chain — run `pnpm seed`",
    );
  }

  const signer = getOwnerSigner(RAID_PRESET);
  const publicClient = getPublicClient();

  return {
    locked: (fn) => withSignerLock(signer.account.address, fn),

    /**
     * Read at `pending`, not `latest`, so a mint already queued in this
     * drain is visible before it is mined — otherwise a resumed pass would
     * re-send what the previous one just broadcast.
     *
     * Fails *closed*, unlike the equivalent probe in
     * `/api/realm/boss-cleared`. That one fails open because a duplicate
     * clear receipt is cheaper than a broken clear flow; here the row stays
     * pending and the next pass retries, so refusing to mint on an
     * unreadable chain costs a delay rather than a duplicate token.
     */
    alreadyMinted: async ({ tokenId, recipient }) => {
      const balance = (await publicClient.readContract({
        address: getAddress("universalAsset"),
        abi: universalAssetAbi,
        functionName: "balanceOf",
        // The RECIPIENT's balance, not the signer's — the receipt is minted
        // to the contributor, so asking about the minter would read zero
        // forever and re-send every receipt on every pass.
        args: [recipient, tokenId],
        blockTag: "pending",
      })) as bigint;
      return balance > 0n;
    },

    mint: async ({ tokenId, recipient, metadataURI }) => {
      const nonce = await publicClient.getTransactionCount({
        address: signer.account.address,
        blockTag: "pending",
      });
      const hash = await signer.wallet.writeContract({
        address: realm,
        abi: ecosystemTemplateAbi,
        functionName: "mintAsset",
        args: [
          recipient,
          tokenId,
          1n,
          {
            tier: RECEIPT_TIER,
            extensionSchemaId: schemaId,
            metadataURI,
          },
        ],
        account: signer.account,
        chain: signer.wallet.chain,
        nonce,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    },
  };
}
