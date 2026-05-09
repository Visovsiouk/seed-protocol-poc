import { describe, it, expect } from "vitest";
import { decodeMetadataURI } from "./decode";

function b64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
const JSON_PAYLOAD = {
  name: "Hag's Tooth",
  description: "A weapon minted in Greenwood Vale.",
  image: `data:image/svg+xml;base64,${b64(SVG)}`,
  attributes: [
    { trait_type: "Tier", value: "T2" },
    { trait_type: "Schema", value: "FantasyWeapon" },
    { trait_type: "damage_die", value: 6 },
  ],
  seed_protocol: {
    schemaId: 1,
    tier: 2,
    minted_by_realm_label: "Greenwood Vale",
  },
};

describe("decodeMetadataURI", () => {
  it("decodes a well-formed renderer URI", () => {
    const uri = `data:application/json;base64,${b64(JSON.stringify(JSON_PAYLOAD))}`;
    const { json, svg } = decodeMetadataURI(uri);
    expect(json.name).toBe("Hag's Tooth");
    expect(json.attributes).toHaveLength(3);
    expect(json.seed_protocol.tier).toBe(2);
    expect(svg).toBe(SVG);
  });

  it("rejects a non-JSON data URI", () => {
    expect(() => decodeMetadataURI("data:text/plain,oops")).toThrow();
  });

  it("rejects when image is not an inline SVG", () => {
    const bad = { ...JSON_PAYLOAD, image: "https://cdn.example/x.png" };
    const uri = `data:application/json;base64,${b64(JSON.stringify(bad))}`;
    expect(() => decodeMetadataURI(uri)).toThrow(/inline SVG/);
  });
});
