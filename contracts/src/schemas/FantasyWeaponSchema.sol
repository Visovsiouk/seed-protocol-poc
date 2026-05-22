// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SeedTypes} from "../SeedTypes.sol";
import {DamageDie} from "../DamageDie.sol";

/// @title  FantasyWeaponSchema
/// @notice The Fantasy realm's native weapon schema. Element vocabulary
///         is the medieval-fantasy lexicon (fire, ice, shock, holy,
///         unholy). WeaponType vocabulary is the matching melee-and-
///         bow archetype set (axe, dagger, sword, bow, staff). Both
///         enums are *truth* for Fantasy — no other preset's vocab
///         leaks in here. Adapters translate Fantasy → other realms by
///         re-encoding into the target schema; they never project
///         foreign vocab back.
///
///         The five non-None type indices line up with the archetype
///         lane shared across all three weapon schemas:
///           1 = heavy close   (Axe / Cannon / Shotgun)
///           2 = light close   (Dagger / Pistol / Knife)
///           3 = mid versatile (Sword / Rifle / Katana)
///           4 = ranged        (Bow / Beam / SmartSMG)
///           5 = exotic/caster (Staff / Railgun / Monowire)
///
///         The display name is *tier-scaled*: each `(weaponType, tier)`
///         resolves to a distinct hand-authored string on chain via
///         `name(WeaponType, Tier)` — there are no off-chain
///         adjective/noun pools any more.
library FantasyWeaponSchema {
    enum Element {None, Fire, Ice, Shock, Holy, Unholy}
    enum WeaponType {None, Axe, Dagger, Sword, Bow, Staff}

    struct Ext {
        DamageDie.Die damageDie;
        int8 attackBonus;
        int8 damageBonus;
        Element element;
        WeaponType weaponType;
    }

    function elementLabel(Element e) internal pure returns (string memory) {
        if (e == Element.None) return "none";
        if (e == Element.Fire) return "fire";
        if (e == Element.Ice) return "ice";
        if (e == Element.Shock) return "shock";
        if (e == Element.Holy) return "holy";
        return "unholy";
    }

    function typeLabel(WeaponType t) internal pure returns (string memory) {
        if (t == WeaponType.None) return "none";
        if (t == WeaponType.Axe) return "axe";
        if (t == WeaponType.Dagger) return "dagger";
        if (t == WeaponType.Sword) return "sword";
        if (t == WeaponType.Bow) return "bow";
        return "staff";
    }

    /// @notice Tier-scaled hand-authored display name. `None` collapses
    ///         to the empty string so the UI can fall back to a slot
    ///         label; otherwise the (type, tier) pair resolves to a
    ///         unique string. The T-index is 0-based here to match
    ///         `SeedTypes.Tier`.
    function name(WeaponType t, SeedTypes.Tier tier) internal pure returns (string memory) {
        if (t == WeaponType.Axe) {
            if (tier == SeedTypes.Tier.T1) return "Hatchet";
            if (tier == SeedTypes.Tier.T2) return "Cleaver";
            if (tier == SeedTypes.Tier.T3) return "Greataxe";
            if (tier == SeedTypes.Tier.T4) return "Skullsplitter";
            return "Earthbreaker";
        }
        if (t == WeaponType.Dagger) {
            if (tier == SeedTypes.Tier.T1) return "Tooth";
            if (tier == SeedTypes.Tier.T2) return "Shiv";
            if (tier == SeedTypes.Tier.T3) return "Stiletto";
            if (tier == SeedTypes.Tier.T4) return "Fang";
            return "Dragon's Fang";
        }
        if (t == WeaponType.Sword) {
            if (tier == SeedTypes.Tier.T1) return "Shortsword";
            if (tier == SeedTypes.Tier.T2) return "Arming Sword";
            if (tier == SeedTypes.Tier.T3) return "Longsword";
            if (tier == SeedTypes.Tier.T4) return "Bastard Sword";
            return "Sunblade";
        }
        if (t == WeaponType.Bow) {
            if (tier == SeedTypes.Tier.T1) return "Shortbow";
            if (tier == SeedTypes.Tier.T2) return "Hornbow";
            if (tier == SeedTypes.Tier.T3) return "Longbow";
            if (tier == SeedTypes.Tier.T4) return "Yewbow";
            return "Stormcaller";
        }
        if (t == WeaponType.Staff) {
            if (tier == SeedTypes.Tier.T1) return "Walking Stick";
            if (tier == SeedTypes.Tier.T2) return "Quarterstaff";
            if (tier == SeedTypes.Tier.T3) return "Runestaff";
            if (tier == SeedTypes.Tier.T4) return "Witchstaff";
            return "Worldroot";
        }
        return "";
    }
}
