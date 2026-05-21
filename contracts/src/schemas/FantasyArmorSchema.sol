// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  FantasyArmorSchema
/// @notice The Fantasy realm's native armor schema. The resist-element
///         vocabulary mirrors `FantasyWeaponSchema.Element` — armor
///         resists what fantasy weapons inflict (fire / ice / shock /
///         holy / unholy). Kept as its own type rather than re-using
///         the weapon enum so each schema is self-contained on the
///         wire (`abi.decode` against `Ext` does not require a
///         weapon-side import).
library FantasyArmorSchema {
    enum Element {None, Fire, Ice, Shock, Holy, Unholy}

    struct Ext {
        int8 acBonus;
        int8 hpBonus;
        Element resistElement;
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
