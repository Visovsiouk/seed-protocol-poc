// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DamageDie} from "../DamageDie.sol";

/// @title  CyberpunkWeaponSchema
/// @notice The Cyberpunk realm's native weapon schema. Element
///         vocabulary is the street-tech lexicon (incendiary,
///         cryogenic, emp, laser, nano). PoC index parity with the
///         other weapon schemas does not imply naming parity — a
///         Cyberpunk weapon's element is *incendiary*, not "fire
///         renamed".
library CyberpunkWeaponSchema {
    enum Element {None, Incendiary, Cryogenic, EMP, Laser, Nano}

    struct Ext {
        DamageDie.Die damageDie;
        int8 attackBonus;
        int8 damageBonus;
        Element element;
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
