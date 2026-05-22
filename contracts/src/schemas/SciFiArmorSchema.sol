// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SeedTypes} from "../SeedTypes.sol";

/// @title  SciFiArmorSchema
/// @notice The Sci-Fi realm's native armor schema. Resist-element
///         vocabulary is the space-opera lexicon. ArmorType mirrors the
///         heavy/medium/light archetype lanes shared with the other
///         armor schemas (ExoSuit / Carapace / Cloak).
library SciFiArmorSchema {
    enum Element {None, Plasma, Cryo, Ion, Photon, Void}
    enum ArmorType {None, ExoSuit, Carapace, Cloak}

    struct Ext {
        int8 acBonus;
        int8 hpBonus;
        Element resistElement;
        ArmorType armorType;
    }

    function elementLabel(Element e) internal pure returns (string memory) {
        if (e == Element.None) return "none";
        if (e == Element.Plasma) return "plasma";
        if (e == Element.Cryo) return "cryo";
        if (e == Element.Ion) return "ion";
        if (e == Element.Photon) return "photon";
        return "void";
    }

    function typeLabel(ArmorType t) internal pure returns (string memory) {
        if (t == ArmorType.None) return "none";
        if (t == ArmorType.ExoSuit) return "exosuit";
        if (t == ArmorType.Carapace) return "carapace";
        return "cloak";
    }

    function name(ArmorType t, SeedTypes.Tier tier) internal pure returns (string memory) {
        if (t == ArmorType.ExoSuit) {
            if (tier == SeedTypes.Tier.T1) return "Worksuit";
            if (tier == SeedTypes.Tier.T2) return "Marine Suit";
            if (tier == SeedTypes.Tier.T3) return "Powered Exo";
            if (tier == SeedTypes.Tier.T4) return "Heavy Exo";
            return "Titan Frame";
        }
        if (t == ArmorType.Carapace) {
            if (tier == SeedTypes.Tier.T1) return "Pressure Skin";
            if (tier == SeedTypes.Tier.T2) return "Combat Skin";
            if (tier == SeedTypes.Tier.T3) return "Carapace Plate";
            if (tier == SeedTypes.Tier.T4) return "Aegis Carapace";
            return "Voidskin";
        }
        if (t == ArmorType.Cloak) {
            if (tier == SeedTypes.Tier.T1) return "Vac Cloak";
            if (tier == SeedTypes.Tier.T2) return "Stealth Cloak";
            if (tier == SeedTypes.Tier.T3) return "Phase Cloak";
            if (tier == SeedTypes.Tier.T4) return "Ghost Cloak";
            return "Null Cloak";
        }
        return "";
    }
}
