/**
 * Deterministic ids and metadata for Colophon kill receipts.
 *
 * Mirrors `lib/contracts/clear-receipt-derive.ts` deliberately — same
 * domain-tag discipline, same "same inputs → same tokenId" property, so a
 * retried mint collides on `UniversalAsset.create` rather than producing a
 * second token. That idempotency is what makes the mint queue safe to resume
 * after a crash.
 *
 * Pure: no chain reads, no db, no env. Importable from anywhere.
 */

import { encodePacked, keccak256, stringToHex } from "viem";
import { b64 } from "@/lib/utils";

/**
 * Its own domain tag, separate from `Realms.ClearReceipt`.
 *
 * A raid receipt and a boss-clear receipt are different things with
 * different schemas, and their input tuples differ — but a shared tag would
 * mean a future packing change could collide them. The existing deriver
 * made the same call for the same reason; this follows it rather than
 * inventing a new convention.
 */
const DOMAIN = stringToHex("Realms.ColophonReceipt", { size: 32 });

/**
 * One receipt per contributor per edition, so the tuple is exactly
 * `(edition, player)`.
 *
 * Note this is **not** keyed on the contribution row. The plan said to drive
 * the queue from one, but a contributor has many attempts and the receipt is
 * for their total — keying on attempts would mint thirty receipts to someone
 * who fought thirty times. The queue is keyed on the recipient instead, and
 * the contribution rows are what the totals are computed *from*.
 */
export function deriveRaidReceiptTokenId(args: {
  edition: number;
  player: `0x${string}`;
}): bigint {
  const packed = encodePacked(
    ["bytes32", "uint256", "address"],
    [DOMAIN, BigInt(args.edition), args.player],
  );
  return BigInt(keccak256(packed));
}

export type RaidReceiptFacts = {
  edition: number;
  player: `0x${string}`;
  /** HP this player took off the pool across every attempt. */
  damage: number;
  /** The edition's full pool, so share is legible from the token alone. */
  editionHp: number;
  attempts: number;
  /** True for the one contributor who landed the final blow. */
  killingBlow: boolean;
  felledAt: number;
};

/**
 * Share in basis points, floored.
 *
 * Floored rather than rounded so the shares can never sum above 100% —
 * which matters because the sum is a thing a reader will add up. It can sum
 * slightly *under*, and that is the honest direction for a rounding error.
 */
export function shareBps(damage: number, editionHp: number): number {
  if (editionHp <= 0) return 0;
  return Math.floor((damage / editionHp) * 10_000);
}

export function buildRaidReceiptMetadataURI(args: RaidReceiptFacts): string {
  const bps = shareBps(args.damage, args.editionHp);
  const pct = (bps / 100).toFixed(2);
  const attributes = [
    { trait_type: "Schema", value: "colophon:killReceipt" },
    { trait_type: "player", value: args.player },
    { trait_type: "edition", value: args.edition },
    { trait_type: "damage", value: args.damage },
    { trait_type: "edition_hp", value: args.editionHp },
    { trait_type: "share_bps", value: bps },
    { trait_type: "attempts", value: args.attempts },
    { trait_type: "killing_blow", value: args.killingBlow ? "yes" : "no" },
    { trait_type: "felled_at", value: args.felledAt },
  ];

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<rect width="100" height="100" fill="#120f0c"/>` +
    `<text x="50" y="44" font-size="9" text-anchor="middle" fill="#d4af37">COLOPHON</text>` +
    `<text x="50" y="58" font-size="7" text-anchor="middle" fill="#9c8f7a">EDITION ${args.edition}</text>` +
    `<text x="50" y="72" font-size="6" text-anchor="middle" fill="#6f665a">${pct}%</text>` +
    (args.killingBlow
      ? `<text x="50" y="86" font-size="6" text-anchor="middle" fill="#d4af37">FINAL BLOW</text>`
      : "") +
    `</svg>`;

  const json = {
    name: args.killingBlow
      ? `The Colophon, Edition ${args.edition} — the final blow`
      : `The Colophon, Edition ${args.edition}`,
    description: args.killingBlow
      ? `Landed the blow that closed edition ${args.edition}, after taking ${args.damage.toLocaleString("en-US")} of its ${args.editionHp.toLocaleString("en-US")} weight across ${args.attempts} attempt(s).`
      : `Took ${args.damage.toLocaleString("en-US")} of edition ${args.edition}'s ${args.editionHp.toLocaleString("en-US")} weight across ${args.attempts} attempt(s) — ${pct}% of what it took to put him down.`,
    image: `data:image/svg+xml;base64,${b64(svg)}`,
    attributes,
    seed_protocol: {
      schema: "killReceipt",
      edition: args.edition,
      damage: args.damage,
      shareBps: bps,
      killingBlow: args.killingBlow,
    },
  };
  return `data:application/json;base64,${b64(JSON.stringify(json))}`;
}
