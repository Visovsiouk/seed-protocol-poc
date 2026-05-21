// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAdapter} from "../../interfaces/IAdapter.sol";
import {SeedTypes} from "../../SeedTypes.sol";
import {FantasyWeaponSchema} from "../../schemas/FantasyWeaponSchema.sol";
import {SciFiWeaponSchema} from "../../schemas/SciFiWeaponSchema.sol";

/// @title  FantasyToSciFiWeaponAdapter
/// @notice Translates a Fantasy weapon into a Sci-Fi weapon. Neither
///         side is Cyberpunk, so the damage-die / attack-bonus
///         rebalance is a no-op here — stats pass through and only
///         the schema vocabulary changes (fire → plasma, ice → cryo,
///         etc.). Each schema names its own enum natively; the PoC's
///         1:1 element-index alignment is what lets us re-encode by
///         numeric value, but the *names* are not shared.
contract FantasyToSciFiWeaponAdapter is IAdapter {
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
        FantasyWeaponSchema.Ext memory src = abi.decode(extensionData, (FantasyWeaponSchema.Ext));

        SciFiWeaponSchema.Ext memory dst = SciFiWeaponSchema.Ext({
            damageDie: src.damageDie,
            attackBonus: src.attackBonus,
            damageBonus: src.damageBonus,
            element: SciFiWeaponSchema.Element(uint8(src.element))
        });

        SeedTypes.CoreAttributes memory translatedAttrs = SeedTypes.CoreAttributes({
            tier: sourceAttrs.tier,
            extensionSchemaId: targetSchemaId,
            metadataURI: sourceAttrs.metadataURI
        });

        return (translatedAttrs, abi.encode(dst));
    }

    function sourceElementLabel(uint8 element) external pure returns (string memory) {
        return FantasyWeaponSchema.label(FantasyWeaponSchema.Element(element));
    }

    function targetElementLabel(uint8 element) external pure returns (string memory) {
        return SciFiWeaponSchema.label(SciFiWeaponSchema.Element(element));
    }
}
