// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  CyberpunkArmorSchema
/// @notice The Cyberpunk realm's native armor schema. Resist-element
///         vocabulary is the street-tech lexicon — armor is rated
///         against incendiary, cryogenic, emp, laser, nano hazards.
library CyberpunkArmorSchema {
    enum Element {None, Incendiary, Cryogenic, EMP, Laser, Nano}

    struct Ext {
        int8 acBonus;
        int8 hpBonus;
        Element resistElement;
    }

    function label(Element e) internal pure returns (string memory) {
        if (e == Element.None) return "none";
        if (e == Element.Incendiary) return "incendiary";
        if (e == Element.Cryogenic) return "cryogenic";
        if (e == Element.EMP) return "emp";
        if (e == Element.Laser) return "laser";
        return "nano";
    }
}
