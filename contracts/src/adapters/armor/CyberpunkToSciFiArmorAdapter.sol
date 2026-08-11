// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAdapter} from "seed-protocol/interfaces/IAdapter.sol";
import {SeedTypes} from "seed-protocol/SeedTypes.sol";
import {CyberpunkArmorSchema} from "../../schemas/CyberpunkArmorSchema.sol";
import {SciFiArmorSchema} from "../../schemas/SciFiArmorSchema.sol";

/// @title  CyberpunkToSciFiArmorAdapter
/// @notice Translates Cyberpunk armor into Sci-Fi armor. Neither side
///         is Fantasy, so the base ladder passes through. Per-source-
///         type deltas mirror the SciFiToCyberpunk table so the round-
///         trip cancels.
contract CyberpunkToSciFiArmorAdapter is IAdapter {
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

    /// @dev (acDelta, hpDelta) keyed by source CyberpunkArmorSchema.ArmorType.
    function _typeDelta(uint8 sourceType) internal pure returns (int8, int8) {
        if (sourceType == uint8(CyberpunkArmorSchema.ArmorType.RiotFit)) return (-1,  0); // → ExoSuit
        if (sourceType == uint8(CyberpunkArmorSchema.ArmorType.Vest))    return ( 0,  0); // → Carapace
        if (sourceType == uint8(CyberpunkArmorSchema.ArmorType.Weave))   return ( 1, -1); // → Cloak
        return (0, 0);
    }

    function translate(
        uint256, /* tokenId */
        SeedTypes.CoreAttributes calldata sourceAttrs,
        bytes calldata extensionData
    ) external view returns (SeedTypes.CoreAttributes memory, bytes memory) {
        CyberpunkArmorSchema.Ext memory src = abi.decode(extensionData, (CyberpunkArmorSchema.Ext));
        (int8 acD, int8 hpD) = _typeDelta(uint8(src.armorType));

        SciFiArmorSchema.Ext memory dst = SciFiArmorSchema.Ext({
            acBonus: src.acBonus + acD,
            hpBonus: src.hpBonus + hpD,
            resistElement: SciFiArmorSchema.Element(uint8(src.resistElement)),
            armorType: SciFiArmorSchema.ArmorType(uint8(src.armorType))
        });

        SeedTypes.CoreAttributes memory translatedAttrs = SeedTypes.CoreAttributes({
            tier: sourceAttrs.tier,
            extensionSchemaId: targetSchemaId,
            metadataURI: sourceAttrs.metadataURI
        });

        return (translatedAttrs, abi.encode(dst));
    }

    function sourceElementLabel(uint8 element) external pure returns (string memory) {
        return CyberpunkArmorSchema.elementLabel(CyberpunkArmorSchema.Element(element));
    }

    function targetElementLabel(uint8 element) external pure returns (string memory) {
        return SciFiArmorSchema.elementLabel(SciFiArmorSchema.Element(element));
    }

    function sourceTypeLabel(uint8 armorType) external pure returns (string memory) {
        return CyberpunkArmorSchema.typeLabel(CyberpunkArmorSchema.ArmorType(armorType));
    }

    function targetTypeLabel(uint8 armorType) external pure returns (string memory) {
        return SciFiArmorSchema.typeLabel(SciFiArmorSchema.ArmorType(armorType));
    }

    function sourceName(uint8 armorType, uint8 tier) external pure returns (string memory) {
        return CyberpunkArmorSchema.name(
            CyberpunkArmorSchema.ArmorType(armorType),
            SeedTypes.Tier(tier)
        );
    }

    function targetName(uint8 armorType, uint8 tier) external pure returns (string memory) {
        return SciFiArmorSchema.name(
            SciFiArmorSchema.ArmorType(armorType),
            SeedTypes.Tier(tier)
        );
    }
}
