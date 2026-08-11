// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SeedTypes} from "seed-protocol/SeedTypes.sol";

/// @title  CyberpunkArmorSchema
/// @notice The Cyberpunk realm's native armor schema. Resist-element
///         vocabulary is the street-tech lexicon. ArmorType mirrors
///         the heavy/medium/light archetype lanes (RiotFit / Vest /
///         Weave).
library CyberpunkArmorSchema {
    enum Element {None, Incendiary, Cryogenic, EMP, Laser, Nano}
    enum ArmorType {None, RiotFit, Vest, Weave}

    struct Ext {
        int8 acBonus;
        int8 hpBonus;
        Element resistElement;
        ArmorType armorType;
    }

    function elementLabel(Element e) internal pure returns (string memory) {
        if (e == Element.None) return "none";
        if (e == Element.Incendiary) return "incendiary";
        if (e == Element.Cryogenic) return "cryogenic";
        if (e == Element.EMP) return "emp";
        if (e == Element.Laser) return "laser";
        return "nano";
    }

    function typeLabel(ArmorType t) internal pure returns (string memory) {
        if (t == ArmorType.None) return "none";
        if (t == ArmorType.RiotFit) return "riotfit";
        if (t == ArmorType.Vest) return "vest";
        return "weave";
    }

    function name(ArmorType t, SeedTypes.Tier tier) internal pure returns (string memory) {
        if (t == ArmorType.RiotFit) {
            if (tier == SeedTypes.Tier.T1) return "Street Vest";
            if (tier == SeedTypes.Tier.T2) return "Riot Pads";
            if (tier == SeedTypes.Tier.T3) return "Riot Plate";
            if (tier == SeedTypes.Tier.T4) return "Heavy Riot";
            return "Cordon Maximum";
        }
        if (t == ArmorType.Vest) {
            if (tier == SeedTypes.Tier.T1) return "Tac-Vest";
            if (tier == SeedTypes.Tier.T2) return "Plate Carrier";
            if (tier == SeedTypes.Tier.T3) return "Smart Vest";
            if (tier == SeedTypes.Tier.T4) return "Composite Vest";
            return "Skinweave";
        }
        if (t == ArmorType.Weave) {
            if (tier == SeedTypes.Tier.T1) return "Mesh";
            if (tier == SeedTypes.Tier.T2) return "Smart Mesh";
            if (tier == SeedTypes.Tier.T3) return "Subdermal Weave";
            if (tier == SeedTypes.Tier.T4) return "Mantis Weave";
            return "Ghostweave";
        }
        return "";
    }
}
