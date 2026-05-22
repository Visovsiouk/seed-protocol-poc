// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SeedTypes} from "../SeedTypes.sol";

/// @title  FantasyArmorSchema
/// @notice The Fantasy realm's native armor schema. The resist-element
///         vocabulary mirrors `FantasyWeaponSchema.Element`. ArmorType
///         is a smaller-than-weapon archetype set (heavy / medium /
///         light) that mirrors the same lanes across all three armor
///         schemas:
///           1 = heavy  (Plate / ExoSuit / RiotFit)
///           2 = medium (Mail / Carapace / Vest)
///           3 = light  (Robe / Cloak / Weave)
library FantasyArmorSchema {
    enum Element {None, Fire, Ice, Shock, Holy, Unholy}
    enum ArmorType {None, Plate, Mail, Robe}

    struct Ext {
        int8 acBonus;
        int8 hpBonus;
        Element resistElement;
        ArmorType armorType;
    }

    function elementLabel(Element e) internal pure returns (string memory) {
        if (e == Element.None) return "none";
        if (e == Element.Fire) return "fire";
        if (e == Element.Ice) return "ice";
        if (e == Element.Shock) return "shock";
        if (e == Element.Holy) return "holy";
        return "unholy";
    }

    function typeLabel(ArmorType t) internal pure returns (string memory) {
        if (t == ArmorType.None) return "none";
        if (t == ArmorType.Plate) return "plate";
        if (t == ArmorType.Mail) return "mail";
        return "robe";
    }

    function name(ArmorType t, SeedTypes.Tier tier) internal pure returns (string memory) {
        if (t == ArmorType.Plate) {
            if (tier == SeedTypes.Tier.T1) return "Cuirass";
            if (tier == SeedTypes.Tier.T2) return "Half-Plate";
            if (tier == SeedTypes.Tier.T3) return "Full Plate";
            if (tier == SeedTypes.Tier.T4) return "Crusader Plate";
            return "Drakeplate";
        }
        if (t == ArmorType.Mail) {
            if (tier == SeedTypes.Tier.T1) return "Padded Mail";
            if (tier == SeedTypes.Tier.T2) return "Chain Mail";
            if (tier == SeedTypes.Tier.T3) return "Banded Mail";
            if (tier == SeedTypes.Tier.T4) return "Elven Mail";
            return "Wyrmweave";
        }
        if (t == ArmorType.Robe) {
            if (tier == SeedTypes.Tier.T1) return "Initiate Robe";
            if (tier == SeedTypes.Tier.T2) return "Acolyte Robe";
            if (tier == SeedTypes.Tier.T3) return "Witch Robe";
            if (tier == SeedTypes.Tier.T4) return "Conclave Robe";
            return "Starcloak";
        }
        return "";
    }
}
