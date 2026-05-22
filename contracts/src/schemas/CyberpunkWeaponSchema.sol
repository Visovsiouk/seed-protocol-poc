// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SeedTypes} from "../SeedTypes.sol";
import {DamageDie} from "../DamageDie.sol";

/// @title  CyberpunkWeaponSchema
/// @notice The Cyberpunk realm's native weapon schema. Element
///         vocabulary is the street-tech lexicon (incendiary,
///         cryogenic, emp, laser, nano). WeaponType vocabulary is the
///         matching urban-combat set (shotgun, knife, katana,
///         smart-smg, monowire). PoC index parity with the other
///         weapon schemas does not imply naming parity.
library CyberpunkWeaponSchema {
    enum Element {None, Incendiary, Cryogenic, EMP, Laser, Nano}
    enum WeaponType {None, Shotgun, Knife, Katana, SmartSMG, Monowire}

    struct Ext {
        DamageDie.Die damageDie;
        int8 attackBonus;
        int8 damageBonus;
        Element element;
        WeaponType weaponType;
    }

    function elementLabel(Element e) internal pure returns (string memory) {
        if (e == Element.None) return "none";
        if (e == Element.Incendiary) return "incendiary";
        if (e == Element.Cryogenic) return "cryogenic";
        if (e == Element.EMP) return "emp";
        if (e == Element.Laser) return "laser";
        return "nano";
    }

    function typeLabel(WeaponType t) internal pure returns (string memory) {
        if (t == WeaponType.None) return "none";
        if (t == WeaponType.Shotgun) return "shotgun";
        if (t == WeaponType.Knife) return "knife";
        if (t == WeaponType.Katana) return "katana";
        if (t == WeaponType.SmartSMG) return "smart-smg";
        return "monowire";
    }

    function name(WeaponType t, SeedTypes.Tier tier) internal pure returns (string memory) {
        if (t == WeaponType.Shotgun) {
            if (tier == SeedTypes.Tier.T1) return "Sawn-Off";
            if (tier == SeedTypes.Tier.T2) return "Riot Gun";
            if (tier == SeedTypes.Tier.T3) return "Combat Shotgun";
            if (tier == SeedTypes.Tier.T4) return "Auto-Shotgun";
            return "Devastator";
        }
        if (t == WeaponType.Knife) {
            if (tier == SeedTypes.Tier.T1) return "Box-Cutter";
            if (tier == SeedTypes.Tier.T2) return "Switchblade";
            if (tier == SeedTypes.Tier.T3) return "Combat Knife";
            if (tier == SeedTypes.Tier.T4) return "Mono-Knife";
            return "Razorgrin";
        }
        if (t == WeaponType.Katana) {
            if (tier == SeedTypes.Tier.T1) return "Tanto";
            if (tier == SeedTypes.Tier.T2) return "Wakizashi";
            if (tier == SeedTypes.Tier.T3) return "Katana";
            if (tier == SeedTypes.Tier.T4) return "Mono-Katana";
            return "Edgelord";
        }
        if (t == WeaponType.SmartSMG) {
            if (tier == SeedTypes.Tier.T1) return "Cheap-SMG";
            if (tier == SeedTypes.Tier.T2) return "Smartlink SMG";
            if (tier == SeedTypes.Tier.T3) return "Pulse SMG";
            if (tier == SeedTypes.Tier.T4) return "Daemon SMG";
            return "Ghost-in-the-Wire";
        }
        if (t == WeaponType.Monowire) {
            if (tier == SeedTypes.Tier.T1) return "Wire";
            if (tier == SeedTypes.Tier.T2) return "Garrote";
            if (tier == SeedTypes.Tier.T3) return "Monowhip";
            if (tier == SeedTypes.Tier.T4) return "Phase Wire";
            return "Killscript";
        }
        return "";
    }
}
