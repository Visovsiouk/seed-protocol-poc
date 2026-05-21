// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  DamageDie
/// @notice Shared mechanical primitive across every weapon schema. The
///         vocabulary that *names* damage may be preset-specific (a
///         Fantasy "longsword d8" reads differently from a Sci-Fi
///         "plasma rifle d8") but the underlying die ladder is the
///         same across realms — it is the unit of combat math the
///         engine consumes.
///
/// Kept as a free-standing library (not bundled into the schemas) so
/// each weapon schema declares its own struct over the same die ladder
/// without forcing a dependency direction between schemas.
library DamageDie {
    enum Die {D4, D6, D8, D10, D12}

    /// @notice Step the die one notch up the ladder (D4→D6→D8→D10→D12).
    ///         D12 is the ceiling and clamps in place.
    function stepUp(Die d) internal pure returns (Die) {
        if (d == Die.D12) return Die.D12;
        return Die(uint8(d) + 1);
    }

    /// @notice Step the die one notch down the ladder (D12→D10→D8→D6→D4).
    ///         D4 is the floor and clamps in place.
    function stepDown(Die d) internal pure returns (Die) {
        if (d == Die.D4) return Die.D4;
        return Die(uint8(d) - 1);
    }
}
