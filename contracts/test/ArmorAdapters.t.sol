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
/// @notice Mirrors `WeaponAdaptersTest` for the armor variant.
///         Schema IDs: 102 = fantasy armor, 202 = scifi armor, 302 =
///         cyberpunk armor. Coverage:
///
///           - schemaMapping() returns the immutables.
///           - INTO Fantasy applies -1 AC, +5 HP (base rebalance).
///           - OUT of Fantasy applies +1 AC, -5 HP (base rebalance).
///           - SciFi ↔ Cyberpunk passes armor stats through unchanged
///             (when armorType = None).
///           - Per-(adapter, sourceType) deltas stack on top of the
///             base rebalance for non-None armor types.
///           - Round-trips with non-None armor types cancel.
///           - Index-identity passthrough for armorType + resistElement.
///           - sourceTypeLabel / targetTypeLabel surface the per-schema
///             vocabulary.
///           - sourceName / targetName resolve the tier-scaled name
///             ladder from the schema library.
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

    function _attrs(SeedTypes.Tier tier, uint256 schemaId)
        internal
        pure
        returns (SeedTypes.CoreAttributes memory)
    {
        return SeedTypes.CoreAttributes({tier: tier, extensionSchemaId: schemaId, metadataURI: "ipfs://armor-test"});
    }

    function _fantasyExt(
        int8 ac,
        int8 hp,
        FantasyArmorSchema.Element resist,
        FantasyArmorSchema.ArmorType aType
    ) internal pure returns (FantasyArmorSchema.Ext memory) {
        return FantasyArmorSchema.Ext({acBonus: ac, hpBonus: hp, resistElement: resist, armorType: aType});
    }

    function _scifiExt(
        int8 ac,
        int8 hp,
        SciFiArmorSchema.Element resist,
        SciFiArmorSchema.ArmorType aType
    ) internal pure returns (SciFiArmorSchema.Ext memory) {
        return SciFiArmorSchema.Ext({acBonus: ac, hpBonus: hp, resistElement: resist, armorType: aType});
    }

    function _cybExt(
        int8 ac,
        int8 hp,
        CyberpunkArmorSchema.Element resist,
        CyberpunkArmorSchema.ArmorType aType
    ) internal pure returns (CyberpunkArmorSchema.Ext memory) {
        return CyberpunkArmorSchema.Ext({acBonus: ac, hpBonus: hp, resistElement: resist, armorType: aType});
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

    // --- INTO Fantasy (-1 AC, +5 HP base, ArmorType.None) -------------

    function test_sciFiToFantasy_appliesIntoFantasyRebalance_typeNone() public view {
        SciFiArmorSchema.Ext memory src =
            _scifiExt(3, 5, SciFiArmorSchema.Element.Plasma, SciFiArmorSchema.ArmorType.None);
        (SeedTypes.CoreAttributes memory attrs, bytes memory data) =
            sciF.translate(1, _attrs(SeedTypes.Tier.T2, SCIFI_ARMOR), abi.encode(src));
        FantasyArmorSchema.Ext memory dst = abi.decode(data, (FantasyArmorSchema.Ext));

        assertEq(dst.acBonus, 2);
        assertEq(dst.hpBonus, 10);
        assertTrue(dst.resistElement == FantasyArmorSchema.Element.Fire);
        assertTrue(dst.armorType == FantasyArmorSchema.ArmorType.None);
        assertEq(attrs.extensionSchemaId, FANTASY_ARMOR);
        assertEq(uint8(attrs.tier), uint8(SeedTypes.Tier.T2));
        assertEq(attrs.metadataURI, "ipfs://armor-test");
    }

    function test_cyberpunkToFantasy_appliesIntoFantasyRebalance_typeNone() public view {
        CyberpunkArmorSchema.Ext memory src =
            _cybExt(2, 8, CyberpunkArmorSchema.Element.EMP, CyberpunkArmorSchema.ArmorType.None);
        (, bytes memory data) =
            cybF.translate(1, _attrs(SeedTypes.Tier.T1, CYBERPUNK_ARMOR), abi.encode(src));
        FantasyArmorSchema.Ext memory dst = abi.decode(data, (FantasyArmorSchema.Ext));

        assertEq(dst.acBonus, 1);
        assertEq(dst.hpBonus, 13);
        assertTrue(dst.resistElement == FantasyArmorSchema.Element.Shock);
        assertTrue(dst.armorType == FantasyArmorSchema.ArmorType.None);
    }

    // --- OUT of Fantasy (+1 AC, -5 HP base, ArmorType.None) -----------

    function test_fantasyToSciFi_appliesOutOfFantasyRebalance_typeNone() public view {
        FantasyArmorSchema.Ext memory src =
            _fantasyExt(1, 10, FantasyArmorSchema.Element.Ice, FantasyArmorSchema.ArmorType.None);
        (, bytes memory data) =
            fSci.translate(1, _attrs(SeedTypes.Tier.T1, FANTASY_ARMOR), abi.encode(src));
        SciFiArmorSchema.Ext memory dst = abi.decode(data, (SciFiArmorSchema.Ext));

        assertEq(dst.acBonus, 2);
        assertEq(dst.hpBonus, 5);
        assertTrue(dst.resistElement == SciFiArmorSchema.Element.Cryo);
        assertTrue(dst.armorType == SciFiArmorSchema.ArmorType.None);
    }

    function test_fantasyToCyberpunk_appliesOutOfFantasyRebalance_typeNone() public view {
        FantasyArmorSchema.Ext memory src =
            _fantasyExt(0, 7, FantasyArmorSchema.Element.Unholy, FantasyArmorSchema.ArmorType.None);
        (, bytes memory data) =
            fCyb.translate(1, _attrs(SeedTypes.Tier.T1, FANTASY_ARMOR), abi.encode(src));
        CyberpunkArmorSchema.Ext memory dst = abi.decode(data, (CyberpunkArmorSchema.Ext));

        assertEq(dst.acBonus, 1);
        assertEq(dst.hpBonus, 2);
        assertTrue(dst.resistElement == CyberpunkArmorSchema.Element.Nano);
        assertTrue(dst.armorType == CyberpunkArmorSchema.ArmorType.None);
    }

    // --- SciFi ↔ Cyberpunk (passthrough, ArmorType.None) ---------------

    function test_sciFiToCyberpunk_passesStatsThrough_typeNone() public view {
        SciFiArmorSchema.Ext memory src =
            _scifiExt(3, 4, SciFiArmorSchema.Element.Ion, SciFiArmorSchema.ArmorType.None);
        (, bytes memory data) =
            sciCyb.translate(1, _attrs(SeedTypes.Tier.T1, SCIFI_ARMOR), abi.encode(src));
        CyberpunkArmorSchema.Ext memory dst = abi.decode(data, (CyberpunkArmorSchema.Ext));

        assertEq(dst.acBonus, 3);
        assertEq(dst.hpBonus, 4);
        assertTrue(dst.resistElement == CyberpunkArmorSchema.Element.EMP);
        assertTrue(dst.armorType == CyberpunkArmorSchema.ArmorType.None);
    }

    function test_cyberpunkToSciFi_passesStatsThrough_typeNone() public view {
        CyberpunkArmorSchema.Ext memory src =
            _cybExt(2, 6, CyberpunkArmorSchema.Element.Cryogenic, CyberpunkArmorSchema.ArmorType.None);
        (, bytes memory data) =
            cybSci.translate(1, _attrs(SeedTypes.Tier.T1, CYBERPUNK_ARMOR), abi.encode(src));
        SciFiArmorSchema.Ext memory dst = abi.decode(data, (SciFiArmorSchema.Ext));

        assertEq(dst.acBonus, 2);
        assertEq(dst.hpBonus, 6);
        assertTrue(dst.resistElement == SciFiArmorSchema.Element.Cryo);
        assertTrue(dst.armorType == SciFiArmorSchema.ArmorType.None);
    }

    // --- Per-(adapter, sourceType) delta stacking ---------------------

    /// @dev FantasyToSciFi Plate→ExoSuit: base (+1, -5) + delta (0, +1) = (+1, -4).
    function test_fantasyToSciFi_plate_stacksDelta() public view {
        FantasyArmorSchema.Ext memory src =
            _fantasyExt(0, 0, FantasyArmorSchema.Element.None, FantasyArmorSchema.ArmorType.Plate);
        (, bytes memory data) =
            fSci.translate(1, _attrs(SeedTypes.Tier.T1, FANTASY_ARMOR), abi.encode(src));
        SciFiArmorSchema.Ext memory dst = abi.decode(data, (SciFiArmorSchema.Ext));

        assertEq(dst.acBonus, 1);
        assertEq(dst.hpBonus, -4);
        assertTrue(dst.armorType == SciFiArmorSchema.ArmorType.ExoSuit);
    }

    /// @dev FantasyToSciFi Robe→Cloak: base (+1, -5) + delta (0, -1) = (+1, -6).
    function test_fantasyToSciFi_robe_stacksDelta() public view {
        FantasyArmorSchema.Ext memory src =
            _fantasyExt(0, 0, FantasyArmorSchema.Element.None, FantasyArmorSchema.ArmorType.Robe);
        (, bytes memory data) =
            fSci.translate(1, _attrs(SeedTypes.Tier.T1, FANTASY_ARMOR), abi.encode(src));
        SciFiArmorSchema.Ext memory dst = abi.decode(data, (SciFiArmorSchema.Ext));

        assertEq(dst.acBonus, 1);
        assertEq(dst.hpBonus, -6);
        assertTrue(dst.armorType == SciFiArmorSchema.ArmorType.Cloak);
    }

    /// @dev FantasyToCyberpunk Robe→Weave: base (+1, -5) + delta (-1, 0) = (0, -5).
    function test_fantasyToCyberpunk_robe_stacksDelta() public view {
        FantasyArmorSchema.Ext memory src =
            _fantasyExt(0, 0, FantasyArmorSchema.Element.None, FantasyArmorSchema.ArmorType.Robe);
        (, bytes memory data) =
            fCyb.translate(1, _attrs(SeedTypes.Tier.T1, FANTASY_ARMOR), abi.encode(src));
        CyberpunkArmorSchema.Ext memory dst = abi.decode(data, (CyberpunkArmorSchema.Ext));

        assertEq(dst.acBonus, 0);
        assertEq(dst.hpBonus, -5);
        assertTrue(dst.armorType == CyberpunkArmorSchema.ArmorType.Weave);
    }

    /// @dev CyberpunkToFantasy Weave→Robe: base (-1, +5) + delta (1, 0) = (0, +5).
    function test_cyberpunkToFantasy_weave_stacksDelta() public view {
        CyberpunkArmorSchema.Ext memory src =
            _cybExt(0, 0, CyberpunkArmorSchema.Element.None, CyberpunkArmorSchema.ArmorType.Weave);
        (, bytes memory data) =
            cybF.translate(1, _attrs(SeedTypes.Tier.T1, CYBERPUNK_ARMOR), abi.encode(src));
        FantasyArmorSchema.Ext memory dst = abi.decode(data, (FantasyArmorSchema.Ext));

        assertEq(dst.acBonus, 0);
        assertEq(dst.hpBonus, 5);
        assertTrue(dst.armorType == FantasyArmorSchema.ArmorType.Robe);
    }

    /// @dev SciFiToCyberpunk Cloak→Weave: base (0, 0) + delta (-1, +1) = (-1, +1).
    function test_sciFiToCyberpunk_cloak_stacksDelta() public view {
        SciFiArmorSchema.Ext memory src =
            _scifiExt(0, 0, SciFiArmorSchema.Element.None, SciFiArmorSchema.ArmorType.Cloak);
        (, bytes memory data) =
            sciCyb.translate(1, _attrs(SeedTypes.Tier.T1, SCIFI_ARMOR), abi.encode(src));
        CyberpunkArmorSchema.Ext memory dst = abi.decode(data, (CyberpunkArmorSchema.Ext));

        assertEq(dst.acBonus, -1);
        assertEq(dst.hpBonus, 1);
        assertTrue(dst.armorType == CyberpunkArmorSchema.ArmorType.Weave);
    }

    /// @dev CyberpunkToSciFi Weave→Cloak: base (0, 0) + delta (1, -1) = (+1, -1).
    function test_cyberpunkToSciFi_weave_stacksDelta() public view {
        CyberpunkArmorSchema.Ext memory src =
            _cybExt(0, 0, CyberpunkArmorSchema.Element.None, CyberpunkArmorSchema.ArmorType.Weave);
        (, bytes memory data) =
            cybSci.translate(1, _attrs(SeedTypes.Tier.T1, CYBERPUNK_ARMOR), abi.encode(src));
        SciFiArmorSchema.Ext memory dst = abi.decode(data, (SciFiArmorSchema.Ext));

        assertEq(dst.acBonus, 1);
        assertEq(dst.hpBonus, -1);
        assertTrue(dst.armorType == SciFiArmorSchema.ArmorType.Cloak);
    }

    // --- Round-trip cancellation (non-None armor types) ---------------

    function test_fantasyToSciFiAndBack_typedRoundTripCancels() public view {
        FantasyArmorSchema.Ext memory src =
            _fantasyExt(1, 6, FantasyArmorSchema.Element.Holy, FantasyArmorSchema.ArmorType.Plate);
        (, bytes memory mid) =
            fSci.translate(1, _attrs(SeedTypes.Tier.T1, FANTASY_ARMOR), abi.encode(src));
        (, bytes memory back) =
            sciF.translate(1, _attrs(SeedTypes.Tier.T1, SCIFI_ARMOR), mid);
        FantasyArmorSchema.Ext memory rt = abi.decode(back, (FantasyArmorSchema.Ext));

        assertEq(rt.acBonus, src.acBonus);
        assertEq(rt.hpBonus, src.hpBonus);
        assertTrue(rt.resistElement == src.resistElement);
        assertTrue(rt.armorType == src.armorType);
    }

    function test_fantasyToCyberpunkAndBack_typedRoundTripCancels() public view {
        FantasyArmorSchema.Ext memory src =
            _fantasyExt(2, 4, FantasyArmorSchema.Element.Ice, FantasyArmorSchema.ArmorType.Robe);
        (, bytes memory mid) =
            fCyb.translate(1, _attrs(SeedTypes.Tier.T1, FANTASY_ARMOR), abi.encode(src));
        (, bytes memory back) =
            cybF.translate(1, _attrs(SeedTypes.Tier.T1, CYBERPUNK_ARMOR), mid);
        FantasyArmorSchema.Ext memory rt = abi.decode(back, (FantasyArmorSchema.Ext));

        assertEq(rt.acBonus, src.acBonus);
        assertEq(rt.hpBonus, src.hpBonus);
        assertTrue(rt.resistElement == src.resistElement);
        assertTrue(rt.armorType == src.armorType);
    }

    function test_sciFiToCyberpunkAndBack_typedRoundTripCancels() public view {
        SciFiArmorSchema.Ext memory src =
            _scifiExt(0, 3, SciFiArmorSchema.Element.Void, SciFiArmorSchema.ArmorType.Cloak);
        (, bytes memory mid) =
            sciCyb.translate(1, _attrs(SeedTypes.Tier.T1, SCIFI_ARMOR), abi.encode(src));
        (, bytes memory back) =
            cybSci.translate(1, _attrs(SeedTypes.Tier.T1, CYBERPUNK_ARMOR), mid);
        SciFiArmorSchema.Ext memory rt = abi.decode(back, (SciFiArmorSchema.Ext));

        assertEq(rt.acBonus, src.acBonus);
        assertEq(rt.hpBonus, src.hpBonus);
        assertTrue(rt.resistElement == src.resistElement);
        assertTrue(rt.armorType == src.armorType);
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

    // --- Type-label vocabulary -----------------------------------------

    function test_typeLabel_armorVocab() public view {
        assertEq(fSci.sourceTypeLabel(uint8(FantasyArmorSchema.ArmorType.Plate)), "plate");
        assertEq(fSci.targetTypeLabel(uint8(SciFiArmorSchema.ArmorType.ExoSuit)), "exosuit");
        assertEq(fCyb.targetTypeLabel(uint8(CyberpunkArmorSchema.ArmorType.RiotFit)), "riotfit");
        assertEq(cybSci.sourceTypeLabel(uint8(CyberpunkArmorSchema.ArmorType.Weave)), "weave");
        assertEq(cybSci.targetTypeLabel(uint8(SciFiArmorSchema.ArmorType.Cloak)), "cloak");
        assertEq(sciF.sourceTypeLabel(0), "none");
        assertEq(sciF.targetTypeLabel(0), "none");
    }

    // --- Tier-scaled name resolution -----------------------------------

    function test_name_tierLadder_fantasyPlate() public view {
        assertEq(fSci.sourceName(uint8(FantasyArmorSchema.ArmorType.Plate), uint8(SeedTypes.Tier.T1)), "Cuirass");
        assertEq(fSci.sourceName(uint8(FantasyArmorSchema.ArmorType.Plate), uint8(SeedTypes.Tier.T5)), "Drakeplate");
    }

    function test_name_tierLadder_sciFiCloak() public view {
        assertEq(fSci.targetName(uint8(SciFiArmorSchema.ArmorType.Cloak), uint8(SeedTypes.Tier.T1)), "Vac Cloak");
        assertEq(fSci.targetName(uint8(SciFiArmorSchema.ArmorType.Cloak), uint8(SeedTypes.Tier.T5)), "Null Cloak");
    }

    function test_name_tierLadder_cyberpunkWeave() public view {
        assertEq(
            cybSci.sourceName(uint8(CyberpunkArmorSchema.ArmorType.Weave), uint8(SeedTypes.Tier.T1)),
            "Mesh"
        );
        assertEq(
            cybSci.sourceName(uint8(CyberpunkArmorSchema.ArmorType.Weave), uint8(SeedTypes.Tier.T5)),
            "Ghostweave"
        );
    }

    function test_name_typeNone_returnsEmpty() public view {
        assertEq(fSci.sourceName(0, uint8(SeedTypes.Tier.T1)), "");
        assertEq(fSci.targetName(0, uint8(SeedTypes.Tier.T1)), "");
    }
}
