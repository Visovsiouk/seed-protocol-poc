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

export type EncounterArchetype = "combat" | "trial" | "ledger" | "rest";

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

export type EncounterState =
  | {
      kind: "combat";
      archetype: "combat";
      combat: CombatState;
    }
  /**
   * Visible skill check. The player sees the DC and their bonus up
   * front, taps Attempt, rolls d20 + bonus. Success → small heal;
   * failure → larger HP loss (depth-scaled). Pass/fail narration is
   * baked onto the encounter at generation so the resolution lines
   * match the obstacle, intent, and stakes the player saw.
   */
  | {
      kind: "trial";
      archetype: "trial";
      /** Ability axis — driven by the chosen obstacle, not a die roll. */
      ability: "agility" | "endurance";
      /** Static DC the player must meet or exceed. */
      dc: number;
      /** Player's bonus from equipped armor, locked at room generation. */
      bonus: number;
      /** Scene-setting line: what the obstacle is. */
      prompt: string;
      /** Player goal: what you're trying to do about it. */
      intent: string;
      /** What's on the line on failure. */
      stakes: string;
      /** Narration rendered on a passed roll. */
      onSuccess: string;
      /** Narration rendered on a failed roll. */
      onFailure: string;
    }
  /**
   * Ledger room — once-per-run at a fixed depth. Player picks one of
   * the upcoming boss's two baked-in catalog effects to suppress for
   * the boss fight (or skips to keep both active).
   */
  | {
      kind: "ledger";
      archetype: "ledger";
      bossName: string;
      /** The two baked effects on the upcoming boss. */
      effects: [CatalogEffectName, CatalogEffectName];
    }
  /**
   * Rest room — safe-haven beat. Single button heals +50% maxHp,
   * clamped, no risk. Spawned probabilistically past depth 2 and only
   * when the player is meaningfully chipped (HP < ~80% maxHp); at full
   * HP the slot reverts to a trial so the safe room isn't wasted.
   */
  | {
      kind: "rest";
      archetype: "rest";
      /** Scene-setting line (preset-flavored). */
      prompt: string;
      /** Button label for the heal action ("Make Camp" / "Patch Up" / "Reboot"). */
      actionLabel: string;
      /** Pre-rolled heal amount, clamped at generation against current HP/maxHp. */
      healAmount: number;
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
 * Per-realm death handling.
 *
 *   "permadeath" — default. A monster swing that drops the player to
 *     ≤ 0 HP ends the run; `defeated` is set and the UI shows the
 *     defeat panel + restart CTA.
 *
 *   "seed-mercy" — Genesis-only. The Seed itself grows the player back
 *     from its own ground. Death rewinds the run to depth 1 with a
 *     re-seeded encounter chain, the `runAttempt` counter bumps, and
 *     the engine emits narrative lines (see `lib/story/genesis.ts`)
 *     into the feed. `defeated` is NEVER set; the UI keeps playing.
 *     Equipped gear persists across attempts.
 */
export type DefeatMode = "permadeath" | "seed-mercy";

export type RunState = {
  preset: Preset;
  realm: `0x${string}`;
  /** Committed at run start: keccak256(playerAddr ‖ blockhash ‖ encounterId). */
  rngSeed: `0x${string}`;
  /** Current room number, 1-indexed. */
  depth: number;
  /**
   * Depth at which the boss arrives. Defaults to 6 (the canonical
   * Reach-and-deeper layout). Genesis sets 5 — the Seed's first skin
   * is narrower than the shards. Player-built realms scale higher via
   *.
   */
  bossDepth: number;
  encounter: EncounterState | null;
  equipped: { weapon?: AssetCard; armor?: AssetCard; accessory?: AssetCard };
  /**
   * Persistent player HP across encounters. Seeded at run start (and on
   * seed-mercy respawn) from `playerStartHp(equipped).hp`, then carried
   * room-to-room: combat write-back copies `CombatState.playerHp` onto
   * this field when a fight resolves; trial resolution applies heal/damage
   * against it directly. Encounter generation reads from here instead of
   * resetting to max. Clamped `[0, playerMaxHp]`; zero terminates the run
   * via the standard defeat fork (seed-mercy or permadeath).
   */
  playerHp: number;
  /**
   * Player HP cap, pinned at run start from equipped armor. Re-pinned on
   * `equipItem` so armor with a larger `hpBonus` raises the cap (the
   * extension does NOT refill — gear upgrade is not a free heal). On
   * seed-mercy respawn maxHp is recomputed from current equipment.
   */
  playerMaxHp: number;
  pendingLoot?: LootRoll;
  bossCleared: boolean;
  bossClearedTimestamp?: number;
  bossClearedTurns?: number;
  /**
   * Roguelike permadeath terminator. When true, the run is over —
   * `step` and `advance` reject further input and the UI surfaces a
   * defeat panel with a restart CTA. Gear in `equipped` is retained
   * (a death surrenders progress, not inventory). No clearReceipt is
   * minted, so the realm-progression chain stays put.
   *
   * Only set under `defeatMode === "permadeath"`. Under "seed-mercy"
   * the engine rewinds and emits narration instead.
   */
  defeated: boolean;
  defeatedAtDepth?: number;
  defeatedTurn?: number;
  /** Per-realm death handling. See `DefeatMode`. */
  defeatMode: DefeatMode;
  /**
   * 1-based attempt counter. Bumps on every seed-mercy respawn so the
   * narrative voice can escalate (see `genesisRespawnVoice`) and so
   * the post-reset encounter chain doesn't deterministically replay
   * the death (the seed gets attempt-salted).
   */
  runAttempt: number;
  /**
   * When set, the FIRST weapon-slot loot drop of every run-attempt is
   * coerced to this element regardless of the rolled value. Genesis
   * uses "fire" so the Hag (`weakTo: fire`) is winnable as a story
   * beat — the player finds a pilgrim's blade. Cleared on respawn so
   * each attempt gets its own brand.
   */
  forcedFirstWeaponElement?: Exclude<Element, "none">;
  /**
   * True once any weapon-slot loot has dropped on this attempt. Gates
   * `forcedFirstWeaponElement` so the override fires exactly once per
   * attempt. Reset to false on seed-mercy respawn.
   */
  firstWeaponDropped: boolean;
  /**
   * Catalog effect names the player chose to suppress on the upcoming
   * boss via the Ledger room (depth 3). Applied at boss creation time —
   * the boss's `bakedEffects` array is filtered against this list. At
   * most one entry today; the list shape leaves room for stacked
   * suppression from future ledger beats. Reset on seed-mercy respawn.
   */
  runSuppressedBossEffects: CatalogEffectName[];
  /**
   * True once this attempt has visited a Ledger room. Gates the depth-3
   * override so the room only fires once per attempt. Reset on respawn.
   */
  ledgerConsumed: boolean;
};

/**
 * Player input to `step()`. The set of acceptable choices depends on
 * the active encounter's `kind`:
 *
 *   combat → "attack" always; "secondary" only when the current monster
 *     is a boss. Secondary's mechanical effect is resolved from the
 *     player's equipped armor (see `combat.ts` for the mapping).
 *
 *   trial → "trial".
 *
 *   ledger → "ledger" with `suppress` set to one of the boss's two
 *     baked effects, or null to skip.
 */
export type ActionChoice =
  | { kind: "attack" }
  | { kind: "secondary" }
  | { kind: "trial" }
  | { kind: "ledger"; suppress: CatalogEffectName | null }
  | { kind: "rest" };

export type NarrationLine = {
  text: string;
  emphasis?: "info" | "damage" | "heal" | "drama";
};

export type EngineEvent =
  | { type: "RoomCleared"; depth: number }
  | { type: "BossCleared"; finalHp: number; turns: number }
  | { type: "LootDropped"; loot: LootRoll }
  | { type: "PlayerDefeated"; depth: number; turn: number };

export type StepResult = {
  state: RunState;
  /** 1..N narration lines to render after the step. */
  outcome: NarrationLine[];
  events: EngineEvent[];
};
