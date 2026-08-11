// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAdapter} from "seed-protocol/interfaces/IAdapter.sol";
import {SeedTypes} from "seed-protocol/SeedTypes.sol";
import {DamageDie} from "../../DamageDie.sol";
import {SciFiWeaponSchema} from "../../schemas/SciFiWeaponSchema.sol";
import {CyberpunkWeaponSchema} from "../../schemas/CyberpunkWeaponSchema.sol";

/// @title  SciFiToCyberpunkWeaponAdapter
/// @notice Translates a Sci-Fi weapon into a Cyberpunk weapon. INTO
///         Cyberpunk: damage die stepDown, +1 attack. Per-source-type
///         deltas below add small archetype flavor on top.
contract SciFiToCyberpunkWeaponAdapter is IAdapter {
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
    ///      Stacks on the +1 atk / die stepDown base rebalance.
    function _typeDelta(uint8 sourceType) internal pure returns (int8, int8) {
        if (sourceType == uint8(SciFiWeaponSchema.WeaponType.Cannon))  return ( 0,  1); // → Shotgun
        if (sourceType == uint8(SciFiWeaponSchema.WeaponType.Pistol))  return ( 0,  0); // → Knife
        if (sourceType == uint8(SciFiWeaponSchema.WeaponType.Rifle))   return ( 1,  0); // → Katana
        if (sourceType == uint8(SciFiWeaponSchema.WeaponType.Beam))    return ( 1,  0); // → SmartSMG
        if (sourceType == uint8(SciFiWeaponSchema.WeaponType.Railgun)) return ( 0,  1); // → Monowire
        return (0, 0);
    }

    function translate(
        uint256, /* tokenId */
        SeedTypes.CoreAttributes calldata sourceAttrs,
        bytes calldata extensionData
    ) external view returns (SeedTypes.CoreAttributes memory, bytes memory) {
        SciFiWeaponSchema.Ext memory src = abi.decode(extensionData, (SciFiWeaponSchema.Ext));
        (int8 atkD, int8 dmgD) = _typeDelta(uint8(src.weaponType));

        CyberpunkWeaponSchema.Ext memory dst = CyberpunkWeaponSchema.Ext({
            damageDie: DamageDie.stepDown(src.damageDie),
            attackBonus: src.attackBonus + 1 + atkD,
            damageBonus: src.damageBonus + dmgD,
            element: CyberpunkWeaponSchema.Element(uint8(src.element)),
            weaponType: CyberpunkWeaponSchema.WeaponType(uint8(src.weaponType))
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
        return CyberpunkWeaponSchema.elementLabel(CyberpunkWeaponSchema.Element(element));
    }

    function sourceTypeLabel(uint8 weaponType) external pure returns (string memory) {
        return SciFiWeaponSchema.typeLabel(SciFiWeaponSchema.WeaponType(weaponType));
    }

    function targetTypeLabel(uint8 weaponType) external pure returns (string memory) {
        return CyberpunkWeaponSchema.typeLabel(CyberpunkWeaponSchema.WeaponType(weaponType));
    }

    function sourceName(uint8 weaponType, uint8 tier) external pure returns (string memory) {
        return SciFiWeaponSchema.name(
            SciFiWeaponSchema.WeaponType(weaponType),
            SeedTypes.Tier(tier)
        );
    }

    function targetName(uint8 weaponType, uint8 tier) external pure returns (string memory) {
        return CyberpunkWeaponSchema.name(
            CyberpunkWeaponSchema.WeaponType(weaponType),
            SeedTypes.Tier(tier)
        );
    }
}
