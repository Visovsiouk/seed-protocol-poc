// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAdapter} from "../../interfaces/IAdapter.sol";
import {SeedTypes} from "../../SeedTypes.sol";
import {DamageDie} from "../../DamageDie.sol";
import {CyberpunkWeaponSchema} from "../../schemas/CyberpunkWeaponSchema.sol";
import {FantasyWeaponSchema} from "../../schemas/FantasyWeaponSchema.sol";

/// @title  CyberpunkToFantasyWeaponAdapter
/// @notice Translates a Cyberpunk weapon into a Fantasy weapon. OUT of
///         Cyberpunk reverses the INTO rebalance (die stepUp, -1
///         attack); per-source-type deltas below mirror the
///         FantasyToCyberpunk table so the round-trip cancels.
contract CyberpunkToFantasyWeaponAdapter is IAdapter {
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

    /// @dev (atkDelta, dmgDelta) keyed by source CyberpunkWeaponSchema.WeaponType.
    ///      Stacks on top of the -1 atk / die stepUp base rebalance.
    function _typeDelta(uint8 sourceType) internal pure returns (int8, int8) {
        if (sourceType == uint8(CyberpunkWeaponSchema.WeaponType.Shotgun))  return ( 1, -2); // → Axe
        if (sourceType == uint8(CyberpunkWeaponSchema.WeaponType.Knife))    return ( 0,  0); // → Dagger
        if (sourceType == uint8(CyberpunkWeaponSchema.WeaponType.Katana))   return ( 0, -1); // → Sword
        if (sourceType == uint8(CyberpunkWeaponSchema.WeaponType.SmartSMG)) return (-1,  0); // → Bow
        if (sourceType == uint8(CyberpunkWeaponSchema.WeaponType.Monowire)) return (-1, -1); // → Staff
        return (0, 0);
    }

    function translate(
        uint256, /* tokenId */
        SeedTypes.CoreAttributes calldata sourceAttrs,
        bytes calldata extensionData
    ) external view returns (SeedTypes.CoreAttributes memory, bytes memory) {
        CyberpunkWeaponSchema.Ext memory src = abi.decode(extensionData, (CyberpunkWeaponSchema.Ext));
        (int8 atkD, int8 dmgD) = _typeDelta(uint8(src.weaponType));

        FantasyWeaponSchema.Ext memory dst = FantasyWeaponSchema.Ext({
            damageDie: DamageDie.stepUp(src.damageDie),
            attackBonus: src.attackBonus - 1 + atkD,
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
        return CyberpunkWeaponSchema.elementLabel(CyberpunkWeaponSchema.Element(element));
    }

    function targetElementLabel(uint8 element) external pure returns (string memory) {
        return FantasyWeaponSchema.elementLabel(FantasyWeaponSchema.Element(element));
    }

    function sourceTypeLabel(uint8 weaponType) external pure returns (string memory) {
        return CyberpunkWeaponSchema.typeLabel(CyberpunkWeaponSchema.WeaponType(weaponType));
    }

    function targetTypeLabel(uint8 weaponType) external pure returns (string memory) {
        return FantasyWeaponSchema.typeLabel(FantasyWeaponSchema.WeaponType(weaponType));
    }

    function sourceName(uint8 weaponType, uint8 tier) external pure returns (string memory) {
        return CyberpunkWeaponSchema.name(
            CyberpunkWeaponSchema.WeaponType(weaponType),
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
