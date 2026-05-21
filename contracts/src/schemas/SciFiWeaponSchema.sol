// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DamageDie} from "../DamageDie.sol";

/// @title  SciFiWeaponSchema
/// @notice The Sci-Fi realm's native weapon schema. Element vocabulary
///         is the space-opera lexicon (plasma, cryo, ion, photon,
///         void). Index parity with the other weapon schemas is a PoC
///         convenience (1:1 element mapping) — the *names* are native
///         and must not be conflated with Fantasy's "fire/ice/shock"
///         even where the index aligns.
library SciFiWeaponSchema {
    enum Element {None, Plasma, Cryo, Ion, Photon, Void}

    struct Ext {
        DamageDie.Die damageDie;
        int8 attackBonus;
        int8 damageBonus;
        Element element;
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
