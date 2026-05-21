/**
 * Inline ABI for the 12 PoC adapter contracts (one per ordered preset
 * pair × slot). All twelve share the same surface — `translate` +
 * `schemaMapping` from `IAdapter`, plus the two label views unique to
 * the schema-per-preset architecture:
 *
 *   - `sourceElementLabel(uint8)` → name in the source schema's
 *     element vocabulary (e.g. for the FantasyToCyberpunk weapon
 *     adapter: index 1 → "fire").
 *
 *   - `targetElementLabel(uint8)` → name in the target schema's
 *     element vocabulary (same adapter: index 1 → "incendiary").
 *
 * The label views are pure and identical across every adapter that
 * names the same preset — i.e. any adapter where Cyberpunk is the
 * source/target answers the same question for the Cyberpunk
 * vocabulary. Off-chain consumers pick whichever adapter is most
 * convenient (see `findLabelAdapter` in `adapters.ts`).
 *
 * Adapter sources live at:
 *   contracts/src/adapters/weapon/<Source>To<Target>WeaponAdapter.sol
 *   contracts/src/adapters/armor/<Source>To<Target>ArmorAdapter.sol
 *
 * Their generated artifacts aren't pulled into `@abis/generated`
 * because wagmi codegen targets the sister-repo's `seed-protocol/out/`.
 * The inline fragment below is small enough to avoid the build dep.
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
    name: "sourceElementLabel",
    stateMutability: "pure",
    inputs: [{ name: "element", type: "uint8" }],
    outputs: [{ name: "label", type: "string" }],
  },
  {
    type: "function",
    name: "targetElementLabel",
    stateMutability: "pure",
    inputs: [{ name: "element", type: "uint8" }],
    outputs: [{ name: "label", type: "string" }],
  },
] as const;
