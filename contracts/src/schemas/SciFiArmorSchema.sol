// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  SciFiArmorSchema
/// @notice The Sci-Fi realm's native armor schema. Resist-element
///         vocabulary is the space-opera lexicon — armor is rated
///         against plasma, cryo, ion, photon, void hazards.
library SciFiArmorSchema {
    enum Element {None, Plasma, Cryo, Ion, Photon, Void}

    struct Ext {
        int8 acBonus;
        int8 hpBonus;
        Element resistElement;
    }

    function label(Element e) internal pure returns (string memory) {
        if (e == Element.None) return "none";
        if (e == Element.Plasma) return "plasma";
        if (e == Element.Cryo) return "cryo";
        if (e == Element.Ion) return "ion";
        if (e == Element.Photon) return "photon";
        return "void";
    }
}
