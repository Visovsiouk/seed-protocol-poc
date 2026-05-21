// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAdapter} from "../../interfaces/IAdapter.sol";
import {SeedTypes} from "../../SeedTypes.sol";
import {DamageDie} from "../../DamageDie.sol";
import {SciFiWeaponSchema} from "../../schemas/SciFiWeaponSchema.sol";
import {CyberpunkWeaponSchema} from "../../schemas/CyberpunkWeaponSchema.sol";

/// @title  SciFiToCyberpunkWeaponAdapter
/// @notice Translates a Sci-Fi weapon into a Cyberpunk weapon. INTO
///         Cyberpunk: damage die steps down, attack bonus +1.
///         Element vocabulary re-encoded by index (plasma →
///         incendiary, cryo → cryogenic, etc.).
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

    function translate(
        uint256, /* tokenId */
        SeedTypes.CoreAttributes calldata sourceAttrs,
        bytes calldata extensionData
    ) external view returns (SeedTypes.CoreAttributes memory, bytes memory) {
        SciFiWeaponSchema.Ext memory src = abi.decode(extensionData, (SciFiWeaponSchema.Ext));

        CyberpunkWeaponSchema.Ext memory dst = CyberpunkWeaponSchema.Ext({
            damageDie: DamageDie.stepDown(src.damageDie),
            attackBonus: src.attackBonus + 1,
            damageBonus: src.damageBonus,
            element: CyberpunkWeaponSchema.Element(uint8(src.element))
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
        return CyberpunkWeaponSchema.label(CyberpunkWeaponSchema.Element(element));
    }
}
