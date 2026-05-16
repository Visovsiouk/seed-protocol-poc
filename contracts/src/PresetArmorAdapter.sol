// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAdapter} from "./interfaces/IAdapter.sol";
import {SeedTypes} from "./SeedTypes.sol";
import {PresetTypes} from "./PresetTypes.sol";
import {PresetElementLabels} from "./PresetElementLabels.sol";

/// @title  PresetArmorAdapter
/// @notice Translates an armor asset from one preset's armor schema into
///         another preset's armor schema. Mirrors `PresetWeaponAdapter`
///         but operates on the armor stat pair (acBonus, hpBonus) and the
///         `resistElement` field.
///
///         Real work happens in two places per translate:
///
///           1. Resist-element alias rename — same canonical numeric enum
///              as weapons, so the on-chain value is identity and the
///              off-chain consumer re-labels the trait (`resist_element`
///              ↔ `energy_resist` ↔ `tech_resist`).
///
///           2. Fantasy armor rebalance. Plate-style fantasy armor trades
///              1 AC for +5 HP vs. its sci-fi / cyberpunk equivalents:
///              the fantasy world hits less often (D6/D8 monsters) so HP
///              survives longer than AC. Crossing INTO fantasy applies
///              that delta; crossing OUT reverses it.
///
///         Same deployment cardinality as the weapon variant — one
///         instance per (source, target) preset pair × armor slot.
contract PresetArmorAdapter is IAdapter {
    uint256 public immutable sourceSchemaId;
    uint256 public immutable targetSchemaId;
    PresetTypes.Preset public immutable sourcePreset;
    PresetTypes.Preset public immutable targetPreset;

    string public constant slot = "armor";

    error SamePreset();

    constructor(
        uint256 _sourceSchemaId,
        uint256 _targetSchemaId,
        PresetTypes.Preset _sourcePreset,
        PresetTypes.Preset _targetPreset
    ) {
        if (_sourcePreset == _targetPreset) revert SamePreset();
        sourceSchemaId = _sourceSchemaId;
        targetSchemaId = _targetSchemaId;
        sourcePreset = _sourcePreset;
        targetPreset = _targetPreset;
    }

    /// @inheritdoc IAdapter
    function schemaMapping() external view returns (uint256, uint256) {
        return (sourceSchemaId, targetSchemaId);
    }

    /// @inheritdoc IAdapter
    function translate(
        uint256, /* tokenId */
        SeedTypes.CoreAttributes calldata sourceAttrs,
        bytes calldata extensionData
    ) external view returns (SeedTypes.CoreAttributes memory, bytes memory) {
        PresetTypes.ArmorExt memory src = abi.decode(extensionData, (PresetTypes.ArmorExt));

        // Apply the fantasy rebalance delta. Symmetric to the weapon
        // variant: INTO fantasy = -1 AC, +5 HP. OUT of fantasy = +1 AC,
        // -5 HP. scifi ↔ cyberpunk passes through unchanged.
        PresetTypes.ArmorExt memory dst = src;
        if (sourcePreset != PresetTypes.Preset.Fantasy && targetPreset == PresetTypes.Preset.Fantasy) {
            dst.acBonus = src.acBonus - 1;
            dst.hpBonus = src.hpBonus + 5;
        } else if (sourcePreset == PresetTypes.Preset.Fantasy && targetPreset != PresetTypes.Preset.Fantasy) {
            dst.acBonus = src.acBonus + 1;
            dst.hpBonus = src.hpBonus - 5;
        }

        SeedTypes.CoreAttributes memory translatedAttrs = SeedTypes.CoreAttributes({
            tier: sourceAttrs.tier,
            extensionSchemaId: targetSchemaId,
            metadataURI: sourceAttrs.metadataURI
        });

        return (translatedAttrs, abi.encode(dst));
    }

    /// @notice On-chain element-label vocabulary lookup. See
    ///         `PresetWeaponAdapter.elementLabel` — both adapters expose
    ///         the same pure view so any adapter in the registry can
    ///         answer label queries.
    function elementLabel(PresetTypes.Preset preset, PresetTypes.Element element)
        external
        pure
        returns (string memory)
    {
        return PresetElementLabels.label(preset, element);
    }
}
