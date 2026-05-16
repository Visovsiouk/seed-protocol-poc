import { describe, it, expect, vi } from "vitest";

// adapters.ts → seeded-realms.ts → lib/chain.ts validates NEXT_PUBLIC_*
// env at module load. The codec functions are pure, but the import chain
// still pulls chain.ts in, so seed the env before the import runs.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_CHAIN ??= "anvil";
  process.env.NEXT_PUBLIC_RPC_URL ??= "http://127.0.0.1:8545";
});

import { __internal } from "./adapters";
import type { AssetCard } from "@/lib/engine/types";

const { encodeWeaponExt, encodeArmorExt, decodeWeaponExt, decodeArmorExt } =
  __internal;

const ZERO: `0x${string}` = "0x0000000000000000000000000000000000000000";

function baseCard(overrides: Partial<AssetCard>): AssetCard {
  return {
    tokenId: 1n,
    schemaId: 2,
    realm: ZERO,
    realmName: "Test Realm",
    slot: "weapon",
    tier: 3,
    name: "Test Card",
    catalogEffects: [],
    extraFields: {},
    metadataURI: "",
    preseed: false,
    ...overrides,
  };
}

describe("weapon extension codec round-trip", () => {
  it("preserves stats across encode/decode for each die size", () => {
    for (const die of [4, 6, 8, 10, 12] as const) {
      const card = baseCard({
        damageDie: die,
        attackBonus: 2,
        damageBonus: -1,
        element: "fire",
      });
      const encoded = encodeWeaponExt(card);
      const decoded = decodeWeaponExt(encoded);
      expect(decoded.damageDie).toBe(die);
      expect(decoded.attackBonus).toBe(2);
      expect(decoded.damageBonus).toBe(-1);
      expect(decoded.element).toBe("fire");
    }
  });

  it("preserves each Element across encode/decode", () => {
    for (const element of [
      "none",
      "fire",
      "ice",
      "shock",
      "holy",
      "unholy",
    ] as const) {
      const card = baseCard({
        damageDie: 6,
        attackBonus: 0,
        damageBonus: 0,
        element,
      });
      const decoded = decodeWeaponExt(encodeWeaponExt(card));
      expect(decoded.element).toBe(element);
    }
  });

  it("defaults missing weapon fields to zero/none with D6", () => {
    const card = baseCard({});
    const decoded = decodeWeaponExt(encodeWeaponExt(card));
    expect(decoded.damageDie).toBe(6);
    expect(decoded.attackBonus).toBe(0);
    expect(decoded.damageBonus).toBe(0);
    expect(decoded.element).toBe("none");
  });
});

describe("armor extension codec round-trip", () => {
  it("preserves stats across encode/decode", () => {
    const card = baseCard({
      slot: "armor",
      acBonus: 3,
      hpBonus: 7,
      resistElement: "ice",
    });
    const decoded = decodeArmorExt(encodeArmorExt(card));
    expect(decoded.acBonus).toBe(3);
    expect(decoded.hpBonus).toBe(7);
    expect(decoded.resistElement).toBe("ice");
  });

  it("preserves negative int8 bonuses (fantasy delta ac-1)", () => {
    const card = baseCard({
      slot: "armor",
      acBonus: -1,
      hpBonus: 5,
      resistElement: "none",
    });
    const decoded = decodeArmorExt(encodeArmorExt(card));
    expect(decoded.acBonus).toBe(-1);
    expect(decoded.hpBonus).toBe(5);
    expect(decoded.resistElement).toBe("none");
  });

  it("defaults missing armor fields to zero/none", () => {
    const card = baseCard({ slot: "armor" });
    const decoded = decodeArmorExt(encodeArmorExt(card));
    expect(decoded.acBonus).toBe(0);
    expect(decoded.hpBonus).toBe(0);
    expect(decoded.resistElement).toBe("none");
  });
});

describe("buildTranslatedMetadataURI", () => {
  it("emits an inline SVG image so buildAssetCardFromMetadata's strict decoder accepts it", async () => {
    const { buildAssetCardFromMetadata } = await import(
      "@/lib/metadata/asset-card"
    );
    const card = baseCard({
      damageDie: 8,
      attackBonus: 2,
      damageBonus: 2,
      element: "fire",
    });
    const uri = __internal.buildTranslatedMetadataURI({
      original: card,
      translatedSchemaId: 4,
      targetPreset: "scifi",
      weapon: {
        damageDie: 6,
        attackBonus: 3,
        damageBonus: 2,
        element: "fire",
      },
    });
    const rebuilt = buildAssetCardFromMetadata({
      tokenId: 1n,
      tier: 3,
      schemaId: 4,
      metadataURI: uri,
      mintedByRealm: ZERO,
    });
    // Stats must survive the round-trip — regression guard for the
    // missing-image bug where decode threw and the catch swallowed it.
    expect(rebuilt.slot).toBe("weapon");
    expect(rebuilt.damageDie).toBe(6);
    expect(rebuilt.attackBonus).toBe(3);
    expect(rebuilt.damageBonus).toBe(2);
    expect(rebuilt.element).toBe("fire");
  });

  it("emits a data: URI whose payload decodes back to the translated stats", () => {
    const card = baseCard({
      damageDie: 8,
      attackBonus: 1,
      damageBonus: 2,
      element: "fire",
      catalogEffects: [{ name: "lifesteal", value: 5 }],
    });
    const uri = __internal.buildTranslatedMetadataURI({
      original: card,
      translatedSchemaId: 4,
      targetPreset: "scifi",
      weapon: {
        damageDie: 6,
        attackBonus: 2,
        damageBonus: 2,
        element: "fire",
      },
    });
    expect(uri.startsWith("data:application/json;base64,")).toBe(true);
    const b64 = uri.slice("data:application/json;base64,".length);
    const json = JSON.parse(
      typeof Buffer !== "undefined"
        ? Buffer.from(b64, "base64").toString("utf8")
        : atob(b64),
    );
    expect(json.seed_protocol.schemaId).toBe(4);
    expect(json.seed_protocol.translated_target_preset).toBe("scifi");
    expect(json.seed_protocol.minted_by_realm_label).toBe("Test Realm");
    const traits: Record<string, string | number> = {};
    for (const a of json.attributes) traits[a.trait_type] = a.value;
    expect(traits.damage_die).toBe(6);
    expect(traits.attack_bonus).toBe(2);
    expect(traits.element).toBe("fire");
    expect(traits.lifesteal).toBe(5);
  });
});
