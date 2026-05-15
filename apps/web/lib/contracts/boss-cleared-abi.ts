/**
 * Placeholder ABI fragment for the `BossCleared(player, finalHp, turns)`
 * event that each `EcosystemTemplate` realm will emit once
 * Solidity lands. The generated ABI in `packages/abis/generated/index.ts`
 * doesn't yet include this event; defining the fragment here lets viem
 * decode the logs as soon as the deployed contracts start emitting them,
 * with zero code changes on the web side.
 *
 * IMPORTANT: when the canonical event ships, this fragment must match
 * the deployed signature byte-for-byte (param order, indexed flags) or
 * `getContractEvents` will silently return nothing. Update both this
 * file and `lib/tutorial/progress.ts`'s `BossClearEvent` if the shape
 * changes.
 */
export const bossClearedEventAbi = [
  {
    type: "event",
    anonymous: false,
    name: "BossCleared",
    inputs: [
      { name: "player", internalType: "address", type: "address", indexed: true },
      { name: "finalHp", internalType: "uint16", type: "uint16", indexed: false },
      { name: "turns", internalType: "uint16", type: "uint16", indexed: false },
    ],
  },
] as const;
