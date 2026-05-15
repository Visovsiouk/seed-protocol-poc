/**
 * Pure helpers shared by the client `useMintClearReceipt` hook and the
 * server `/api/realm/boss-cleared` route. Both sides must derive the
 * same `tokenId` + metadata or the tutorial-progress reader won't
 * reconcile the receipt back to the run that produced it.
 *
 * Mirror of `loot-derive.ts` for the clearReceipt schema.
 */

import { encodePacked, keccak256, stringToHex } from "viem";
import type { Preset } from "@/lib/engine/types";

/**
 * Domain-separation tag so a clear-receipt tokenId can never collide
 * with a loot tokenId — the two derivers consume different field sets,
 * but a domain tag makes the separation explicit and survives future
 * refactors that change either packing.
 */
const DOMAIN = stringToHex("Realms.ClearReceipt", { size: 32 });

/**
 * Deterministic tokenId for a boss-clear receipt. Inputs:
 *   - realm:   the realm clone the receipt is minted from
 *   - player:  the address that cleared the boss
 *   - runSeed: pins the receipt to the specific run
 *   - bossId:  engine catalog id (e.g. "forest_hag")
 *
 * Same `(realm, player, runSeed, bossId)` → same tokenId, so a retried
 * POST is idempotent against `UniversalAsset.create`.
 */
export function deriveClearReceiptTokenId(args: {
  realm: `0x${string}`;
  player: `0x${string}`;
  runSeed: `0x${string}`;
  bossId: string;
}): bigint {
  const bossIdHash = keccak256(stringToHex(args.bossId));
  const packed = encodePacked(
    ["bytes32", "address", "address", "bytes32", "bytes32"],
    [DOMAIN, args.realm, args.player, args.runSeed, bossIdHash],
  );
  return BigInt(keccak256(packed));
}

function b64(s: string): string {
  // Prefer Node's Buffer when available (server) — `btoa` exists in Node
  // 16+ but throws InvalidCharacterError on any non-Latin-1 byte. Realm
  // labels can contain Unicode (em dashes, accented letters), so UTF-8
  // encoding is required.
  if (typeof Buffer !== "undefined") {
    return Buffer.from(s, "utf8").toString("base64");
  }
  // Browser path: encode to UTF-8 bytes, repack as Latin-1 for `btoa`.
  const bytes = new TextEncoder().encode(s);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

/**
 * Build the metadata data URI for a boss-clear receipt. Shape mirrors
 * the clearReceipt schema fields registered on-chain
 * (`lib/contracts/schemas.ts`): player, bossId, clearedAt, runSeed,
 * turns, finalHp.
 */
export function buildClearReceiptMetadataURI(args: {
  preset: Preset;
  realmLabel: string;
  player: `0x${string}`;
  bossId: string;
  runSeed: `0x${string}`;
  turns: number;
  finalHp: number;
  clearedAt: number;
}): string {
  const attributes = [
    { trait_type: "Schema", value: `${args.preset}:clearReceipt` },
    { trait_type: "player", value: args.player },
    { trait_type: "boss_id", value: args.bossId },
    { trait_type: "cleared_at", value: args.clearedAt },
    { trait_type: "run_seed", value: args.runSeed },
    { trait_type: "turns", value: args.turns },
    { trait_type: "final_hp", value: args.finalHp },
  ];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#1a1a1a"/><text x="50" y="55" font-size="10" text-anchor="middle" fill="#d4af37">CLEARED</text></svg>`;
  const json = {
    name: `Clear Receipt — ${args.realmLabel}`,
    description: `Boss cleared in ${args.realmLabel} (turns=${args.turns}, finalHp=${args.finalHp}).`,
    image: `data:image/svg+xml;base64,${b64(svg)}`,
    attributes,
    seed_protocol: {
      schema: "clearReceipt",
      preset: args.preset,
      bossId: args.bossId,
      runSeed: args.runSeed,
    },
  };
  return `data:application/json;base64,${b64(JSON.stringify(json))}`;
}
