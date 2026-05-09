/**
 * Decoder for the on-chain MetadataRenderer output.
 *
 * Renderer returns `data:application/json;base64,<b64>` where the JSON has shape:
 *   {
 *     name, description,
 *     image: "data:image/svg+xml;base64,<b64>",
 *     attributes: [{ trait_type, value }, ...],
 *     seed_protocol: { schemaId, tier, minted_by_realm_label }
 *   }
 *
 * This module is the off-chain mirror of the renderer: it parses the URI,
 * surfaces the JSON and the inline SVG separately, and validates shape.
 */

export type AssetAttribute = {
  trait_type: string;
  value: string | number;
};

export type SeedProtocolMetadataExt = {
  schemaId: number;
  tier: number;
  minted_by_realm_label: string;
};

export type AssetMetadata = {
  name: string;
  description: string;
  image: string;
  attributes: AssetAttribute[];
  seed_protocol: SeedProtocolMetadataExt;
};

export type DecodedMetadata = {
  json: AssetMetadata;
  svg: string;
};

const JSON_PREFIX = "data:application/json;base64,";
const SVG_PREFIX = "data:image/svg+xml;base64,";

function decodeBase64(input: string): string {
  if (typeof atob !== "undefined") return atob(input);
  // Node fallback (server components, route handlers).
  return Buffer.from(input, "base64").toString("utf8");
}

export function decodeMetadataURI(uri: string): DecodedMetadata {
  if (!uri.startsWith(JSON_PREFIX)) {
    throw new Error(`Expected ${JSON_PREFIX} prefix, got: ${uri.slice(0, 40)}…`);
  }
  const payload = uri.slice(JSON_PREFIX.length);
  const jsonText = decodeBase64(payload);

  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch (e) {
    throw new Error(`metadata JSON parse failed: ${(e as Error).message}`);
  }
  const json = raw as AssetMetadata;

  if (!json.image || !json.image.startsWith(SVG_PREFIX)) {
    throw new Error("metadata.image is not an inline SVG data URI");
  }
  const svg = decodeBase64(json.image.slice(SVG_PREFIX.length));

  return { json, svg };
}
