// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAdapter} from "seed-protocol/interfaces/IAdapter.sol";
import {SeedTypes} from "seed-protocol/SeedTypes.sol";
import {FantasyArmorSchema} from "../../schemas/FantasyArmorSchema.sol";
import {CyberpunkArmorSchema} from "../../schemas/CyberpunkArmorSchema.sol";

/// @title  FantasyToCyberpunkArmorAdapter
/// @notice Translates Fantasy armor into Cyberpunk armor. OUT of
///         Fantasy: +1 AC, -5 HP. Per-source-type deltas add small
///         archetype flavor on top.
contract FantasyToCyberpunkArmorAdapter is IAdapter {
    uint256 public immutable sourceSchemaId;
    uint256 public immutable targetSchemaId;

    string public constant slot = "armor";

    constructor(uint256 _sourceSchemaId, uint256 _targetSchemaId) {
        sourceSchemaId = _sourceSchemaId;
        targetSchemaId = _targetSchemaId;
    }

    function schemaMapping() external view returns (uint256, uint256) {
        return (sourceSchemaId, targetSchemaId);
    }

    /// @dev (acDelta, hpDelta) keyed by source FantasyArmorSchema.ArmorType.
    function _typeDelta(uint8 sourceType) internal pure returns (int8, int8) {
        if (sourceType == uint8(FantasyArmorSchema.ArmorType.Plate)) return ( 0,  1); // → RiotFit
        if (sourceType == uint8(FantasyArmorSchema.ArmorType.Mail))  return ( 0,  0); // → Vest
        if (sourceType == uint8(FantasyArmorSchema.ArmorType.Robe))  return (-1,  0); // → Weave
        return (0, 0);
    }

    function translate(
        uint256, /* tokenId */
        SeedTypes.CoreAttributes calldata sourceAttrs,
        bytes calldata extensionData
    ) external view returns (SeedTypes.CoreAttributes memory, bytes memory) {
        FantasyArmorSchema.Ext memory src = abi.decode(extensionData, (FantasyArmorSchema.Ext));
        (int8 acD, int8 hpD) = _typeDelta(uint8(src.armorType));

        CyberpunkArmorSchema.Ext memory dst = CyberpunkArmorSchema.Ext({
            acBonus: src.acBonus + 1 + acD,
            hpBonus: src.hpBonus - 5 + hpD,
            resistElement: CyberpunkArmorSchema.Element(uint8(src.resistElement)),
            armorType: CyberpunkArmorSchema.ArmorType(uint8(src.armorType))
        });

        SeedTypes.CoreAttributes memory translatedAttrs = SeedTypes.CoreAttributes({
            tier: sourceAttrs.tier,
            extensionSchemaId: targetSchemaId,
            metadataURI: sourceAttrs.metadataURI
        });

        return (translatedAttrs, abi.encode(dst));
    }

    function sourceElementLabel(uint8 element) external pure returns (string memory) {
        return FantasyArmorSchema.elementLabel(FantasyArmorSchema.Element(element));
    }

    function targetElementLabel(uint8 element) external pure returns (string memory) {
        return CyberpunkArmorSchema.elementLabel(CyberpunkArmorSchema.Element(element));
    }

    function sourceTypeLabel(uint8 armorType) external pure returns (string memory) {
        return FantasyArmorSchema.typeLabel(FantasyArmorSchema.ArmorType(armorType));
    }

    function targetTypeLabel(uint8 armorType) external pure returns (string memory) {
        return CyberpunkArmorSchema.typeLabel(CyberpunkArmorSchema.ArmorType(armorType));
    }

    function sourceName(uint8 armorType, uint8 tier) external pure returns (string memory) {
        return FantasyArmorSchema.name(
            FantasyArmorSchema.ArmorType(armorType),
            SeedTypes.Tier(tier)
        );
    }

    function targetName(uint8 armorType, uint8 tier) external pure returns (string memory) {
        return CyberpunkArmorSchema.name(
            CyberpunkArmorSchema.ArmorType(armorType),
            SeedTypes.Tier(tier)
        );
    }
}
