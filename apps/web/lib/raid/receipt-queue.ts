/**
 * Drives the kill-receipt queue: one mint at a time, resumable, never twice.
 *
 * Batch-minting a receipt for every contributor is slow and partially
 * failure-prone — a deploy, an RPC blip or a reverted transaction halfway
 * through leaves some people paid and some not. So this is a worker over a
 * durable queue rather than a loop inside a request: `raid_receipt` holds one
 * row per receipt owed, `tx_hash IS NULL` is the pending marker, and a crash
 * leaves the unfinished rows exactly as they were.
 *
 * **Three layers of protection against a double mint**, because this is the
 * one place in the feature that spends money:
 *
 *   1. The tokenId is deterministic in `(edition, player)`, so a second mint
 *      of the same receipt collides on `UniversalAsset.create` rather than
 *      producing a second token.
 *   2. `markReceiptMinted` is guarded on `tx_hash IS NULL`, so the first
 *      write wins and a late pass cannot overwrite the recorded hash.
 *   3. The caller supplies an `alreadyMinted` probe — the `balanceOf` check
 *      at `blockTag: "pending"` that `/api/realm/boss-cleared` already uses —
 *      so a receipt that landed on chain but whose db write was lost is
 *      recognised rather than re-sent.
 *
 * The chain calls are **injected**, not imported. That keeps this testable
 * without a node, and it is the same reason `raid-store.ts` takes a db
 * handle: the logic worth testing here is the ordering and the resumption,
 * not viem.
 */

import type { Database as DatabaseType } from "better-sqlite3";

import {
  enqueueKillReceipts,
  markReceiptMinted,
  pendingReceipts,
  type RaidReceipt,
} from "@/lib/server/raid-store";
import {
  buildRaidReceiptMetadataURI,
  deriveRaidReceiptTokenId,
  shareBps,
} from "./receipt-derive";

/** What the worker needs from the chain, supplied by the caller. */
export type ReceiptChain = {
  /**
   * True when this tokenId already exists on chain. Should read at
   * `blockTag: "pending"` so a mint still in the mempool counts — otherwise
   * a retry inside one block re-sends it.
   */
  alreadyMinted: (tokenId: bigint) => Promise<boolean>;
  /** Mint it. Resolves with the transaction hash once it has confirmed. */
  mint: (args: {
    tokenId: bigint;
    recipient: `0x${string}`;
    metadataURI: string;
  }) => Promise<`0x${string}`>;
};

export type DrainResult = {
  minted: number;
  /** Receipts found already on chain, so skipped rather than re-sent. */
  skipped: number;
  /** Receipts that threw. The rows stay pending for the next pass. */
  failed: { player: `0x${string}`; message: string }[];
  remaining: number;
};

/**
 * Write the queue for an edition that has fallen.
 *
 * Separate from draining so the kill path can record what is owed
 * immediately — a synchronous, local, fast write — without waiting on any
 * chain work. If the process dies between the two, the queue is still there.
 */
export function enqueueForEdition(
  db: DatabaseType,
  edition: number,
): RaidReceipt[] {
  return enqueueKillReceipts(
    db,
    edition,
    deriveRaidReceiptTokenId,
    shareBps,
  );
}

/**
 * Mint whatever is still owed for an edition.
 *
 * Sequential on purpose. These mints are signed by one server key, so they
 * share a nonce — firing them in parallel is how you get nonce collisions
 * and silently dropped transactions. The caller wraps this in
 * `withSignerLock` for the same reason; the sequencing here is the inner
 * guarantee, not a substitute for it.
 *
 * A single failure does not abort the run: the row stays pending, the error
 * is collected, and the rest still go out. Stopping on the first failure
 * would let one bad recipient hold up everybody else's receipt.
 */
export async function drainReceipts(
  db: DatabaseType,
  edition: number,
  chain: ReceiptChain,
  editionHp: number,
  felledAt: number,
): Promise<DrainResult> {
  const queue = pendingReceipts(db, edition);
  const result: DrainResult = {
    minted: 0,
    skipped: 0,
    failed: [],
    remaining: 0,
  };

  for (const receipt of queue) {
    const tokenId = BigInt(receipt.tokenId);
    try {
      if (await chain.alreadyMinted(tokenId)) {
        // On chain but not recorded — the db write was lost after the mint
        // landed. Record it rather than minting again; there is no hash to
        // store, so a sentinel marks it reconciled.
        result.skipped += 1;
        markReceiptMinted(db, edition, receipt.player, RECONCILED);
        continue;
      }
      const metadataURI = buildRaidReceiptMetadataURI({
        edition,
        player: receipt.player,
        damage: receipt.damage,
        editionHp,
        attempts: receipt.attempts,
        killingBlow: receipt.killingBlow,
        felledAt,
      });
      const txHash = await chain.mint({
        tokenId,
        recipient: receipt.player,
        metadataURI,
      });
      markReceiptMinted(db, edition, receipt.player, txHash);
      result.minted += 1;
    } catch (e) {
      result.failed.push({
        player: receipt.player,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  result.remaining = pendingReceipts(db, edition).length;
  return result;
}

/**
 * Stands in for a transaction hash on a receipt that was found already
 * minted, so the row can leave the pending set without pretending to know a
 * hash it never saw. Distinguishable from a real hash on sight, which is the
 * point — an operator reading the table should be able to tell "we minted
 * this" from "we found it already there".
 */
export const RECONCILED =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
