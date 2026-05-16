/**
 * Inline ABI for the PoC adapter contracts (PresetWeaponAdapter,
 * PresetArmorAdapter). The two share the IAdapter surface, so a single
 * ABI fragment serves for both — only `translate` and `schemaMapping`
 * are surfaced here because that's all the off-chain reads need.
 *
 * The contracts live under `contracts/src/` in this repo (Foundry
 * project at the root). Their generated artifacts aren't pulled into
 * `@abis/generated` because wagmi codegen targets the sister-repo's
 * `seed-protocol/out/`. Re-pointing wagmi at our own forge output is
 * possible but adds a build dep on `forge build`; the inline fragment
 * is small enough to avoid that.
 */

export const adapterAbi = [
  {
    type: "function",
    name: "translate",
    stateMutability: "view",
    inputs: [
      { name: "tokenId", type: "uint256" },
      {
        name: "sourceAttrs",
        type: "tuple",
        components: [
          { name: "tier", type: "uint8" },
          { name: "extensionSchemaId", type: "uint256" },
          { name: "metadataURI", type: "string" },
        ],
      },
      { name: "extensionData", type: "bytes" },
    ],
    outputs: [
      {
        name: "translatedAttrs",
        type: "tuple",
        components: [
          { name: "tier", type: "uint8" },
          { name: "extensionSchemaId", type: "uint256" },
          { name: "metadataURI", type: "string" },
        ],
      },
      { name: "translatedExtensionData", type: "bytes" },
    ],
  },
  {
    type: "function",
    name: "schemaMapping",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sourceSchemaId", type: "uint256" },
      { name: "targetSchemaId", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "elementLabel",
    stateMutability: "pure",
    inputs: [
      { name: "preset", type: "uint8" },
      { name: "element", type: "uint8" },
    ],
    outputs: [{ name: "label", type: "string" }],
  },
] as const;
