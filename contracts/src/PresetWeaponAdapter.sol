// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAdapter} from "./interfaces/IAdapter.sol";
import {SeedTypes} from "./SeedTypes.sol";
import {PresetTypes} from "./PresetTypes.sol";

/// @title  PresetWeaponAdapter
/// @notice Translates a weapon asset from one preset's weapon schema into
///         another preset's weapon schema. Holds a *deterministic*
///         translation table — same input always yields the same output,
///         no storage reads (the table is hard-coded in pure helpers).
///
///         Two pieces of real work happen per translate:
///
///           1. Element alias rename — the canonical numeric enum is
///              shared across presets (fire == 1 everywhere), so the
///              numeric value passes through untouched. Off-chain
///              consumers re-emit it under the preset's local name
///              (`element` / `weapon_type` / `damage_type`); on-chain
///              that's just a metadata trait label.
///
///           2. Preset-pair stat rebalance. Cyberpunk weapons trade a
///              damage-die step (D8 → D6) for +1 `attackBonus` vs. their
///              fantasy / sci-fi equivalents — the spec calls for "more
///              hits, lighter hits". When crossing the cyberpunk
///              boundary the adapter applies that delta and reverses it
///              going the other way.
///
///         The adapter is registered against a single
///         (sourceSchemaId, targetSchemaId) pair at deploy time, so the
///         registry's per-pair lookup returns it directly. Twelve total
///         instances cover all six ordered preset pairs × the two slots
///         (the armor variant lives in `PresetArmorAdapter`).
contract PresetWeaponAdapter is IAdapter {
    /// @notice The schema this adapter reads from.
    uint256 public immutable sourceSchemaId;

    /// @notice The schema this adapter writes to.
    uint256 public immutable targetSchemaId;

    /// @notice The preset the source schema belongs to. Used to decide
    ///         whether the cyberpunk damage-die / attack-bonus delta is
    ///         being applied or reversed in this direction.
    PresetTypes.Preset public immutable sourcePreset;

    /// @notice The preset the target schema belongs to.
    PresetTypes.Preset public immutable targetPreset;

    /// @notice Marker so a caller looking at the registry entry can
    ///         confirm this is a weapon adapter without ABI-decoding.
    string public constant slot = "weapon";

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
        PresetTypes.WeaponExt memory src = abi.decode(extensionData, (PresetTypes.WeaponExt));

        // Apply the cyberpunk rebalance delta. The transform is symmetric:
        // crossing INTO cyberpunk steps the die down and adds +1 attack;
        // crossing OUT of cyberpunk steps the die up and subtracts -1.
        // When neither side is cyberpunk (fantasy ↔ scifi) the weapon
        // stats pass through unchanged. Element + damageBonus always
        // pass through — see contract docblock.
        PresetTypes.WeaponExt memory dst = src;
        if (sourcePreset != PresetTypes.Preset.Cyberpunk && targetPreset == PresetTypes.Preset.Cyberpunk) {
            dst.damageDie = _stepDown(src.damageDie);
            dst.attackBonus = src.attackBonus + 1;
        } else if (sourcePreset == PresetTypes.Preset.Cyberpunk && targetPreset != PresetTypes.Preset.Cyberpunk) {
            dst.damageDie = _stepUp(src.damageDie);
            dst.attackBonus = src.attackBonus - 1;
        }

        SeedTypes.CoreAttributes memory translatedAttrs = SeedTypes.CoreAttributes({
            tier: sourceAttrs.tier,
            extensionSchemaId: targetSchemaId,
            metadataURI: sourceAttrs.metadataURI
        });

        return (translatedAttrs, abi.encode(dst));
    }

    /// @dev D4 → D4 (clamp at floor). D6→D4, D8→D6, D10→D8, D12→D10.
    ///      Clamping is deliberate: weapons that already roll D4 can't
    ///      step further down, so the rebalance becomes lossy on the
    ///      lowest tier. The +1 attack bonus still applies.
    function _stepDown(PresetTypes.DamageDie die) private pure returns (PresetTypes.DamageDie) {
        if (die == PresetTypes.DamageDie.D4) return PresetTypes.DamageDie.D4;
        return PresetTypes.DamageDie(uint8(die) - 1);
    }

    /// @dev Inverse of _stepDown. D12 → D12 (clamp at ceiling).
    function _stepUp(PresetTypes.DamageDie die) private pure returns (PresetTypes.DamageDie) {
        if (die == PresetTypes.DamageDie.D12) return PresetTypes.DamageDie.D12;
        return PresetTypes.DamageDie(uint8(die) + 1);
    }
}
