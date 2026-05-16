/**
 * Pure (no React, no wagmi, no `server-only`) helpers shared by the
 * client-side `useMintLoot` hook and the server-side `/api/realm/mint-loot`
 * route. Both sides must derive the same `tokenId` + metadata or the
 * inventory hydration on the client won't reconcile against the on-chain
 * asset the server actually minted.
 */

import { encodePacked, keccak256 } from "viem";
import type { LootRoll, Preset } from "@/lib/engine/types";

const TIER_LABEL: Record<number, string> = {
  1: "T1",
  2: "T2",
  3: "T3",
  4: "T4",
  5: "T5",
};

/**
 * Derive the on-chain tokenId. Deterministic from the run seed + drop
 * coordinates so:
 *   - Replays on the same seed mint the same token (idempotent).
 *   - Different drops in the same run get distinct ids (nameSeed varies
 *     per drop because the engine derives it from the per-step sub-rng).
 *   - The id is uniformly distributed across uint256, dodging the
 *     "incrementing id" pattern that would collide across realms.
 */
export function deriveLootTokenId(args: {
  realm: `0x${string}`;
  runSeed: `0x${string}`;
  depth: number;
  nameSeed: bigint;
}): bigint {
  const packed = encodePacked(
    ["address", "bytes32", "uint16", "uint256"],
    [args.realm, args.runSeed, args.depth, args.nameSeed],
  );
  return BigInt(keccak256(packed));
}

function b64(s: string): string {
  // Prefer Node's Buffer when available (server) — `btoa` exists in Node
  // 16+ but throws InvalidCharacterError on any non-Latin-1 byte. Realm
  // labels and assembled loot names can contain Unicode (em dashes,
  // accented letters), so UTF-8 encoding is required.
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
 * Build the renderer-compatible metadata data URI for a loot drop. The
 * shape matches what `lib/metadata/decode.ts` parses, and what
 * `lib/reads/inventory-cards.ts` hydrates back into an `AssetCard`.
 */
export function buildLootMetadataURI(args: {
  loot: LootRoll;
  preset: Preset;
  realmLabel: string;
  assembledName: string;
}): string {
  const { loot, preset, realmLabel, assembledName } = args;
  const attributes: { trait_type: string; value: string | number }[] = [
    { trait_type: "Tier", value: TIER_LABEL[loot.tier] ?? `T${loot.tier}` },
    { trait_type: "Schema", value: `${preset}:${loot.schemaId}` },
    { trait_type: "slot", value: loot.slot },
  ];
  if (loot.damageDie !== undefined) {
    attributes.push({ trait_type: "damage_die", value: loot.damageDie });
  }
  if (loot.attackBonus !== undefined) {
    attributes.push({ trait_type: "attack_bonus", value: loot.attackBonus });
  }
  if (loot.damageBonus !== undefined) {
    attributes.push({ trait_type: "damage_bonus", value: loot.damageBonus });
  }
  if (loot.acBonus !== undefined) {
    attributes.push({ trait_type: "ac_bonus", value: loot.acBonus });
  }
  if (loot.hpBonus !== undefined) {
    attributes.push({ trait_type: "hp_bonus", value: loot.hpBonus });
  }
  // Element fields are preset-neutral on the canonical engine side. Adapters
  // map preset-specific schema names (`weapon_type`,
  // `damage_type`, `school_resist`, `energy_resist`, `tech_resist`) onto
  // these two traits so the engine never branches on preset.
  if (loot.element !== undefined && loot.element !== "none") {
    attributes.push({ trait_type: "element", value: loot.element });
  }
  if (loot.resistElement !== undefined && loot.resistElement !== "none") {
    attributes.push({ trait_type: "resist_element", value: loot.resistElement });
  }
  for (const eff of loot.catalogEffects) {
    attributes.push({ trait_type: eff.name, value: eff.value });
  }
  for (const [k, v] of Object.entries(loot.extraFields)) {
    attributes.push({ trait_type: k, value: v as string | number });
  }

  // Placeholder inline SVG — production renderer overrides via `tokenURI()`.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#222"/></svg>`;
  const json = {
    name: assembledName,
    description: `Minted in ${realmLabel}.`,
    image: `data:image/svg+xml;base64,${b64(svg)}`,
    attributes,
    seed_protocol: {
      schemaId: loot.schemaId,
      tier: loot.tier,
      minted_by_realm_label: realmLabel,
    },
  };
  return `data:application/json;base64,${b64(JSON.stringify(json))}`;
}
