// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAdapter} from "../../interfaces/IAdapter.sol";
import {SeedTypes} from "../../SeedTypes.sol";
import {SciFiWeaponSchema} from "../../schemas/SciFiWeaponSchema.sol";
import {FantasyWeaponSchema} from "../../schemas/FantasyWeaponSchema.sol";

/// @title  SciFiToFantasyWeaponAdapter
/// @notice Translates a Sci-Fi weapon into a Fantasy weapon. Neither
///         side is Cyberpunk, so weapon stats pass through unchanged
///         and only the element vocabulary is re-encoded
///         (plasma → fire, cryo → ice, etc.).
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

    function translate(
        uint256, /* tokenId */
        SeedTypes.CoreAttributes calldata sourceAttrs,
        bytes calldata extensionData
    ) external view returns (SeedTypes.CoreAttributes memory, bytes memory) {
        SciFiWeaponSchema.Ext memory src = abi.decode(extensionData, (SciFiWeaponSchema.Ext));

        FantasyWeaponSchema.Ext memory dst = FantasyWeaponSchema.Ext({
            damageDie: src.damageDie,
            attackBonus: src.attackBonus,
            damageBonus: src.damageBonus,
            element: FantasyWeaponSchema.Element(uint8(src.element))
        });

        SeedTypes.CoreAttributes memory translatedAttrs = SeedTypes.CoreAttributes({
            tier: sourceAttrs.tier,
            extensionSchemaId: targetSchemaId,
            metadataURI: sourceAttrs.metadataURI
        });

        return (translatedAttrs, abi.encode(dst));
    }

    function sourceElementLabel(uint8 element) external pure returns (string memory) {
        return SciFiWeaponSchema.label(SciFiWeaponSchema.Element(element));
    }

    function targetElementLabel(uint8 element) external pure returns (string memory) {
        return FantasyWeaponSchema.label(FantasyWeaponSchema.Element(element));
    }
}
