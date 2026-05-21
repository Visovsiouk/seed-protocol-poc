// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAdapter} from "../../interfaces/IAdapter.sol";
import {SeedTypes} from "../../SeedTypes.sol";
import {FantasyArmorSchema} from "../../schemas/FantasyArmorSchema.sol";
import {SciFiArmorSchema} from "../../schemas/SciFiArmorSchema.sol";

/// @title  FantasyToSciFiArmorAdapter
/// @notice Translates Fantasy armor into Sci-Fi armor. OUT of Fantasy
///         reverses the fantasy plate trade: +1 AC, -5 HP. Resist
///         vocabulary re-encoded by index (fire → plasma, ice →
///         cryo, etc.).
contract FantasyToSciFiArmorAdapter is IAdapter {
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
        FantasyArmorSchema.Ext memory src = abi.decode(extensionData, (FantasyArmorSchema.Ext));

        SciFiArmorSchema.Ext memory dst = SciFiArmorSchema.Ext({
            acBonus: src.acBonus + 1,
            hpBonus: src.hpBonus - 5,
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
        return FantasyArmorSchema.label(FantasyArmorSchema.Element(element));
    }

    function targetElementLabel(uint8 element) external pure returns (string memory) {
        return SciFiArmorSchema.label(SciFiArmorSchema.Element(element));
    }
}
