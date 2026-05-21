// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {SeedTypes} from "../src/SeedTypes.sol";
import {FantasyArmorSchema} from "../src/schemas/FantasyArmorSchema.sol";
import {SciFiArmorSchema} from "../src/schemas/SciFiArmorSchema.sol";
import {CyberpunkArmorSchema} from "../src/schemas/CyberpunkArmorSchema.sol";
import {FantasyToSciFiArmorAdapter} from "../src/adapters/armor/FantasyToSciFiArmorAdapter.sol";
import {FantasyToCyberpunkArmorAdapter} from "../src/adapters/armor/FantasyToCyberpunkArmorAdapter.sol";
import {SciFiToFantasyArmorAdapter} from "../src/adapters/armor/SciFiToFantasyArmorAdapter.sol";
import {SciFiToCyberpunkArmorAdapter} from "../src/adapters/armor/SciFiToCyberpunkArmorAdapter.sol";
import {CyberpunkToFantasyArmorAdapter} from "../src/adapters/armor/CyberpunkToFantasyArmorAdapter.sol";
import {CyberpunkToSciFiArmorAdapter} from "../src/adapters/armor/CyberpunkToSciFiArmorAdapter.sol";

/// @title  ArmorAdaptersTest
/// @notice Mirrors `WeaponAdaptersTest` but for the armor variant.
///         Schema IDs: 102 = fantasy armor, 202 = scifi armor, 302 =
///         cyberpunk armor. Coverage:
///
///           - schemaMapping() returns the immutables.
///           - INTO Fantasy applies -1 AC, +5 HP.
///           - OUT of Fantasy applies +1 AC, -5 HP.
///           - SciFi ↔ Cyberpunk passes armor stats through unchanged.
///           - Resist re-encoding follows the PoC's index-identity rule.
///           - Resist-label vocabulary comes from the schema library.
///           - Tier + metadataURI pass through untouched.
///           - extensionSchemaId is rewritten to the target.
contract ArmorAdaptersTest is Test {
    uint256 constant FANTASY_ARMOR = 102;
    uint256 constant SCIFI_ARMOR = 202;
    uint256 constant CYBERPUNK_ARMOR = 302;

    FantasyToSciFiArmorAdapter fSci;
    FantasyToCyberpunkArmorAdapter fCyb;
    SciFiToFantasyArmorAdapter sciF;
    SciFiToCyberpunkArmorAdapter sciCyb;
    CyberpunkToFantasyArmorAdapter cybF;
    CyberpunkToSciFiArmorAdapter cybSci;

    function setUp() public {
        fSci = new FantasyToSciFiArmorAdapter(FANTASY_ARMOR, SCIFI_ARMOR);
        fCyb = new FantasyToCyberpunkArmorAdapter(FANTASY_ARMOR, CYBERPUNK_ARMOR);
        sciF = new SciFiToFantasyArmorAdapter(SCIFI_ARMOR, FANTASY_ARMOR);
        sciCyb = new SciFiToCyberpunkArmorAdapter(SCIFI_ARMOR, CYBERPUNK_ARMOR);
        cybF = new CyberpunkToFantasyArmorAdapter(CYBERPUNK_ARMOR, FANTASY_ARMOR);
        cybSci = new CyberpunkToSciFiArmorAdapter(CYBERPUNK_ARMOR, SCIFI_ARMOR);
    }

    function _attrs(SeedTypes.Tier tier, uint256 schemaId) internal pure returns (SeedTypes.CoreAttributes memory) {
        return SeedTypes.CoreAttributes({tier: tier, extensionSchemaId: schemaId, metadataURI: "ipfs://armor-test"});
    }

    function _fantasyExt(int8 ac, int8 hp, FantasyArmorSchema.Element resist)
        internal
        pure
        returns (FantasyArmorSchema.Ext memory)
    {
        return FantasyArmorSchema.Ext({acBonus: ac, hpBonus: hp, resistElement: resist});
    }

    function _scifiExt(int8 ac, int8 hp, SciFiArmorSchema.Element resist)
        internal
        pure
        returns (SciFiArmorSchema.Ext memory)
    {
        return SciFiArmorSchema.Ext({acBonus: ac, hpBonus: hp, resistElement: resist});
    }

    function _cybExt(int8 ac, int8 hp, CyberpunkArmorSchema.Element resist)
        internal
        pure
        returns (CyberpunkArmorSchema.Ext memory)
    {
        return CyberpunkArmorSchema.Ext({acBonus: ac, hpBonus: hp, resistElement: resist});
    }

    // --- schemaMapping --------------------------------------------------

    function test_schemaMapping_returnsImmutables() public view {
        (uint256 a, uint256 b) = fSci.schemaMapping();
        assertEq(a, FANTASY_ARMOR);
        assertEq(b, SCIFI_ARMOR);

        (a, b) = cybF.schemaMapping();
        assertEq(a, CYBERPUNK_ARMOR);
        assertEq(b, FANTASY_ARMOR);
    }

    // --- INTO Fantasy (-1 AC, +5 HP) -----------------------------------

    function test_sciFiToFantasy_appliesIntoFantasyRebalance() public view {
        SciFiArmorSchema.Ext memory src = _scifiExt(3, 5, SciFiArmorSchema.Element.Plasma);
        (SeedTypes.CoreAttributes memory attrs, bytes memory data) =
            sciF.translate(1, _attrs(SeedTypes.Tier.T2, SCIFI_ARMOR), abi.encode(src));
        FantasyArmorSchema.Ext memory dst = abi.decode(data, (FantasyArmorSchema.Ext));

        assertEq(dst.acBonus, 2);
        assertEq(dst.hpBonus, 10);
        assertTrue(dst.resistElement == FantasyArmorSchema.Element.Fire);
        assertEq(attrs.extensionSchemaId, FANTASY_ARMOR);
        assertEq(uint8(attrs.tier), uint8(SeedTypes.Tier.T2));
        assertEq(attrs.metadataURI, "ipfs://armor-test");
    }

    function test_cyberpunkToFantasy_appliesIntoFantasyRebalance() public view {
        CyberpunkArmorSchema.Ext memory src = _cybExt(2, 8, CyberpunkArmorSchema.Element.EMP);
        (, bytes memory data) =
            cybF.translate(1, _attrs(SeedTypes.Tier.T1, CYBERPUNK_ARMOR), abi.encode(src));
        FantasyArmorSchema.Ext memory dst = abi.decode(data, (FantasyArmorSchema.Ext));

        assertEq(dst.acBonus, 1);
        assertEq(dst.hpBonus, 13);
        assertTrue(dst.resistElement == FantasyArmorSchema.Element.Shock);
    }

    // --- OUT of Fantasy (+1 AC, -5 HP) ---------------------------------

    function test_fantasyToSciFi_appliesOutOfFantasyRebalance() public view {
        FantasyArmorSchema.Ext memory src = _fantasyExt(1, 10, FantasyArmorSchema.Element.Ice);
        (, bytes memory data) =
            fSci.translate(1, _attrs(SeedTypes.Tier.T1, FANTASY_ARMOR), abi.encode(src));
        SciFiArmorSchema.Ext memory dst = abi.decode(data, (SciFiArmorSchema.Ext));

        assertEq(dst.acBonus, 2);
        assertEq(dst.hpBonus, 5);
        assertTrue(dst.resistElement == SciFiArmorSchema.Element.Cryo);
    }

    function test_fantasyToCyberpunk_appliesOutOfFantasyRebalance() public view {
        FantasyArmorSchema.Ext memory src = _fantasyExt(0, 7, FantasyArmorSchema.Element.Unholy);
        (, bytes memory data) =
            fCyb.translate(1, _attrs(SeedTypes.Tier.T1, FANTASY_ARMOR), abi.encode(src));
        CyberpunkArmorSchema.Ext memory dst = abi.decode(data, (CyberpunkArmorSchema.Ext));

        assertEq(dst.acBonus, 1);
        assertEq(dst.hpBonus, 2);
        assertTrue(dst.resistElement == CyberpunkArmorSchema.Element.Nano);
    }

    // --- SciFi ↔ Cyberpunk (passthrough) -------------------------------

    function test_sciFiToCyberpunk_passesStatsThrough() public view {
        SciFiArmorSchema.Ext memory src = _scifiExt(3, 4, SciFiArmorSchema.Element.Ion);
        (, bytes memory data) =
            sciCyb.translate(1, _attrs(SeedTypes.Tier.T1, SCIFI_ARMOR), abi.encode(src));
        CyberpunkArmorSchema.Ext memory dst = abi.decode(data, (CyberpunkArmorSchema.Ext));

        assertEq(dst.acBonus, 3);
        assertEq(dst.hpBonus, 4);
        assertTrue(dst.resistElement == CyberpunkArmorSchema.Element.EMP);
    }

    function test_cyberpunkToSciFi_passesStatsThrough() public view {
        CyberpunkArmorSchema.Ext memory src = _cybExt(2, 6, CyberpunkArmorSchema.Element.Cryogenic);
        (, bytes memory data) =
            cybSci.translate(1, _attrs(SeedTypes.Tier.T1, CYBERPUNK_ARMOR), abi.encode(src));
        SciFiArmorSchema.Ext memory dst = abi.decode(data, (SciFiArmorSchema.Ext));

        assertEq(dst.acBonus, 2);
        assertEq(dst.hpBonus, 6);
        assertTrue(dst.resistElement == SciFiArmorSchema.Element.Cryo);
    }

    // --- Round-trip -----------------------------------------------------

    function test_fantasyToSciFiAndBack_preservesStats() public view {
        FantasyArmorSchema.Ext memory src = _fantasyExt(1, 6, FantasyArmorSchema.Element.Holy);
        (, bytes memory mid) =
            fSci.translate(1, _attrs(SeedTypes.Tier.T1, FANTASY_ARMOR), abi.encode(src));
        (, bytes memory back) =
            sciF.translate(1, _attrs(SeedTypes.Tier.T1, SCIFI_ARMOR), mid);
        FantasyArmorSchema.Ext memory rt = abi.decode(back, (FantasyArmorSchema.Ext));

        assertEq(rt.acBonus, src.acBonus);
        assertEq(rt.hpBonus, src.hpBonus);
        assertTrue(rt.resistElement == src.resistElement);
    }

    // --- Resist-element vocabulary -------------------------------------

    function test_elementLabel_armorVocab() public view {
        assertEq(fSci.sourceElementLabel(uint8(FantasyArmorSchema.Element.Fire)), "fire");
        assertEq(fSci.targetElementLabel(uint8(SciFiArmorSchema.Element.Plasma)), "plasma");
        assertEq(fCyb.targetElementLabel(uint8(CyberpunkArmorSchema.Element.Incendiary)), "incendiary");
        assertEq(cybSci.sourceElementLabel(uint8(CyberpunkArmorSchema.Element.Laser)), "laser");
        assertEq(cybSci.targetElementLabel(uint8(SciFiArmorSchema.Element.Photon)), "photon");
        assertEq(sciF.sourceElementLabel(0), "none");
    }
}
