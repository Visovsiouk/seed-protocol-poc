import { describe, expect, it } from "vitest";
import type { AssetCard } from "@/lib/engine/types";
import { cardDisplayName } from "./card-name";
import { armorName, evocativeName, weaponName } from "./names";

const ZERO = "0x0000000000000000000000000000000000000000" as const;
const TOK = 12345678901234567890n;

function card(overrides: Partial<AssetCard>): AssetCard {
  return {
    tokenId: TOK,
    schemaId: 2,
    realm: ZERO,
    realmName: "Test Realm",
    realmPreset: "fantasy",
    slot: "weapon",
    tier: 4,
    name: "Test Card",
    catalogEffects: [],
    extraFields: {},
    metadataURI: "",
    preseed: false,
    ...overrides,
  };
}

describe("cardDisplayName", () => {
  it("composes evocative word + TYPE label for normal elemental loot", () => {
    const c = card({
      slot: "weapon",
      weaponType: "axe",
      element: "fire",
      tier: 4,
      // a derived word (not an override) so the headline re-derives
      name: evocativeName("fantasy", TOK, 4, "fire"),
    });
    const word = evocativeName("fantasy", TOK, 4, "fire");
    expect(cardDisplayName(c, "fantasy")).toBe(`${word} ${weaponName("fantasy", "axe", 4)}`);
    expect(cardDisplayName(c, "fantasy").endsWith(" Greataxe")).toBe(true);
  });

  it("translates BOTH halves when shown in another realm's vocabulary", () => {
    const source = card({
      slot: "weapon",
      weaponType: "axe",
      element: "fire",
      tier: 4,
      name: evocativeName("fantasy", TOK, 4, "fire"),
    });
    // The translated card the adapter would produce in a sci-fi realm.
    const display = card({
      ...source,
      element: "plasma",
      weaponType: "cannon",
    });
    const expected = `${evocativeName("scifi", TOK, 4, "plasma")} ${weaponName("scifi", "cannon", 4)}`;
    expect(cardDisplayName(source, "fantasy", display, "scifi")).toBe(expected);
    expect(cardDisplayName(source, "fantasy", display, "scifi").endsWith(" Heavy Driver")).toBe(
      true,
    );
    // ...and it differs from the home-realm headline (the word followed the element).
    expect(cardDisplayName(source, "fantasy", display, "scifi")).not.toBe(
      cardDisplayName(source, "fantasy"),
    );
  });

  it("passes a story-object nameOverride through verbatim", () => {
    const c = card({
      slot: "weapon",
      weaponType: "none",
      element: "none",
      tier: 4,
      name: "The Pilgrim's Brand",
    });
    expect(cardDisplayName(c, "fantasy")).toBe("The Pilgrim's Brand");
    // Even when viewed in another realm, an override never re-derives.
    expect(cardDisplayName(c, "fantasy", c, "cyberpunk")).toBe("The Pilgrim's Brand");
  });

  it("uses the shared mundane word for element-none loot, same in every genre", () => {
    const c = card({
      slot: "armor",
      armorType: "plate",
      resistElement: "none",
      tier: 3,
      name: evocativeName("fantasy", TOK, 3, "none"),
    });
    const word = evocativeName("fantasy", TOK, 3, "none");
    expect(cardDisplayName(c, "fantasy")).toBe(`${word} ${armorName("fantasy", "plate", 3)}`);
    // none-element word is preset-agnostic, so only the TYPE label changes on a hop.
    const display = card({ ...c, armorType: "carapace" });
    expect(cardDisplayName(c, "fantasy", display, "scifi")).toBe(
      `${word} ${armorName("scifi", "carapace", 3)}`,
    );
  });
});
