// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAdapter} from "../../interfaces/IAdapter.sol";
import {SeedTypes} from "../../SeedTypes.sol";
import {DamageDie} from "../../DamageDie.sol";
import {FantasyWeaponSchema} from "../../schemas/FantasyWeaponSchema.sol";
import {CyberpunkWeaponSchema} from "../../schemas/CyberpunkWeaponSchema.sol";

/// @title  FantasyToCyberpunkWeaponAdapter
/// @notice Translates a Fantasy weapon into a Cyberpunk weapon. The
///         canonical "INTO Cyberpunk" rebalance applies (die stepDown,
///         +1 attack); per-source-type deltas below stack on top to
///         flavor each archetype crossing (Axe→Shotgun = -1 atk +2 dmg,
///         etc.).
contract FantasyToCyberpunkWeaponAdapter is IAdapter {
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

    /// @dev (atkDelta, dmgDelta) keyed by source FantasyWeaponSchema.WeaponType.
    ///      Stacks on top of the +1 atk / die stepDown base rebalance.
    function _typeDelta(uint8 sourceType) internal pure returns (int8, int8) {
        if (sourceType == uint8(FantasyWeaponSchema.WeaponType.Axe))    return (-1,  2); // → Shotgun
        if (sourceType == uint8(FantasyWeaponSchema.WeaponType.Dagger)) return ( 0,  0); // → Knife
        if (sourceType == uint8(FantasyWeaponSchema.WeaponType.Sword))  return ( 0,  1); // → Katana
        if (sourceType == uint8(FantasyWeaponSchema.WeaponType.Bow))    return ( 1,  0); // → SmartSMG
        if (sourceType == uint8(FantasyWeaponSchema.WeaponType.Staff))  return ( 1,  1); // → Monowire
        return (0, 0);
    }

    function translate(
        uint256, /* tokenId */
        SeedTypes.CoreAttributes calldata sourceAttrs,
        bytes calldata extensionData
    ) external view returns (SeedTypes.CoreAttributes memory, bytes memory) {
        FantasyWeaponSchema.Ext memory src = abi.decode(extensionData, (FantasyWeaponSchema.Ext));
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
        return FantasyWeaponSchema.elementLabel(FantasyWeaponSchema.Element(element));
    }

    function targetElementLabel(uint8 element) external pure returns (string memory) {
        return CyberpunkWeaponSchema.elementLabel(CyberpunkWeaponSchema.Element(element));
    }

    function sourceTypeLabel(uint8 weaponType) external pure returns (string memory) {
        return FantasyWeaponSchema.typeLabel(FantasyWeaponSchema.WeaponType(weaponType));
    }

    function targetTypeLabel(uint8 weaponType) external pure returns (string memory) {
        return CyberpunkWeaponSchema.typeLabel(CyberpunkWeaponSchema.WeaponType(weaponType));
    }

    function sourceName(uint8 weaponType, uint8 tier) external pure returns (string memory) {
        return FantasyWeaponSchema.name(
            FantasyWeaponSchema.WeaponType(weaponType),
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
