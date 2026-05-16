// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PresetTypes} from "./PresetTypes.sol";

/// @title  PresetElementLabels
/// @notice Pure lookup library: maps (Preset, Element) → the preset-local
///         label string for that canonical element. The numeric Element
///         value is shared across presets (fire == 1 everywhere); this
///         library is the *vocabulary* half of the adapter — the
///         on-chain source of truth for what a fantasy "holy" weapon
///         reads as inside a cyberpunk realm ("laser") or a sci-fi
///         realm ("photon").
///
///         Used by both `PresetWeaponAdapter.elementLabel` and
///         `PresetArmorAdapter.elementLabel`. Off-chain consumers call
///         the adapter's `elementLabel(preset, element)` view to render
///         chips and HUDs without baking the table client-side.
library PresetElementLabels {
    error UnknownPreset();

    /// @notice Returns the preset-local label for a canonical element.
    ///         `None` returns the literal "none" under every preset; it
    ///         is the absence-of-element sentinel and has no flavour name.
    function label(PresetTypes.Preset preset, PresetTypes.Element element)
        internal
        pure
        returns (string memory)
    {
        if (preset == PresetTypes.Preset.Fantasy) {
            if (element == PresetTypes.Element.None) return "none";
            if (element == PresetTypes.Element.Fire) return "fire";
            if (element == PresetTypes.Element.Ice) return "ice";
            if (element == PresetTypes.Element.Shock) return "shock";
            if (element == PresetTypes.Element.Holy) return "holy";
            if (element == PresetTypes.Element.Unholy) return "unholy";
        } else if (preset == PresetTypes.Preset.SciFi) {
            if (element == PresetTypes.Element.None) return "none";
            if (element == PresetTypes.Element.Fire) return "plasma";
            if (element == PresetTypes.Element.Ice) return "cryo";
            if (element == PresetTypes.Element.Shock) return "ion";
            if (element == PresetTypes.Element.Holy) return "photon";
            if (element == PresetTypes.Element.Unholy) return "void";
        } else if (preset == PresetTypes.Preset.Cyberpunk) {
            if (element == PresetTypes.Element.None) return "none";
            if (element == PresetTypes.Element.Fire) return "incendiary";
            if (element == PresetTypes.Element.Ice) return "cryogenic";
            if (element == PresetTypes.Element.Shock) return "emp";
            if (element == PresetTypes.Element.Holy) return "laser";
            if (element == PresetTypes.Element.Unholy) return "nano";
        }
        revert UnknownPreset();
    }
}
