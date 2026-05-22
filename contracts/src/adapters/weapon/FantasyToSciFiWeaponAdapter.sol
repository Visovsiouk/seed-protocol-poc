// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAdapter} from "../../interfaces/IAdapter.sol";
import {SeedTypes} from "../../SeedTypes.sol";
import {FantasyWeaponSchema} from "../../schemas/FantasyWeaponSchema.sol";
import {SciFiWeaponSchema} from "../../schemas/SciFiWeaponSchema.sol";

/// @title  FantasyToSciFiWeaponAdapter
/// @notice Translates a Fantasy weapon into a Sci-Fi weapon. This
///         direction is a passthrough on the die/attack ladder
///         (Fantasy ↔ Sci-Fi sit on the same rebalance lane); the only
///         deltas come from the per-source-type table below, which
///         flavors how each weapon archetype "feels" after the
///         re-encoding. The archetype index (1=heavy..5=exotic) maps
///         identity to identity here.
contract FantasyToSciFiWeaponAdapter is IAdapter {
    uint256 public immutable sourceSchemaId;
    uint256 public immutable targetSchemaId;

    string public constant slot = "weapon";

    constructor(uint256 _sourceSchemaId, uint256 _targetSchemaId) {
        sourceSchemaId = _sourceSchemaId;
        targetSchemaId = _targetSchemaId;
    }

    function schemaMapping() external view returns (uint256, uint256) {
        return (sourceSchemaId, targetSchemaId);
    }

    /// @dev (atkDelta, dmgDelta) keyed by source FantasyWeaponSchema.WeaponType
    ///      index (1..5). None=0 contributes nothing.
    function _typeDelta(uint8 sourceType) internal pure returns (int8, int8) {
        if (sourceType == uint8(FantasyWeaponSchema.WeaponType.Axe))    return (-1,  2); // → Cannon
        if (sourceType == uint8(FantasyWeaponSchema.WeaponType.Dagger)) return ( 1,  0); // → Pistol
        if (sourceType == uint8(FantasyWeaponSchema.WeaponType.Sword))  return ( 0,  1); // → Rifle
        if (sourceType == uint8(FantasyWeaponSchema.WeaponType.Bow))    return ( 1,  0); // → Beam
        if (sourceType == uint8(FantasyWeaponSchema.WeaponType.Staff))  return (-2,  2); // → Railgun
        return (0, 0);
    }

    function translate(
        uint256, /* tokenId */
        SeedTypes.CoreAttributes calldata sourceAttrs,
        bytes calldata extensionData
    ) external view returns (SeedTypes.CoreAttributes memory, bytes memory) {
        FantasyWeaponSchema.Ext memory src = abi.decode(extensionData, (FantasyWeaponSchema.Ext));
        (int8 atkD, int8 dmgD) = _typeDelta(uint8(src.weaponType));

        SciFiWeaponSchema.Ext memory dst = SciFiWeaponSchema.Ext({
            damageDie: src.damageDie,
            attackBonus: src.attackBonus + atkD,
            damageBonus: src.damageBonus + dmgD,
            element: SciFiWeaponSchema.Element(uint8(src.element)),
            weaponType: SciFiWeaponSchema.WeaponType(uint8(src.weaponType))
        });

        SeedTypes.CoreAttributes memory translatedAttrs = SeedTypes.CoreAttributes({
            tier: sourceAttrs.tier,
            extensionSchemaId: targetSchemaId,
            metadataURI: sourceAttrs.metadataURI
        });

        return (translatedAttrs, abi.encode(dst));
    }

    function sourceElementLabel(uint8 element) external pure returns (string memory) {
        return FantasyWeaponSchema.elementLabel(FantasyWeaponSchema.Element(element));
    }

    function targetElementLabel(uint8 element) external pure returns (string memory) {
        return SciFiWeaponSchema.elementLabel(SciFiWeaponSchema.Element(element));
    }

    function sourceTypeLabel(uint8 weaponType) external pure returns (string memory) {
        return FantasyWeaponSchema.typeLabel(FantasyWeaponSchema.WeaponType(weaponType));
    }

    function targetTypeLabel(uint8 weaponType) external pure returns (string memory) {
        return SciFiWeaponSchema.typeLabel(SciFiWeaponSchema.WeaponType(weaponType));
    }

    function sourceName(uint8 weaponType, uint8 tier) external pure returns (string memory) {
        return FantasyWeaponSchema.name(
            FantasyWeaponSchema.WeaponType(weaponType),
            SeedTypes.Tier(tier)
        );
    }

    function targetName(uint8 weaponType, uint8 tier) external pure returns (string memory) {
        return SciFiWeaponSchema.name(
            SciFiWeaponSchema.WeaponType(weaponType),
            SeedTypes.Tier(tier)
        );
    }
}
