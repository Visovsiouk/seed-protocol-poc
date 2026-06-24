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

/**
 * Per-preset element vocabularies. Each realm names its own elemental
 * lexicon — Fantasy `fire/ice/shock/holy/unholy`, Sci-Fi
 * `plasma/cryo/ion/photon/void`, Cyberpunk
 * `incendiary/cryogenic/emp/laser/nano`. None of these names is
 * privileged: the corresponding on-chain weapon/armor schemas declare
 * each enum natively, and the 12 ordered-pair adapter contracts
 * re-encode by index when an asset crosses a preset boundary.
 *
 * The engine consumes `Element` as a loose string carrier — combat
 * math uses string equality only — so a translated card from a
 * different preset can flow through `combat.ts` without any decoder
 * indirection. Producers (loot rollers, flavor banks, monster
 * defs) should use the strict per-preset unions so the wrong vocab
 * cannot leak into a realm at construction time.
 */
export type FantasyElement = "none" | "fire" | "ice" | "shock" | "holy" | "unholy";
export type SciFiElement = "none" | "plasma" | "cryo" | "ion" | "photon" | "void";
export type CyberpunkElement = "none" | "incendiary" | "cryogenic" | "emp" | "laser" | "nano";

/**
 * Carrier type for the engine. Intentionally loose — covers any
 * preset's vocabulary. Mid-flight cards translated across realms
 * carry the *target* preset's element name, which would not satisfy a
 * single canonical union but is still mechanically meaningful.
 */
export type Element = string;

export const FANTASY_ELEMENTS: readonly FantasyElement[] = [
  "none",
  "fire",
  "ice",
  "shock",
  "holy",
  "unholy",
] as const;

export const SCIFI_ELEMENTS: readonly SciFiElement[] = [
  "none",
  "plasma",
  "cryo",
  "ion",
  "photon",
  "void",
] as const;

export const CYBERPUNK_ELEMENTS: readonly CyberpunkElement[] = [
  "none",
  "incendiary",
  "cryogenic",
  "emp",
  "laser",
  "nano",
] as const;

/**
 * Per-preset combat-element pools (excludes "none"). Loot rollers
 * use these so a Sci-Fi weapon never rolls "fire" and a Fantasy
 * weapon never rolls "plasma".
 */
export const FANTASY_COMBAT_ELEMENTS: readonly Exclude<FantasyElement, "none">[] = [
  "fire",
  "ice",
  "shock",
  "holy",
  "unholy",
] as const;
export const SCIFI_COMBAT_ELEMENTS: readonly Exclude<SciFiElement, "none">[] = [
  "plasma",
  "cryo",
  "ion",
  "photon",
  "void",
] as const;
export const CYBERPUNK_COMBAT_ELEMENTS: readonly Exclude<CyberpunkElement, "none">[] = [
  "incendiary",
  "cryogenic",
  "emp",
  "laser",
  "nano",
] as const;

/**
 * Return the combat-element pool native to a given preset. Used by
 * the loot roller in `loot.ts` to pick a weapon's element from the
 * correct vocabulary.
 */
export function combatElementsFor(preset: Preset): readonly string[] {
  if (preset === "fantasy") return FANTASY_COMBAT_ELEMENTS;
  if (preset === "scifi") return SCIFI_COMBAT_ELEMENTS;
  return CYBERPUNK_COMBAT_ELEMENTS;
}

/**
 * Return the full element pool (with "none") native to a given preset.
 * Used by validators to check that an off-chain card's element string
 * is one of the vocabulary entries for its source preset.
 */
export function elementsFor(preset: Preset): readonly string[] {
  if (preset === "fantasy") return FANTASY_ELEMENTS;
  if (preset === "scifi") return SCIFI_ELEMENTS;
  return CYBERPUNK_ELEMENTS;
}

/**
 * 1:1 PoC element-index mapping. The engine's combat math is purely
 * string-equality based, but on-chain encoders need to convert a
 * native string into a numeric enum value. Index parity across the
 * three preset enums lets us re-encode by ordinal — see the 12
 * adapter contracts under `contracts/src/adapters/`.
 */
export function elementIndex(preset: Preset, element: string): number {
  const pool = elementsFor(preset);
  const i = pool.indexOf(element);
  return i < 0 ? 0 : i;
}

/**
 * Inverse of `elementIndex`. Given a numeric enum value and the preset
 * the schema belongs to, return the native vocabulary string.
 */
export function elementFromIndex(preset: Preset, index: number): string {
  const pool = elementsFor(preset);
  return pool[index] ?? "none";
}

// ---------------------------------------------------------------------------
// Per-preset weapon/armor archetype vocabularies.
//
// Mirrors the on-chain `WeaponType` / `ArmorType` enums in each schema
// library. Index 0 is always "none" so loot can roll an un-archetyped
// item without bottoming out the cast. The remaining indexes line up
// across presets as archetype "lanes":
//
//   Weapons:  1=heavy   2=light   3=mid     4=ranged  5=exotic
//   Armor:    1=heavy   2=medium  3=light
//
// Lane parity means the uint8 cast from `FantasyWeaponSchema.WeaponType`
// to `CyberpunkWeaponSchema.WeaponType` (etc.) lands on a semantically
// sensible target — Axe↔Shotgun (both heavy), Dagger↔Knife (both light),
// and so on. Per-(adapter, sourceType) stat deltas in the on-chain
// adapters supply the archetype flavor on top of the base rebalance.
// ---------------------------------------------------------------------------

export type FantasyWeaponType = "none" | "axe" | "dagger" | "sword" | "bow" | "staff";
export type SciFiWeaponType = "none" | "cannon" | "pistol" | "rifle" | "beam" | "railgun";
export type CyberpunkWeaponType =
  | "none"
  | "shotgun"
  | "knife"
  | "katana"
  | "smartsmg"
  | "monowire";

export type FantasyArmorType = "none" | "plate" | "mail" | "robe";
export type SciFiArmorType = "none" | "exosuit" | "carapace" | "cloak";
export type CyberpunkArmorType = "none" | "riotfit" | "vest" | "weave";

export const FANTASY_WEAPON_TYPES: readonly FantasyWeaponType[] = [
  "none",
  "axe",
  "dagger",
  "sword",
  "bow",
  "staff",
] as const;
export const SCIFI_WEAPON_TYPES: readonly SciFiWeaponType[] = [
  "none",
  "cannon",
  "pistol",
  "rifle",
  "beam",
  "railgun",
] as const;
export const CYBERPUNK_WEAPON_TYPES: readonly CyberpunkWeaponType[] = [
  "none",
  "shotgun",
  "knife",
  "katana",
  "smartsmg",
  "monowire",
] as const;

export const FANTASY_ARMOR_TYPES: readonly FantasyArmorType[] = [
  "none",
  "plate",
  "mail",
  "robe",
] as const;
export const SCIFI_ARMOR_TYPES: readonly SciFiArmorType[] = [
  "none",
  "exosuit",
  "carapace",
  "cloak",
] as const;
export const CYBERPUNK_ARMOR_TYPES: readonly CyberpunkArmorType[] = [
  "none",
  "riotfit",
  "vest",
  "weave",
] as const;

/** Combat pools (no "none") used by the loot type roller. */
export const FANTASY_COMBAT_WEAPON_TYPES: readonly Exclude<FantasyWeaponType, "none">[] = [
  "axe",
  "dagger",
  "sword",
  "bow",
  "staff",
] as const;
export const SCIFI_COMBAT_WEAPON_TYPES: readonly Exclude<SciFiWeaponType, "none">[] = [
  "cannon",
  "pistol",
  "rifle",
  "beam",
  "railgun",
] as const;
export const CYBERPUNK_COMBAT_WEAPON_TYPES: readonly Exclude<CyberpunkWeaponType, "none">[] =
  ["shotgun", "knife", "katana", "smartsmg", "monowire"] as const;

export const FANTASY_COMBAT_ARMOR_TYPES: readonly Exclude<FantasyArmorType, "none">[] = [
  "plate",
  "mail",
  "robe",
] as const;
export const SCIFI_COMBAT_ARMOR_TYPES: readonly Exclude<SciFiArmorType, "none">[] = [
  "exosuit",
  "carapace",
  "cloak",
] as const;
export const CYBERPUNK_COMBAT_ARMOR_TYPES: readonly Exclude<CyberpunkArmorType, "none">[] = [
  "riotfit",
  "vest",
  "weave",
] as const;

/**
 * Loose carrier types — same rationale as `Element`. An asset
 * translated across presets carries the *target* preset's archetype
 * string at runtime, which would not satisfy a single canonical
 * union. Producers should still use the strict per-preset unions so a
 * stray vocab can't leak in at construction time.
 */
export type WeaponType = string;
export type ArmorType = string;

export function weaponTypesFor(preset: Preset): readonly string[] {
  if (preset === "fantasy") return FANTASY_WEAPON_TYPES;
  if (preset === "scifi") return SCIFI_WEAPON_TYPES;
  return CYBERPUNK_WEAPON_TYPES;
}

export function combatWeaponTypesFor(preset: Preset): readonly string[] {
  if (preset === "fantasy") return FANTASY_COMBAT_WEAPON_TYPES;
  if (preset === "scifi") return SCIFI_COMBAT_WEAPON_TYPES;
  return CYBERPUNK_COMBAT_WEAPON_TYPES;
}

export function armorTypesFor(preset: Preset): readonly string[] {
  if (preset === "fantasy") return FANTASY_ARMOR_TYPES;
  if (preset === "scifi") return SCIFI_ARMOR_TYPES;
  return CYBERPUNK_ARMOR_TYPES;
}

export function combatArmorTypesFor(preset: Preset): readonly string[] {
  if (preset === "fantasy") return FANTASY_COMBAT_ARMOR_TYPES;
  if (preset === "scifi") return SCIFI_COMBAT_ARMOR_TYPES;
  return CYBERPUNK_COMBAT_ARMOR_TYPES;
}

/**
 * uint8 index for a weapon archetype string, against `preset`'s native
 * vocabulary. Unknown strings fall back to 0 = "none".
 */
export function weaponTypeIndex(preset: Preset, weaponType: string): number {
  const pool = weaponTypesFor(preset);
  const i = pool.indexOf(weaponType);
  return i < 0 ? 0 : i;
}

export function weaponTypeFromIndex(preset: Preset, index: number): string {
  const pool = weaponTypesFor(preset);
  return pool[index] ?? "none";
}

export function armorTypeIndex(preset: Preset, armorType: string): number {
  const pool = armorTypesFor(preset);
  const i = pool.indexOf(armorType);
  return i < 0 ? 0 : i;
}

export function armorTypeFromIndex(preset: Preset, index: number): string {
  const pool = armorTypesFor(preset);
  return pool[index] ?? "none";
}

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
  /**
   * Preset this asset was originally minted under. Parsed from the
   * `Schema` metadata attribute (e.g. `"scifi:3"` → `"scifi"`).
   * Used by the adapter translation layer to resolve cross-realm hops
   * for player-deployed realms that aren't in the seeded-realms map.
   */
  realmPreset?: Preset;
  slot: Slot;
  tier: Tier;
  /** Assembled from the realm's flavor bank at mint time. */
  name: string;
  damageDie?: DamageDie;
  /** Flat bonus added to the d20 to-hit roll. Weapon-slot only. */
  attackBonus?: number;
  /** Flat bonus added to the damage die roll (after crit multiplier). Weapon-slot only. */
  damageBonus?: number;
  acBonus?: number;
  hpBonus?: number;
  /**
   * Weapon-slot only: the element the weapon deals on a hit. Maps onto a
   * monster's `weakTo`/`resistTo` for the player→monster damage multiplier
   *. Absent / "none" → mundane swing, no multiplier.
   */
  element?: Element;
  /**
   * Armor-slot only: the element the armor halves on incoming hits when
   * the attacker's element matches. Spec field `school_resist`
   * (Fantasy) / `energy_resist` (Sci-Fi) / `tech_resist` (Cyberpunk) all
   * map onto this canonical field via adapters.
   */
  resistElement?: Element;
  /**
   * Weapon-slot only: archetype lane (Axe/Pistol/Katana/...) drawn from
   * the source preset's vocabulary. Drives the on-chain tier-scaled
   * name lookup and the per-(adapter, sourceType) stat-delta table.
   * "none" or absent → un-archetyped legacy / story-object loot.
   */
  weaponType?: WeaponType;
  /**
   * Armor-slot only: archetype lane (Plate/ExoSuit/Weave/...) drawn
   * from the source preset's vocabulary. Same mechanic as
   * `weaponType` for armor.
   */
  armorType?: ArmorType;
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
  /**
   * Element the monster swings with. Absent ⇒ "none" (mundane). Used by
   * combat.ts to halve damage taken by elementally-matching armor.
   */
  element?: Element;
  /**
   * Weapon element the monster takes 1.5× damage from on hit. Omit for
   * monsters with no elemental weakness.
   */
  weakTo?: Element;
  /**
   * Weapon element the monster takes 0.5× damage from on hit. Omit for
   * monsters with no elemental resistance.
   */
  resistTo?: Element;
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
  /** Element the boss attacks with — symmetric to MonsterDef.element. */
  element?: Element;
  /** Weapon element the boss takes 1.5× damage from. */
  weakTo?: Element;
  /** Weapon element the boss takes 0.5× damage from. */
  resistTo?: Element;
};

export type EncounterArchetype = "combat";

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
  /**
   * Per-turn defensive flags set by the Secondary action. All four are
   * cleared at the start of the next round (consumed by the same round's
   * monster swing). The active flag depends on the equipped armor:
   *   - `damage_reduction` armor → bracedThisTurn (+2 AC for incoming swing)
   *   - `dodge_chance` armor    → guaranteedDodgeThisTurn (auto-dodge)
   *   - `regen` armor           → regenDoubledThisTurn (regen × 2)
   *   - `thorns` armor          → thornsDoubledThisTurn (thorns × 2)
   * Bare armor (no defensive effect) sets focusPrimed instead, which
   * persists across turns until consumed by the next Attack.
   */
  bracedThisTurn: boolean;
  guaranteedDodgeThisTurn: boolean;
  regenDoubledThisTurn: boolean;
  thornsDoubledThisTurn: boolean;
  /**
   * Set by Secondary on bare/no-effect armor. The NEXT Attack auto-crits
   * (forced `crit = true`) and adds +2 to-hit. Persists across turns —
   * only consumed by an Attack action, not by ending the round.
   */
  focusPrimed: boolean;
  /**
   * Rebalance: set once when a boss crosses the phase-1→phase-2
   * threshold. Adds +2 to the player's to-hit on every subsequent
   * Attack swing for the rest of the fight. The intent is to make
   * phase 2 feel like a climax — the boss bleeds and rages (its
   * attackDie bumps up; sometimes a player effect is suppressed) and
   * the player rolls hot in the same beat. Never cleared mid-fight.
   * On non-boss combats this stays false.
   */
  phase2PlayerBuffed: boolean;
  /** Turns of bleed DoT remaining on the monster (per-attacker is overkill for PoC). */
  bleedStacks: number;
  /** Suppressed catalog effects on the player, set at boss phase 2 if applicable. */
  suppressedEffects: CatalogEffectName[];
  turn: number;
};

export type EncounterState = {
  kind: "combat";
  archetype: "combat";
  combat: CombatState;
};

export type LootRoll = {
  tier: Tier;
  slot: Slot;
  /** Signature schema id when the realm has one for `slot`; else canonical fallback. */
  schemaId: number;
  damageDie?: DamageDie;
  attackBonus?: number;
  damageBonus?: number;
  acBonus?: number;
  hpBonus?: number;
  /** Weapon-slot only: rolled element. "none" or omitted means mundane. */
  element?: Element;
  /** Armor-slot only: rolled resistance element. */
  resistElement?: Element;
  /** Weapon-slot only: rolled archetype. "none" → un-archetyped. */
  weaponType?: WeaponType;
  /** Armor-slot only: rolled archetype. */
  armorType?: ArmorType;
  catalogEffects: CatalogEffect[];
  /**
   * Seed for legacy adjective+noun assembly. Retained so existing
   * deterministic tests keep their seed budget — the runtime now
   * derives the name from `(weaponType|armorType, tier)` via the
   * schema-native ladder, not from this seed.
   */
  nameSeed: bigint;
  /**
   * Story-object name override. When set, the runtime skips the
   * realm-themed adjective+noun assembly for this drop and uses this
   * name verbatim. Reserved for narrative beats like Genesis' Pilgrim's
   * Brand — generic loot leaves this undefined.
   */
  nameOverride?: string;
  extraFields: Record<string, string | number | boolean>;
};

/**
 * One unminted finding held in the delve escrow. Carries the depth (and
 * boss flag) it was found at so the deferred batch mint can validate each
 * drop against the difficulty band it rolled in. See `RunState.escrow`.
 */
export type EscrowEntry = {
  loot: LootRoll;
  depth: number;
  isBoss: boolean;
};

export type RunState = {
  preset: Preset;
  realm: `0x${string}`;
  /** Committed at run start: keccak256(playerAddr ‖ blockhash ‖ encounterId). */
  rngSeed: `0x${string}`;
  /** Current room number, 1-indexed. */
  depth: number;
  /**
   * Depth at which the boss arrives. Starters set 3 — the run is three
   * rooms (easy → elite → boss). Player-built realms may pick their own
   * depth (default `BOSS_DEPTH`).
   */
  bossDepth: number;
  encounter: EncounterState | null;
  equipped: { weapon?: AssetCard; armor?: AssetCard; accessory?: AssetCard };
  /**
   * Persistent player HP across encounters. Seeded at run start from
   * `playerStartHp(equipped).hp`, then carried room-to-room: combat
   * write-back copies `CombatState.playerHp` onto this field when a fight
   * resolves. Encounter generation reads from here instead of resetting
   * to max. Clamped `[0, playerMaxHp]`; zero terminates the run via
   * permadeath.
   */
  playerHp: number;
  /**
   * Player HP cap, pinned at run start from equipped armor. Re-pinned on
   * `equipItem` so armor with a larger `hpBonus` raises the cap (the
   * extension does NOT refill — gear upgrade is not a free heal).
   */
  playerMaxHp: number;
  /**
   * Delve/extraction escrow. Loot cleared from rooms is
   * held here *unminted* until the player Extracts (banks the batch) or
   * clears the boss (forced auto-bank). The owned/equipped NFTs are never
   * at risk — only this unrealized findings list.
   *
   *   - Extract  → the UI batch-mints `escrow`, then calls
   *     `commitExtraction` to clear it.
   *   - Boss clear → the boss drop is pushed here too; the run ends a
   *     success and the UI batch-mints the lot.
   *   - Permadeath → escrow is forfeit; the defeat screen reads this list
   *     to show what was lost (it is NOT cleared on death).
   *
   * Each entry records the `depth` (and `isBoss`) the drop was found at,
   * NOT the depth the player extracts from. The deferred batch mint must
   * validate every item against the difficulty band it actually rolled in
   * — a T1 found at depth 1 would be rejected by the server validator if
   * presented as a depth-5 "deep" drop.
   */
  escrow: EscrowEntry[];
  /**
   * True when the player may Extract from the current position — i.e. the
   * run is live and not standing in the boss room. Recomputed on every
   * depth transition as `depth < bossDepth`. The boss room is
   * non-extractable: the only way out is to win (auto-bank) or die
   * (forfeit the escrow).
   */
  extractable: boolean;
  /**
   * Terminal success flag: the player chose to Extract and surfaced. The
   * run is over (unlike a live state), but unlike `defeated` the escrow is
   * banked rather than forfeit. Mutually exclusive with `defeated`. The UI
   * batch-mints `escrow` and then calls `commitExtraction`.
   */
  extracted?: boolean;
  bossCleared: boolean;
  bossClearedTimestamp?: number;
  bossClearedTurns?: number;
  /**
   * Roguelike permadeath terminator. When true, the run is over —
   * `step` and `advance` reject further input and the UI surfaces the
   * defeat overlay with a restart CTA. Gear in `equipped` is retained
   * (a death surrenders progress, not inventory), but the unbanked
   * `escrow` is forfeit. No clearReceipt is minted, so the
   * realm-progression chain stays put.
   */
  defeated: boolean;
  defeatedAtDepth?: number;
  defeatedTurn?: number;
  /**
   * When set, the FIRST weapon-slot loot drop of the run is coerced to
   * this element regardless of the rolled value. Genesis uses "fire" so
   * the Hag (`weakTo: fire`) is winnable as a story beat — the player
   * finds a pilgrim's blade.
   */
  forcedFirstWeaponElement?: Exclude<Element, "none">;
  /**
   * True once any weapon-slot loot has dropped this run. Gates
   * `forcedFirstWeaponElement` so the override fires exactly once.
   */
  firstWeaponDropped: boolean;
};

/**
 * Player input to `step()`. The only encounter kind is combat:
 *
 *   combat → "attack" always; "secondary" resolves its mechanical effect
 *     from the player's equipped armor (see `combat.ts` for the mapping).
 */
export type ActionChoice =
  | { kind: "attack" }
  | { kind: "secondary" };

export type NarrationLine = {
  text: string;
  emphasis?: "info" | "damage" | "heal" | "drama";
};

export type EngineEvent =
  | { type: "RoomCleared"; depth: number }
  | { type: "BossCleared"; finalHp: number; turns: number }
  | { type: "LootDropped"; loot: LootRoll }
  | { type: "PlayerDefeated"; depth: number; turn: number }
  | { type: "Extracted"; count: number };

export type StepResult = {
  state: RunState;
  /** 1..N narration lines to render after the step. */
  outcome: NarrationLine[];
  events: EngineEvent[];
};
