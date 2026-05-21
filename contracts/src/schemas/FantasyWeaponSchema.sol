// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DamageDie} from "../DamageDie.sol";

/// @title  FantasyWeaponSchema
/// @notice The Fantasy realm's native weapon schema. Element vocabulary
///         is the medieval-fantasy lexicon (fire, ice, shock, holy,
///         unholy). This schema is the *truth* for Fantasy weapons —
///         no other preset's vocabulary leaks in here. Adapters
///         translate Fantasy → other realms by re-encoding into the
///         target schema; they never project foreign vocab back.
library FantasyWeaponSchema {
    enum Element {None, Fire, Ice, Shock, Holy, Unholy}

    struct Ext {
        DamageDie.Die damageDie;
        int8 attackBonus;
        int8 damageBonus;
        Element element;
    }

    function label(Element e) internal pure returns (string memory) {
        if (e == Element.None) return "none";
        if (e == Element.Fire) return "fire";
        if (e == Element.Ice) return "ice";
        if (e == Element.Shock) return "shock";
        if (e == Element.Holy) return "holy";
        return "unholy";
    }
}
