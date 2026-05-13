/**
 * Engine type surface — these are the
 * shared shapes every other `lib/engine/*` module operates on.
 *
 * Determinism note: every engine function that consumes randomness takes
 * an `Rng` (see `rng.ts`). No `Math.random()` anywhere in `lib/engine/*`.
 */

export type Preset = "fantasy" | "scifi" | "cyberpunk";

export type Tier = 1 | 2 | 3 | 4 | 5;

export type Slot = "weapon" | "armor" | "accessory";

export type DamageDie = 4 | 6 | 8 | 10 | 12;

export type CatalogEffectName =
  // weapon-slot effects
  | "lifesteal"
  | "armor_pierce"
  | "crit_chance"
  | "multi_hit"
  | "bleed"
  // armor-slot effects
  | "regen"
  | "thorns"
  | "dodge_chance"
  | "damage_reduction";

export type CatalogEffect = {
  name: CatalogEffectName;
  /** Rolled per drop, scaled by tier. Range and cap live in catalog.ts. */
  value: number;
};

export type AssetCard = {
  tokenId: bigint;
  schemaId: number;
  /** Realm address that minted the asset (`mintedBy`). */
  realm: `0x${string}`;
  /** Resolved off-chain (Bazaar reads / RealmRegistry). */
  realmName: string;
  slot: Slot;
  tier: Tier;
  /** Assembled from the realm's flavor bank at mint time. */
  name: string;
  damageDie?: DamageDie;
  attackBonus?: number;
  acBonus?: number;
  hpBonus?: number;
  /** Catalog effects, read by the engine regardless of source realm. */
  catalogEffects: CatalogEffect[];
  /** Non-canonical fields — displayed on the asset card, ignored by combat. */
  extraFields: Record<string, string | number | boolean>;
  metadataURI: string;
  /** True if minted by a dev-deployed starter realm (pre-seed liquidity). */
  preseed: boolean;
};

export type MonsterDef = {
  id: string;
  name: string;
  hp: number;
  attackDie: DamageDie;
  ac: number;
  /** 3–4 parameterized strings; engine picks one per attack via the RNG. */
  attackVerbs: readonly string[];
};

export type BossDef = {
  id: string;
  preset: Preset;
  name: string;
  baseHp: number;
  attackDie: DamageDie;
  ac: number;
  /** — exactly two baked-in catalog effects per boss. */
  bakedEffects: [CatalogEffectName, CatalogEffectName];
  /** Flavor bank key for the phase-2 transition narration. */
  phase2NarrationKey: string;
  /** Phase 2 attack die bump (one tier higher). */
  phase2AttackDie: DamageDie;
  /** Optional thematic suppression activated at phase 2. */
  phase2SuppressEffect?: CatalogEffectName;
};

export type EncounterArchetype = "combat" | "hazard" | "discovery";

export type RoomTemplate = {
  id: string;
  /** 1..N — used by encounter.ts to weight monster pulls. */
  depth: number;
  archetype: EncounterArchetype;
  narrationKey: string;
  /** Monster ids; pool weighting handled in encounter.ts. */
  monsterPool?: string[];
};

export type CombatState = {
  playerHp: number;
  playerMaxHp: number;
  playerAc: number;
  monster: MonsterDef | BossDef;
  monsterHp: number;
  bossPhase?: 1 | 2;
  /** True iff the player chose Brace this turn — consumed by the next incoming hit. */
  bracedThisTurn: boolean;
  /** Turns of bleed DoT remaining on the monster (per-attacker is overkill for PoC). */
  bleedStacks: number;
  /** Suppressed catalog effects on the player, set at boss phase 2 if applicable. */
  suppressedEffects: CatalogEffectName[];
  turn: number;
};

export type EncounterState =
  | {
      kind: "combat";
      archetype: "combat";
      combat: CombatState;
      /** Whether this combat round offers the tactical triplet or flavor verbs. */
      choice: "tactical" | "flavor";
    }
  | { kind: "hazard"; archetype: "hazard"; pendingResolve: boolean }
  | {
      kind: "discovery";
      archetype: "discovery";
      /** Two flavor-bank keys for the player to pick between. */
      options: [string, string];
    };

export type LootRoll = {
  tier: Tier;
  slot: Slot;
  /** Signature schema id when the realm has one for `slot`; else canonical fallback. */
  schemaId: number;
  damageDie?: DamageDie;
  attackBonus?: number;
  acBonus?: number;
  hpBonus?: number;
  catalogEffects: CatalogEffect[];
  /** Seed for adjective+noun assembly so the name is deterministic. */
  nameSeed: bigint;
  extraFields: Record<string, string | number | boolean>;
};

export type RunState = {
  preset: Preset;
  realm: `0x${string}`;
  /** Committed at run start: keccak256(playerAddr ‖ blockhash ‖ encounterId). */
  rngSeed: `0x${string}`;
  /** Current room number, 1-indexed. */
  depth: number;
  encounter: EncounterState | null;
  equipped: { weapon?: AssetCard; armor?: AssetCard; accessory?: AssetCard };
  pendingLoot?: LootRoll;
  bossCleared: boolean;
  bossClearedTimestamp?: number;
  bossClearedTurns?: number;
};

export type ActionChoice =
  | { kind: "tactical"; option: "strike" | "brace" | "flank" }
  | { kind: "flavor"; verb: string; index: 0 | 1 }
  | { kind: "discovery"; index: 0 | 1 };

export type NarrationLine = {
  text: string;
  emphasis?: "info" | "damage" | "heal" | "drama";
};

export type EngineEvent =
  | { type: "RoomCleared"; depth: number }
  | { type: "BossCleared"; finalHp: number; turns: number }
  | { type: "LootDropped"; loot: LootRoll };

export type StepResult = {
  state: RunState;
  /** 1..N narration lines to render after the step. */
  outcome: NarrationLine[];
  events: EngineEvent[];
};
