// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {SeedTypes} from "../src/SeedTypes.sol";
import {DamageDie} from "../src/DamageDie.sol";
import {FantasyWeaponSchema} from "../src/schemas/FantasyWeaponSchema.sol";
import {SciFiWeaponSchema} from "../src/schemas/SciFiWeaponSchema.sol";
import {CyberpunkWeaponSchema} from "../src/schemas/CyberpunkWeaponSchema.sol";
import {FantasyToSciFiWeaponAdapter} from "../src/adapters/weapon/FantasyToSciFiWeaponAdapter.sol";
import {FantasyToCyberpunkWeaponAdapter} from "../src/adapters/weapon/FantasyToCyberpunkWeaponAdapter.sol";
import {SciFiToFantasyWeaponAdapter} from "../src/adapters/weapon/SciFiToFantasyWeaponAdapter.sol";
import {SciFiToCyberpunkWeaponAdapter} from "../src/adapters/weapon/SciFiToCyberpunkWeaponAdapter.sol";
import {CyberpunkToFantasyWeaponAdapter} from "../src/adapters/weapon/CyberpunkToFantasyWeaponAdapter.sol";
import {CyberpunkToSciFiWeaponAdapter} from "../src/adapters/weapon/CyberpunkToSciFiWeaponAdapter.sol";

/// @title  WeaponAdaptersTest
/// @notice One test suite covering all six ordered-pair weapon
///         adapters. We instantiate each adapter with toy schema IDs
///         (101 = fantasy weapon, 201 = scifi weapon, 301 = cyberpunk
///         weapon) and check:
///
///           - schemaMapping() returns the immutables.
///           - INTO Cyberpunk applies stepDown + 1 attack.
///           - OUT of Cyberpunk applies stepUp - 1 attack.
///           - Fantasy ↔ SciFi passes weapon stats through unchanged.
///           - Element re-encoding follows the PoC's index-identity
///             rule (index N in source ↔ index N in target).
///           - Element label vocabulary is sourced from the
///             schema-specific library (no shared canonical names).
///           - Tier + metadataURI pass through untouched.
///           - extensionSchemaId is rewritten to the target.
///           - D4 floor + D12 ceiling clamping on the die ladder.
contract WeaponAdaptersTest is Test {
    uint256 constant FANTASY_WEAPON = 101;
    uint256 constant SCIFI_WEAPON = 201;
    uint256 constant CYBERPUNK_WEAPON = 301;

    FantasyToSciFiWeaponAdapter fSci;
    FantasyToCyberpunkWeaponAdapter fCyb;
    SciFiToFantasyWeaponAdapter sciF;
    SciFiToCyberpunkWeaponAdapter sciCyb;
    CyberpunkToFantasyWeaponAdapter cybF;
    CyberpunkToSciFiWeaponAdapter cybSci;

    function setUp() public {
        fSci = new FantasyToSciFiWeaponAdapter(FANTASY_WEAPON, SCIFI_WEAPON);
        fCyb = new FantasyToCyberpunkWeaponAdapter(FANTASY_WEAPON, CYBERPUNK_WEAPON);
        sciF = new SciFiToFantasyWeaponAdapter(SCIFI_WEAPON, FANTASY_WEAPON);
        sciCyb = new SciFiToCyberpunkWeaponAdapter(SCIFI_WEAPON, CYBERPUNK_WEAPON);
        cybF = new CyberpunkToFantasyWeaponAdapter(CYBERPUNK_WEAPON, FANTASY_WEAPON);
        cybSci = new CyberpunkToSciFiWeaponAdapter(CYBERPUNK_WEAPON, SCIFI_WEAPON);
    }

    function _attrs(SeedTypes.Tier tier, uint256 schemaId) internal pure returns (SeedTypes.CoreAttributes memory) {
        return SeedTypes.CoreAttributes({tier: tier, extensionSchemaId: schemaId, metadataURI: "ipfs://test"});
    }

    function _fantasyExt(DamageDie.Die d, int8 atk, int8 dmg, FantasyWeaponSchema.Element el)
        internal
        pure
        returns (FantasyWeaponSchema.Ext memory)
    {
        return FantasyWeaponSchema.Ext({damageDie: d, attackBonus: atk, damageBonus: dmg, element: el});
    }

    function _scifiExt(DamageDie.Die d, int8 atk, int8 dmg, SciFiWeaponSchema.Element el)
        internal
        pure
        returns (SciFiWeaponSchema.Ext memory)
    {
        return SciFiWeaponSchema.Ext({damageDie: d, attackBonus: atk, damageBonus: dmg, element: el});
    }

    function _cybExt(DamageDie.Die d, int8 atk, int8 dmg, CyberpunkWeaponSchema.Element el)
        internal
        pure
        returns (CyberpunkWeaponSchema.Ext memory)
    {
        return CyberpunkWeaponSchema.Ext({damageDie: d, attackBonus: atk, damageBonus: dmg, element: el});
    }

    // --- schemaMapping --------------------------------------------------

    function test_schemaMapping_returnsImmutables() public view {
        (uint256 a, uint256 b) = fSci.schemaMapping();
        assertEq(a, FANTASY_WEAPON);
        assertEq(b, SCIFI_WEAPON);

        (a, b) = cybF.schemaMapping();
        assertEq(a, CYBERPUNK_WEAPON);
        assertEq(b, FANTASY_WEAPON);
    }

    // --- Fantasy ↔ SciFi (passthrough) ---------------------------------

    function test_fantasyToSciFi_passesStatsThrough() public view {
        FantasyWeaponSchema.Ext memory src = _fantasyExt(DamageDie.Die.D8, 2, 1, FantasyWeaponSchema.Element.Fire);
        (SeedTypes.CoreAttributes memory attrs, bytes memory data) =
            fSci.translate(1, _attrs(SeedTypes.Tier.T2, FANTASY_WEAPON), abi.encode(src));
        SciFiWeaponSchema.Ext memory dst = abi.decode(data, (SciFiWeaponSchema.Ext));

        assertTrue(dst.damageDie == DamageDie.Die.D8);
        assertEq(dst.attackBonus, 2);
        assertEq(dst.damageBonus, 1);
        assertTrue(dst.element == SciFiWeaponSchema.Element.Plasma);
        assertEq(attrs.extensionSchemaId, SCIFI_WEAPON);
        assertEq(uint8(attrs.tier), uint8(SeedTypes.Tier.T2));
        assertEq(attrs.metadataURI, "ipfs://test");
    }

    function test_sciFiToFantasy_passesStatsThrough() public view {
        SciFiWeaponSchema.Ext memory src = _scifiExt(DamageDie.Die.D10, 3, 2, SciFiWeaponSchema.Element.Cryo);
        (, bytes memory data) =
            sciF.translate(1, _attrs(SeedTypes.Tier.T3, SCIFI_WEAPON), abi.encode(src));
        FantasyWeaponSchema.Ext memory dst = abi.decode(data, (FantasyWeaponSchema.Ext));

        assertTrue(dst.damageDie == DamageDie.Die.D10);
        assertEq(dst.attackBonus, 3);
        assertEq(dst.damageBonus, 2);
        assertTrue(dst.element == FantasyWeaponSchema.Element.Ice);
    }

    // --- INTO Cyberpunk (stepDown + 1 attack) --------------------------

    function test_fantasyToCyberpunk_appliesIntoCyberpunkRebalance() public view {
        FantasyWeaponSchema.Ext memory src = _fantasyExt(DamageDie.Die.D8, 2, 1, FantasyWeaponSchema.Element.Holy);
        (, bytes memory data) =
            fCyb.translate(1, _attrs(SeedTypes.Tier.T1, FANTASY_WEAPON), abi.encode(src));
        CyberpunkWeaponSchema.Ext memory dst = abi.decode(data, (CyberpunkWeaponSchema.Ext));

        assertTrue(dst.damageDie == DamageDie.Die.D6);
        assertEq(dst.attackBonus, 3);
        assertEq(dst.damageBonus, 1);
        assertTrue(dst.element == CyberpunkWeaponSchema.Element.Laser);
    }

    function test_sciFiToCyberpunk_appliesIntoCyberpunkRebalance() public view {
        SciFiWeaponSchema.Ext memory src = _scifiExt(DamageDie.Die.D10, 0, 0, SciFiWeaponSchema.Element.Void);
        (, bytes memory data) =
            sciCyb.translate(1, _attrs(SeedTypes.Tier.T1, SCIFI_WEAPON), abi.encode(src));
        CyberpunkWeaponSchema.Ext memory dst = abi.decode(data, (CyberpunkWeaponSchema.Ext));

        assertTrue(dst.damageDie == DamageDie.Die.D8);
        assertEq(dst.attackBonus, 1);
        assertTrue(dst.element == CyberpunkWeaponSchema.Element.Nano);
    }

    // --- OUT of Cyberpunk (stepUp - 1 attack) --------------------------

    function test_cyberpunkToFantasy_appliesOutOfCyberpunkRebalance() public view {
        CyberpunkWeaponSchema.Ext memory src = _cybExt(DamageDie.Die.D6, 3, 1, CyberpunkWeaponSchema.Element.Laser);
        (, bytes memory data) =
            cybF.translate(1, _attrs(SeedTypes.Tier.T1, CYBERPUNK_WEAPON), abi.encode(src));
        FantasyWeaponSchema.Ext memory dst = abi.decode(data, (FantasyWeaponSchema.Ext));

        assertTrue(dst.damageDie == DamageDie.Die.D8);
        assertEq(dst.attackBonus, 2);
        assertEq(dst.damageBonus, 1);
        assertTrue(dst.element == FantasyWeaponSchema.Element.Holy);
    }

    function test_cyberpunkToSciFi_appliesOutOfCyberpunkRebalance() public view {
        CyberpunkWeaponSchema.Ext memory src = _cybExt(DamageDie.Die.D8, 1, 0, CyberpunkWeaponSchema.Element.Incendiary);
        (, bytes memory data) =
            cybSci.translate(1, _attrs(SeedTypes.Tier.T1, CYBERPUNK_WEAPON), abi.encode(src));
        SciFiWeaponSchema.Ext memory dst = abi.decode(data, (SciFiWeaponSchema.Ext));

        assertTrue(dst.damageDie == DamageDie.Die.D10);
        assertEq(dst.attackBonus, 0);
        assertTrue(dst.element == SciFiWeaponSchema.Element.Plasma);
    }

    // --- Round-trip (within die-ladder interior) -----------------------

    function test_fantasyToCyberpunkAndBack_preservesInteriorStats() public view {
        FantasyWeaponSchema.Ext memory src = _fantasyExt(DamageDie.Die.D8, 2, 1, FantasyWeaponSchema.Element.Shock);
        (, bytes memory mid) =
            fCyb.translate(1, _attrs(SeedTypes.Tier.T1, FANTASY_WEAPON), abi.encode(src));
        (, bytes memory back) =
            cybF.translate(1, _attrs(SeedTypes.Tier.T1, CYBERPUNK_WEAPON), mid);
        FantasyWeaponSchema.Ext memory rt = abi.decode(back, (FantasyWeaponSchema.Ext));

        assertTrue(rt.damageDie == src.damageDie);
        assertEq(rt.attackBonus, src.attackBonus);
        assertEq(rt.damageBonus, src.damageBonus);
        assertTrue(rt.element == src.element);
    }

    // --- D4 / D12 clamping ---------------------------------------------

    function test_fantasyToCyberpunk_clampsD4() public view {
        FantasyWeaponSchema.Ext memory src = _fantasyExt(DamageDie.Die.D4, 0, 0, FantasyWeaponSchema.Element.None);
        (, bytes memory data) =
            fCyb.translate(1, _attrs(SeedTypes.Tier.T1, FANTASY_WEAPON), abi.encode(src));
        CyberpunkWeaponSchema.Ext memory dst = abi.decode(data, (CyberpunkWeaponSchema.Ext));

        assertTrue(dst.damageDie == DamageDie.Die.D4);
        assertEq(dst.attackBonus, 1);
    }

    function test_cyberpunkToSciFi_clampsD12() public view {
        CyberpunkWeaponSchema.Ext memory src = _cybExt(DamageDie.Die.D12, 0, 0, CyberpunkWeaponSchema.Element.None);
        (, bytes memory data) =
            cybSci.translate(1, _attrs(SeedTypes.Tier.T1, CYBERPUNK_WEAPON), abi.encode(src));
        SciFiWeaponSchema.Ext memory dst = abi.decode(data, (SciFiWeaponSchema.Ext));

        assertTrue(dst.damageDie == DamageDie.Die.D12);
        assertEq(dst.attackBonus, -1);
    }

    // --- Element vocabulary --------------------------------------------

    function test_elementLabel_fantasyToSciFi() public view {
        assertEq(fSci.sourceElementLabel(uint8(FantasyWeaponSchema.Element.Fire)), "fire");
        assertEq(fSci.sourceElementLabel(uint8(FantasyWeaponSchema.Element.Holy)), "holy");
        assertEq(fSci.targetElementLabel(uint8(SciFiWeaponSchema.Element.Plasma)), "plasma");
        assertEq(fSci.targetElementLabel(uint8(SciFiWeaponSchema.Element.Void)), "void");
    }

    function test_elementLabel_fantasyToCyberpunk() public view {
        assertEq(fCyb.targetElementLabel(uint8(CyberpunkWeaponSchema.Element.Incendiary)), "incendiary");
        assertEq(fCyb.targetElementLabel(uint8(CyberpunkWeaponSchema.Element.EMP)), "emp");
        assertEq(fCyb.targetElementLabel(uint8(CyberpunkWeaponSchema.Element.Nano)), "nano");
    }

    function test_elementLabel_cyberpunkToSciFi() public view {
        assertEq(cybSci.sourceElementLabel(uint8(CyberpunkWeaponSchema.Element.Cryogenic)), "cryogenic");
        assertEq(cybSci.sourceElementLabel(uint8(CyberpunkWeaponSchema.Element.Laser)), "laser");
        assertEq(cybSci.targetElementLabel(uint8(SciFiWeaponSchema.Element.Cryo)), "cryo");
        assertEq(cybSci.targetElementLabel(uint8(SciFiWeaponSchema.Element.Ion)), "ion");
    }

    function test_elementLabel_none() public view {
        assertEq(fSci.sourceElementLabel(0), "none");
        assertEq(fCyb.targetElementLabel(0), "none");
        assertEq(cybF.sourceElementLabel(0), "none");
    }
}
