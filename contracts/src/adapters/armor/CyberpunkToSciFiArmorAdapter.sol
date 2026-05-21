// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAdapter} from "../../interfaces/IAdapter.sol";
import {SeedTypes} from "../../SeedTypes.sol";
import {CyberpunkArmorSchema} from "../../schemas/CyberpunkArmorSchema.sol";
import {SciFiArmorSchema} from "../../schemas/SciFiArmorSchema.sol";

/// @title  CyberpunkToSciFiArmorAdapter
/// @notice Translates Cyberpunk armor into Sci-Fi armor. Neither
///         side is Fantasy, so stats pass through unchanged and
///         only the resist vocabulary is re-encoded (incendiary →
///         plasma, cryogenic → cryo, etc.).
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

    function translate(
        uint256, /* tokenId */
        SeedTypes.CoreAttributes calldata sourceAttrs,
        bytes calldata extensionData
    ) external view returns (SeedTypes.CoreAttributes memory, bytes memory) {
        CyberpunkArmorSchema.Ext memory src = abi.decode(extensionData, (CyberpunkArmorSchema.Ext));

        SciFiArmorSchema.Ext memory dst = SciFiArmorSchema.Ext({
            acBonus: src.acBonus,
            hpBonus: src.hpBonus,
            resistElement: SciFiArmorSchema.Element(uint8(src.resistElement))
        });

        SeedTypes.CoreAttributes memory translatedAttrs = SeedTypes.CoreAttributes({
            tier: sourceAttrs.tier,
            extensionSchemaId: targetSchemaId,
            metadataURI: sourceAttrs.metadataURI
        });

        return (translatedAttrs, abi.encode(dst));
    }

    function sourceElementLabel(uint8 element) external pure returns (string memory) {
        return CyberpunkArmorSchema.label(CyberpunkArmorSchema.Element(element));
    }

    function targetElementLabel(uint8 element) external pure returns (string memory) {
        return SciFiArmorSchema.label(SciFiArmorSchema.Element(element));
    }
}
