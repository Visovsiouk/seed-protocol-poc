// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAdapter} from "seed-protocol/interfaces/IAdapter.sol";
import {SeedTypes} from "seed-protocol/SeedTypes.sol";
import {SciFiWeaponSchema} from "../../schemas/SciFiWeaponSchema.sol";
import {FantasyWeaponSchema} from "../../schemas/FantasyWeaponSchema.sol";

/// @title  SciFiToFantasyWeaponAdapter
/// @notice Translates a Sci-Fi weapon into a Fantasy weapon. The
///         die/attack ladder passes through (Fantasy ↔ Sci-Fi share a
///         lane); per-source-type deltas below give each archetype a
///         distinct "feel" after the re-encoding. Inverse of
///         FantasyToSciFi, so the round-trip cancels.
contract SciFiToFantasyWeaponAdapter is IAdapter {
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

    /// @dev (atkDelta, dmgDelta) keyed by source SciFiWeaponSchema.WeaponType.
    function _typeDelta(uint8 sourceType) internal pure returns (int8, int8) {
        if (sourceType == uint8(SciFiWeaponSchema.WeaponType.Cannon))  return ( 1, -2); // → Axe
        if (sourceType == uint8(SciFiWeaponSchema.WeaponType.Pistol))  return (-1,  0); // → Dagger
        if (sourceType == uint8(SciFiWeaponSchema.WeaponType.Rifle))   return ( 0, -1); // → Sword
        if (sourceType == uint8(SciFiWeaponSchema.WeaponType.Beam))    return (-1,  0); // → Bow
        if (sourceType == uint8(SciFiWeaponSchema.WeaponType.Railgun)) return ( 2, -2); // → Staff
        return (0, 0);
    }

    function translate(
        uint256, /* tokenId */
        SeedTypes.CoreAttributes calldata sourceAttrs,
        bytes calldata extensionData
    ) external view returns (SeedTypes.CoreAttributes memory, bytes memory) {
        SciFiWeaponSchema.Ext memory src = abi.decode(extensionData, (SciFiWeaponSchema.Ext));
        (int8 atkD, int8 dmgD) = _typeDelta(uint8(src.weaponType));

        FantasyWeaponSchema.Ext memory dst = FantasyWeaponSchema.Ext({
            damageDie: src.damageDie,
            attackBonus: src.attackBonus + atkD,
            damageBonus: src.damageBonus + dmgD,
            element: FantasyWeaponSchema.Element(uint8(src.element)),
            weaponType: FantasyWeaponSchema.WeaponType(uint8(src.weaponType))
        });

        SeedTypes.CoreAttributes memory translatedAttrs = SeedTypes.CoreAttributes({
            tier: sourceAttrs.tier,
            extensionSchemaId: targetSchemaId,
            metadataURI: sourceAttrs.metadataURI
        });

        return (translatedAttrs, abi.encode(dst));
    }

    function sourceElementLabel(uint8 element) external pure returns (string memory) {
        return SciFiWeaponSchema.elementLabel(SciFiWeaponSchema.Element(element));
    }

    function targetElementLabel(uint8 element) external pure returns (string memory) {
        return FantasyWeaponSchema.elementLabel(FantasyWeaponSchema.Element(element));
    }

    function sourceTypeLabel(uint8 weaponType) external pure returns (string memory) {
        return SciFiWeaponSchema.typeLabel(SciFiWeaponSchema.WeaponType(weaponType));
    }

    function targetTypeLabel(uint8 weaponType) external pure returns (string memory) {
        return FantasyWeaponSchema.typeLabel(FantasyWeaponSchema.WeaponType(weaponType));
    }

    function sourceName(uint8 weaponType, uint8 tier) external pure returns (string memory) {
        return SciFiWeaponSchema.name(
            SciFiWeaponSchema.WeaponType(weaponType),
            SeedTypes.Tier(tier)
        );
    }

    function targetName(uint8 weaponType, uint8 tier) external pure returns (string memory) {
        return FantasyWeaponSchema.name(
            FantasyWeaponSchema.WeaponType(weaponType),
            SeedTypes.Tier(tier)
        );
    }
}
