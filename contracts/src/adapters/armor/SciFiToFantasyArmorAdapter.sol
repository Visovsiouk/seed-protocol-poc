// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAdapter} from "seed-protocol/interfaces/IAdapter.sol";
import {SeedTypes} from "seed-protocol/SeedTypes.sol";
import {SciFiArmorSchema} from "../../schemas/SciFiArmorSchema.sol";
import {FantasyArmorSchema} from "../../schemas/FantasyArmorSchema.sol";

/// @title  SciFiToFantasyArmorAdapter
/// @notice Translates Sci-Fi armor into Fantasy armor. INTO Fantasy:
///         -1 AC, +5 HP. Per-source-type deltas mirror the
///         FantasyToSciFi table so the round-trip cancels.
contract SciFiToFantasyArmorAdapter is IAdapter {
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

    /// @dev (acDelta, hpDelta) keyed by source SciFiArmorSchema.ArmorType.
    function _typeDelta(uint8 sourceType) internal pure returns (int8, int8) {
        if (sourceType == uint8(SciFiArmorSchema.ArmorType.ExoSuit))  return (0, -1); // → Plate
        if (sourceType == uint8(SciFiArmorSchema.ArmorType.Carapace)) return (0,  0); // → Mail
        if (sourceType == uint8(SciFiArmorSchema.ArmorType.Cloak))    return (0,  1); // → Robe
        return (0, 0);
    }

    function translate(
        uint256, /* tokenId */
        SeedTypes.CoreAttributes calldata sourceAttrs,
        bytes calldata extensionData
    ) external view returns (SeedTypes.CoreAttributes memory, bytes memory) {
        SciFiArmorSchema.Ext memory src = abi.decode(extensionData, (SciFiArmorSchema.Ext));
        (int8 acD, int8 hpD) = _typeDelta(uint8(src.armorType));

        FantasyArmorSchema.Ext memory dst = FantasyArmorSchema.Ext({
            acBonus: src.acBonus - 1 + acD,
            hpBonus: src.hpBonus + 5 + hpD,
            resistElement: FantasyArmorSchema.Element(uint8(src.resistElement)),
            armorType: FantasyArmorSchema.ArmorType(uint8(src.armorType))
        });

        SeedTypes.CoreAttributes memory translatedAttrs = SeedTypes.CoreAttributes({
            tier: sourceAttrs.tier,
            extensionSchemaId: targetSchemaId,
            metadataURI: sourceAttrs.metadataURI
        });

        return (translatedAttrs, abi.encode(dst));
    }

    function sourceElementLabel(uint8 element) external pure returns (string memory) {
        return SciFiArmorSchema.elementLabel(SciFiArmorSchema.Element(element));
    }

    function targetElementLabel(uint8 element) external pure returns (string memory) {
        return FantasyArmorSchema.elementLabel(FantasyArmorSchema.Element(element));
    }

    function sourceTypeLabel(uint8 armorType) external pure returns (string memory) {
        return SciFiArmorSchema.typeLabel(SciFiArmorSchema.ArmorType(armorType));
    }

    function targetTypeLabel(uint8 armorType) external pure returns (string memory) {
        return FantasyArmorSchema.typeLabel(FantasyArmorSchema.ArmorType(armorType));
    }

    function sourceName(uint8 armorType, uint8 tier) external pure returns (string memory) {
        return SciFiArmorSchema.name(
            SciFiArmorSchema.ArmorType(armorType),
            SeedTypes.Tier(tier)
        );
    }

    function targetName(uint8 armorType, uint8 tier) external pure returns (string memory) {
        return FantasyArmorSchema.name(
            FantasyArmorSchema.ArmorType(armorType),
            SeedTypes.Tier(tier)
        );
    }
}
