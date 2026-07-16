import { describe, it, expect } from "vitest";
import {
  buildAssetCardFromMetadata,
  isClearReceiptMetadata,
} from "./asset-card";
import { buildClearReceiptMetadataURI } from "@/lib/contracts/clear-receipt-derive";
import { b64 } from "@/lib/utils";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';

function jsonUri(payload: Record<string, unknown>): string {
  return `data:application/json;base64,${b64(JSON.stringify(payload))}`;
}

function basePayload(extra: { attributes: { trait_type: string; value: string | number }[]; name?: string }) {
  return {
    name: extra.name ?? "Hag's Tooth",
    description: "...",
    image: `data:image/svg+xml;base64,${b64(SVG)}`,
    attributes: extra.attributes,
    seed_protocol: {
      schemaId: 1,
      tier: 2,
      minted_by_realm_label: "Greenwood Vale",
    },
  };
}

describe("buildAssetCardFromMetadata", () => {
  it("decodes weapon stats and catalog effects from the renderer URI", () => {
    const uri = jsonUri(
      basePayload({
        attributes: [
          { trait_type: "damage_die", value: 8 },
          { trait_type: "attack_bonus", value: 2 },
          { trait_type: "lifesteal", value: 15 },
          { trait_type: "Faction", value: "Crypt" },
        ],
      }),
    );

    const card = buildAssetCardFromMetadata({
      tokenId: 1n,
      tier: 2,
      schemaId: 101,
      metadataURI: uri,
      mintedByRealm: "0x0000000000000000000000000000000000000a01",
    });

    expect(card.name).toBe("Hag's Tooth");
    expect(card.realmName).toBe("Greenwood Vale");
    expect(card.slot).toBe("weapon");
    expect(card.damageDie).toBe(8);
    expect(card.attackBonus).toBe(2);
    expect(card.catalogEffects).toEqual([{ name: "lifesteal", value: 15 }]);
    expect(card.extraFields).toEqual({ Faction: "Crypt" });
  });

  it("infers armor slot from ac_bonus/hp_bonus presence", () => {
    const uri = jsonUri(
      basePayload({
        name: "Iron Plate",
        attributes: [
          { trait_type: "ac_bonus", value: 1 },
          { trait_type: "hp_bonus", value: 5 },
          { trait_type: "regen", value: 2 },
        ],
      }),
    );

    const card = buildAssetCardFromMetadata({
      tokenId: 2n,
      tier: 3,
      schemaId: 102,
      metadataURI: uri,
      mintedByRealm: "0x0000000000000000000000000000000000000a01",
    });

    expect(card.slot).toBe("armor");
    expect(card.acBonus).toBe(1);
    expect(card.hpBonus).toBe(5);
    expect(card.catalogEffects).toEqual([{ name: "regen", value: 2 }]);
    expect(card.damageDie).toBeUndefined();
  });

  it("falls back to schemaId parity when no slot signal is present", () => {
    const uri = jsonUri(basePayload({ attributes: [] }));

    const weapon = buildAssetCardFromMetadata({
      tokenId: 3n,
      tier: 1,
      schemaId: 301,
      metadataURI: uri,
      mintedByRealm: "0x0000000000000000000000000000000000000a03",
    });
    expect(weapon.slot).toBe("weapon");

    const armor = buildAssetCardFromMetadata({
      tokenId: 4n,
      tier: 1,
      schemaId: 302,
      metadataURI: uri,
      mintedByRealm: "0x0000000000000000000000000000000000000a03",
    });
    expect(armor.slot).toBe("armor");
  });

  it("tolerates a malformed metadata URI", () => {
    const card = buildAssetCardFromMetadata({
      tokenId: 5n,
      tier: 1,
      schemaId: 101,
      metadataURI: "https://cdn.example/x.png",
      mintedByRealm: "0x0000000000000000000000000000000000000a01",
    });
    expect(card.name).toBe("Asset #5");
    expect(card.slot).toBe("weapon"); // parity fallback
    expect(card.catalogEffects).toEqual([]);
  });

  it("round-trips weapon element from metadata", () => {
    const uri = jsonUri(
      basePayload({
        attributes: [
          { trait_type: "damage_die", value: 8 },
          { trait_type: "attack_bonus", value: 2 },
          { trait_type: "damage_bonus", value: 2 },
          { trait_type: "element", value: "fire" },
        ],
      }),
    );
    const card = buildAssetCardFromMetadata({
      tokenId: 7n,
      tier: 3,
      schemaId: 101,
      metadataURI: uri,
      mintedByRealm: "0x0000000000000000000000000000000000000a01",
    });
    expect(card.slot).toBe("weapon");
    expect(card.element).toBe("fire");
    expect(card.resistElement).toBeUndefined();
    expect(card.damageBonus).toBe(2);
    expect(card.extraFields).toEqual({});
  });

  it("round-trips armor resist_element from metadata", () => {
    const uri = jsonUri(
      basePayload({
        attributes: [
          { trait_type: "ac_bonus", value: 2 },
          { trait_type: "hp_bonus", value: 10 },
          { trait_type: "resist_element", value: "ice" },
        ],
      }),
    );
    const card = buildAssetCardFromMetadata({
      tokenId: 8n,
      tier: 2,
      schemaId: 102,
      metadataURI: uri,
      mintedByRealm: "0x0000000000000000000000000000000000000a01",
    });
    expect(card.slot).toBe("armor");
    expect(card.resistElement).toBe("ice");
    expect(card.element).toBeUndefined();
    expect(card.extraFields).toEqual({});
  });

  it("ignores an unknown element value (defensive against legacy metadata)", () => {
    const uri = jsonUri(
      basePayload({
        attributes: [
          { trait_type: "damage_die", value: 8 },
          { trait_type: "element", value: "lava" },
        ],
      }),
    );
    const card = buildAssetCardFromMetadata({
      tokenId: 9n,
      tier: 3,
      schemaId: 101,
      metadataURI: uri,
      mintedByRealm: "0x0000000000000000000000000000000000000a01",
    });
    expect(card.element).toBeUndefined();
  });

  it("never surfaces resistElement on a weapon card or element on an armor card", () => {
    // Even if a malformed URI lists both, the slot-aware return ensures the
    // engine sees clean shapes.
    const weaponUri = jsonUri(
      basePayload({
        attributes: [
          { trait_type: "damage_die", value: 8 },
          { trait_type: "resist_element", value: "fire" }, // wrong slot
        ],
      }),
    );
    const wc = buildAssetCardFromMetadata({
      tokenId: 10n,
      tier: 3,
      schemaId: 101,
      metadataURI: weaponUri,
      mintedByRealm: "0x0000000000000000000000000000000000000a01",
    });
    expect(wc.slot).toBe("weapon");
    expect(wc.resistElement).toBeUndefined();
  });

  it("ignores invalid damage_die values", () => {
    const uri = jsonUri(
      basePayload({
        attributes: [{ trait_type: "damage_die", value: 7 }],
      }),
    );
    const card = buildAssetCardFromMetadata({
      tokenId: 6n,
      tier: 1,
      schemaId: 101,
      metadataURI: uri,
      mintedByRealm: "0x0000000000000000000000000000000000000a01",
    });
    expect(card.damageDie).toBeUndefined();
  });
});

describe("isClearReceiptMetadata", () => {
  it("detects a clearReceipt URI (any realm)", () => {
    const uri = buildClearReceiptMetadataURI({
      preset: "fantasy",
      realmLabel: "Lichdom",
      player: "0x0000000000000000000000000000000000000b01",
      bossId: "forest_hag",
      runSeed: `0x${"ab".repeat(32)}`,
      turns: 7,
      finalHp: 12,
      clearedAt: 1_700_000_000,
    });
    expect(isClearReceiptMetadata(uri)).toBe(true);
  });

  it("does not flag a normal loot URI", () => {
    const uri = jsonUri(
      basePayload({
        attributes: [
          { trait_type: "Schema", value: "fantasy:5" },
          { trait_type: "damage_die", value: 8 },
        ],
      }),
    );
    expect(isClearReceiptMetadata(uri)).toBe(false);
  });

  it("returns false for a malformed / non-renderer URI", () => {
    expect(isClearReceiptMetadata("https://cdn.example/x.png")).toBe(false);
  });
});
