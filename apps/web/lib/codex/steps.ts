/**
 * Protocol Codex — the journey checklist that walks a player through every
 * Seed Protocol feature the PoC demonstrates. Each step names the white-paper
 * concept it proves, states what the player does, and (once complete) what
 * just happened on-chain in one line.
 *
 * Step status is derived, never stored: on-chain reads where the chain can
 * witness the action (see `lib/codex/status.ts`), a localStorage flag for the
 * one purely client-side moment (carrying gear across a preset boundary — the
 * chain has no "equipped" concept to witness).
 */

export type CodexStepId =
  | "first-loot"
  | "first-clear"
  | "cross-realm"
  | "three-clears"
  | "seed"
  | "realm"
  | "list"
  | "purchase"
  | "royalty"
  | "tier";

export type CodexStep = {
  id: CodexStepId;
  /** Short in-world title. */
  title: string;
  /** What the player does. */
  action: string;
  /** White-paper reference this step demonstrates. */
  wpRef: string;
  /** Protocol concept, shown once the step completes: "what just happened". */
  proves: string;
  /**
   * Where the CTA sends the player. Station ids match the hub's rail;
   * paths are app routes.
   */
  cta: { label: string; target: "doors" | "market" | "altar" | "forge" | "codex" | `/${string}` };
  /**
   * Frontier steps need other players (or long-run growth) and may stay
   * open in a solo session — rendered as an horizon, not a blocker.
   */
  frontier?: boolean;
};

export const CODEX_STEPS: readonly CodexStep[] = [
  {
    id: "first-loot",
    title: "Claim your first relic",
    action: "Survive a descent and extract — your loot becomes a real asset.",
    wpRef: "§2.3 · §5.2",
    proves:
      "Your relic was minted into the universal asset contract under this realm's provenance, paid for from the realm's emission budget.",
    cta: { label: "Enter a realm", target: "doors" },
  },
  {
    id: "first-clear",
    title: "Fell a founding boss",
    action: "Clear any founding realm's boss.",
    wpRef: "§8.3.2",
    proves:
      "The realm minted you a clear receipt — an on-chain, timestamped contribution record that no one can forge on your behalf.",
    cta: { label: "Enter a realm", target: "doors" },
  },
  {
    id: "cross-realm",
    title: "Carry gear across worlds",
    action: "Descend into a different genre carrying gear minted elsewhere.",
    wpRef: "§2.6",
    proves:
      "An adapter contract translated your gear's attributes into the local vocabulary — no permission needed from either realm.",
    cta: { label: "Pick a foreign realm", target: "doors" },
  },
  {
    id: "three-clears",
    title: "Prove your contribution",
    action: "Clear all three founding realms.",
    wpRef: "§2.1 · §8.3",
    proves:
      "Your clear receipts form a multi-metric, time-spanning contribution proof — the structured evidence the Seed contract validates.",
    cta: { label: "Check the shard track", target: "doors" },
  },
  {
    id: "seed",
    title: "Claim the Seed",
    action: "Present your proof at the Genesis altar.",
    wpRef: "§2.1",
    proves:
      "You hold a soulbound ERC-721: non-transferable, one per address, the earned right to found an ecosystem.",
    cta: { label: "Approach the altar", target: "altar" },
  },
  {
    id: "realm",
    title: "Found your realm",
    action: "Spend your Seed at the Forge — four transactions, signed by you.",
    wpRef: "§3.4 · §2.5",
    proves:
      "The factory validated your Seed, cloned a new ecosystem, registered two asset schemas, and authorized it as a minter. One Seed, one realm — forever.",
    cta: { label: "Light the Forge", target: "forge" },
  },
  {
    id: "list",
    title: "Offer a relic at the bazaar",
    action: "Escrow one of your relics on the Protocol Exchange at a price you set.",
    wpRef: "§8.4",
    proves:
      "Your asset sits in exchange escrow; any sale MUST route royalties — there is no code path around the fee.",
    cta: { label: "Visit the market", target: "market" },
  },
  {
    id: "purchase",
    title: "Witness the split",
    action: "Buy any listed relic (or hail the Wandering Trader to buy yours).",
    wpRef: "§2.4 · T6",
    proves:
      "One atomic settlement paid 95% to the seller, 4.5% to the creator of the realm that minted the asset, 0.5% to the treasury.",
    cta: { label: "Visit the market", target: "market" },
  },
  {
    id: "royalty",
    title: "Earn your first royalty",
    action: "A relic minted by YOUR realm sells on the exchange.",
    wpRef: "§5.1",
    proves:
      "Provenance never changes hands: every future resale of your realm's relics pays you 4.5%, enforced by the settlement contract.",
    cta: { label: "Visit the market", target: "market" },
  },
  {
    id: "tier",
    title: "Raise your realm's ceiling",
    action: "20 distinct wallets clear your realm — its loot ceiling rises to T4.",
    wpRef: "§9.2",
    proves:
      "Progressive capability: realms earn emission power through demonstrated engagement, not payment.",
    cta: { label: "Grow your realm", target: "doors" },
    frontier: true,
  },
] as const;
