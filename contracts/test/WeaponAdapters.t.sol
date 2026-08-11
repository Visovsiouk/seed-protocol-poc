// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {SeedTypes} from "seed-protocol/SeedTypes.sol";
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
///         adapters. Toy schema IDs (101 = fantasy, 201 = scifi,
///         301 = cyberpunk) for the immutables. Asserts:
///
///           - schemaMapping() returns the immutables.
///           - INTO Cyberpunk applies stepDown + 1 atk base; OUT of
///             Cyberpunk applies stepUp - 1 atk base.
///           - Fantasy ↔ SciFi passes die/atk through (zero base lane).
///           - Per-sourceType deltas stack on the base rebalance.
///           - Round-trip A→B→A cancels: deltas are inverse-paired,
///             die ladder bounces back when interior.
///           - Element + WeaponType vocabulary re-encode by index.
///           - Element / WeaponType / Name labels are sourced from the
///             schema-specific library (no shared canonical names).
///           - Tier-scaled name() resolves (type, tier) into the
///             expected hand-authored string.
///           - D4 floor + D12 ceiling clamping holds.
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

    function _fantasyExt(
        DamageDie.Die d,
        int8 atk,
        int8 dmg,
        FantasyWeaponSchema.Element el,
        FantasyWeaponSchema.WeaponType wt
    ) internal pure returns (FantasyWeaponSchema.Ext memory) {
        return FantasyWeaponSchema.Ext({
            damageDie: d, attackBonus: atk, damageBonus: dmg, element: el, weaponType: wt
        });
    }

    function _scifiExt(
        DamageDie.Die d,
        int8 atk,
        int8 dmg,
        SciFiWeaponSchema.Element el,
        SciFiWeaponSchema.WeaponType wt
    ) internal pure returns (SciFiWeaponSchema.Ext memory) {
        return SciFiWeaponSchema.Ext({
            damageDie: d, attackBonus: atk, damageBonus: dmg, element: el, weaponType: wt
        });
    }

    function _cybExt(
        DamageDie.Die d,
        int8 atk,
        int8 dmg,
        CyberpunkWeaponSchema.Element el,
        CyberpunkWeaponSchema.WeaponType wt
    ) internal pure returns (CyberpunkWeaponSchema.Ext memory) {
        return CyberpunkWeaponSchema.Ext({
            damageDie: d, attackBonus: atk, damageBonus: dmg, element: el, weaponType: wt
        });
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

    // --- Fantasy ↔ SciFi (zero base lane) -------------------------------

    function test_fantasyToSciFi_typeNone_passesStatsThrough() public view {
        FantasyWeaponSchema.Ext memory src = _fantasyExt(
            DamageDie.Die.D8, 2, 1, FantasyWeaponSchema.Element.Fire, FantasyWeaponSchema.WeaponType.None
        );
        (SeedTypes.CoreAttributes memory attrs, bytes memory data) =
            fSci.translate(1, _attrs(SeedTypes.Tier.T2, FANTASY_WEAPON), abi.encode(src));
        SciFiWeaponSchema.Ext memory dst = abi.decode(data, (SciFiWeaponSchema.Ext));

        assertTrue(dst.damageDie == DamageDie.Die.D8);
        assertEq(dst.attackBonus, 2);
        assertEq(dst.damageBonus, 1);
        assertTrue(dst.element == SciFiWeaponSchema.Element.Plasma);
        assertTrue(dst.weaponType == SciFiWeaponSchema.WeaponType.None);
        assertEq(attrs.extensionSchemaId, SCIFI_WEAPON);
        assertEq(uint8(attrs.tier), uint8(SeedTypes.Tier.T2));
        assertEq(attrs.metadataURI, "ipfs://test");
    }

    function test_fantasyToSciFi_axeToCannon_appliesTypeDelta() public view {
        // Axe → Cannon: -1 atk, +2 dmg. Base lane is zero.
        FantasyWeaponSchema.Ext memory src = _fantasyExt(
            DamageDie.Die.D8, 2, 1, FantasyWeaponSchema.Element.Fire, FantasyWeaponSchema.WeaponType.Axe
        );
        (, bytes memory data) = fSci.translate(1, _attrs(SeedTypes.Tier.T2, FANTASY_WEAPON), abi.encode(src));
        SciFiWeaponSchema.Ext memory dst = abi.decode(data, (SciFiWeaponSchema.Ext));

        assertEq(dst.attackBonus, 1);
        assertEq(dst.damageBonus, 3);
        assertTrue(dst.weaponType == SciFiWeaponSchema.WeaponType.Cannon);
    }

    function test_fantasyToSciFi_staffToRailgun_appliesTypeDelta() public view {
        // Staff → Railgun: -2 atk, +2 dmg.
        FantasyWeaponSchema.Ext memory src = _fantasyExt(
            DamageDie.Die.D6, 0, 0, FantasyWeaponSchema.Element.Holy, FantasyWeaponSchema.WeaponType.Staff
        );
        (, bytes memory data) = fSci.translate(1, _attrs(SeedTypes.Tier.T1, FANTASY_WEAPON), abi.encode(src));
        SciFiWeaponSchema.Ext memory dst = abi.decode(data, (SciFiWeaponSchema.Ext));

        assertEq(dst.attackBonus, -2);
        assertEq(dst.damageBonus, 2);
        assertTrue(dst.weaponType == SciFiWeaponSchema.WeaponType.Railgun);
    }

    function test_sciFiToFantasy_typeNone_passesStatsThrough() public view {
        SciFiWeaponSchema.Ext memory src = _scifiExt(
            DamageDie.Die.D10, 3, 2, SciFiWeaponSchema.Element.Cryo, SciFiWeaponSchema.WeaponType.None
        );
        (, bytes memory data) = sciF.translate(1, _attrs(SeedTypes.Tier.T3, SCIFI_WEAPON), abi.encode(src));
        FantasyWeaponSchema.Ext memory dst = abi.decode(data, (FantasyWeaponSchema.Ext));

        assertTrue(dst.damageDie == DamageDie.Die.D10);
        assertEq(dst.attackBonus, 3);
        assertEq(dst.damageBonus, 2);
        assertTrue(dst.element == FantasyWeaponSchema.Element.Ice);
        assertTrue(dst.weaponType == FantasyWeaponSchema.WeaponType.None);
    }

    // --- INTO Cyberpunk (stepDown + 1 atk base) ------------------------

    function test_fantasyToCyberpunk_typeNone_baseRebalanceOnly() public view {
        FantasyWeaponSchema.Ext memory src = _fantasyExt(
            DamageDie.Die.D8, 2, 1, FantasyWeaponSchema.Element.Holy, FantasyWeaponSchema.WeaponType.None
        );
        (, bytes memory data) = fCyb.translate(1, _attrs(SeedTypes.Tier.T1, FANTASY_WEAPON), abi.encode(src));
        CyberpunkWeaponSchema.Ext memory dst = abi.decode(data, (CyberpunkWeaponSchema.Ext));

        assertTrue(dst.damageDie == DamageDie.Die.D6);
        assertEq(dst.attackBonus, 3); // 2 + 1 base
        assertEq(dst.damageBonus, 1);
        assertTrue(dst.element == CyberpunkWeaponSchema.Element.Laser);
        assertTrue(dst.weaponType == CyberpunkWeaponSchema.WeaponType.None);
    }

    function test_fantasyToCyberpunk_axeToShotgun_stacksOnBase() public view {
        // Base: -1 die, +1 atk. Type delta Axe→Shotgun: -1 atk, +2 dmg.
        // Net atk: 2 + 1 - 1 = 2. Dmg: 1 + 2 = 3. Die: D8 → D6.
        FantasyWeaponSchema.Ext memory src = _fantasyExt(
            DamageDie.Die.D8, 2, 1, FantasyWeaponSchema.Element.Fire, FantasyWeaponSchema.WeaponType.Axe
        );
        (, bytes memory data) = fCyb.translate(1, _attrs(SeedTypes.Tier.T1, FANTASY_WEAPON), abi.encode(src));
        CyberpunkWeaponSchema.Ext memory dst = abi.decode(data, (CyberpunkWeaponSchema.Ext));

        assertTrue(dst.damageDie == DamageDie.Die.D6);
        assertEq(dst.attackBonus, 2);
        assertEq(dst.damageBonus, 3);
        assertTrue(dst.weaponType == CyberpunkWeaponSchema.WeaponType.Shotgun);
    }

    function test_sciFiToCyberpunk_typeNone_baseRebalanceOnly() public view {
        SciFiWeaponSchema.Ext memory src = _scifiExt(
            DamageDie.Die.D10, 0, 0, SciFiWeaponSchema.Element.Void, SciFiWeaponSchema.WeaponType.None
        );
        (, bytes memory data) = sciCyb.translate(1, _attrs(SeedTypes.Tier.T1, SCIFI_WEAPON), abi.encode(src));
        CyberpunkWeaponSchema.Ext memory dst = abi.decode(data, (CyberpunkWeaponSchema.Ext));

        assertTrue(dst.damageDie == DamageDie.Die.D8);
        assertEq(dst.attackBonus, 1);
        assertTrue(dst.element == CyberpunkWeaponSchema.Element.Nano);
    }

    // --- OUT of Cyberpunk (stepUp - 1 atk base) ------------------------

    function test_cyberpunkToFantasy_typeNone_baseRebalanceOnly() public view {
        CyberpunkWeaponSchema.Ext memory src = _cybExt(
            DamageDie.Die.D6, 3, 1, CyberpunkWeaponSchema.Element.Laser, CyberpunkWeaponSchema.WeaponType.None
        );
        (, bytes memory data) = cybF.translate(1, _attrs(SeedTypes.Tier.T1, CYBERPUNK_WEAPON), abi.encode(src));
        FantasyWeaponSchema.Ext memory dst = abi.decode(data, (FantasyWeaponSchema.Ext));

        assertTrue(dst.damageDie == DamageDie.Die.D8);
        assertEq(dst.attackBonus, 2);
        assertEq(dst.damageBonus, 1);
        assertTrue(dst.element == FantasyWeaponSchema.Element.Holy);
        assertTrue(dst.weaponType == FantasyWeaponSchema.WeaponType.None);
    }

    function test_cyberpunkToSciFi_typeNone_baseRebalanceOnly() public view {
        CyberpunkWeaponSchema.Ext memory src = _cybExt(
            DamageDie.Die.D8, 1, 0, CyberpunkWeaponSchema.Element.Incendiary, CyberpunkWeaponSchema.WeaponType.None
        );
        (, bytes memory data) = cybSci.translate(1, _attrs(SeedTypes.Tier.T1, CYBERPUNK_WEAPON), abi.encode(src));
        SciFiWeaponSchema.Ext memory dst = abi.decode(data, (SciFiWeaponSchema.Ext));

        assertTrue(dst.damageDie == DamageDie.Die.D10);
        assertEq(dst.attackBonus, 0);
        assertTrue(dst.element == SciFiWeaponSchema.Element.Plasma);
    }

    // --- Round-trip (Fantasy→Cyberpunk→Fantasy) ------------------------

    function test_fantasyToCyberpunkAndBack_preservesInteriorStats() public view {
        // Pick an interior die (D8) and Sword → Katana → Sword: delta path
        // is (+0, +1) then (+0, -1) — cancels.
        FantasyWeaponSchema.Ext memory src = _fantasyExt(
            DamageDie.Die.D8, 2, 1, FantasyWeaponSchema.Element.Shock, FantasyWeaponSchema.WeaponType.Sword
        );
        (, bytes memory mid) = fCyb.translate(1, _attrs(SeedTypes.Tier.T1, FANTASY_WEAPON), abi.encode(src));
        (, bytes memory back) = cybF.translate(1, _attrs(SeedTypes.Tier.T1, CYBERPUNK_WEAPON), mid);
        FantasyWeaponSchema.Ext memory rt = abi.decode(back, (FantasyWeaponSchema.Ext));

        assertTrue(rt.damageDie == src.damageDie);
        assertEq(rt.attackBonus, src.attackBonus);
        assertEq(rt.damageBonus, src.damageBonus);
        assertTrue(rt.element == src.element);
        assertTrue(rt.weaponType == src.weaponType);
    }

    function test_axeRoundTrip_fantasyCyberpunkFantasy_cancels() public view {
        FantasyWeaponSchema.Ext memory src = _fantasyExt(
            DamageDie.Die.D10, 1, 0, FantasyWeaponSchema.Element.Fire, FantasyWeaponSchema.WeaponType.Axe
        );
        (, bytes memory mid) = fCyb.translate(1, _attrs(SeedTypes.Tier.T2, FANTASY_WEAPON), abi.encode(src));
        (, bytes memory back) = cybF.translate(1, _attrs(SeedTypes.Tier.T2, CYBERPUNK_WEAPON), mid);
        FantasyWeaponSchema.Ext memory rt = abi.decode(back, (FantasyWeaponSchema.Ext));

        assertTrue(rt.damageDie == src.damageDie);
        assertEq(rt.attackBonus, src.attackBonus);
        assertEq(rt.damageBonus, src.damageBonus);
        assertTrue(rt.weaponType == FantasyWeaponSchema.WeaponType.Axe);
    }

    // --- D4 / D12 clamping ---------------------------------------------

    function test_fantasyToCyberpunk_clampsD4() public view {
        FantasyWeaponSchema.Ext memory src = _fantasyExt(
            DamageDie.Die.D4, 0, 0, FantasyWeaponSchema.Element.None, FantasyWeaponSchema.WeaponType.None
        );
        (, bytes memory data) = fCyb.translate(1, _attrs(SeedTypes.Tier.T1, FANTASY_WEAPON), abi.encode(src));
        CyberpunkWeaponSchema.Ext memory dst = abi.decode(data, (CyberpunkWeaponSchema.Ext));

        assertTrue(dst.damageDie == DamageDie.Die.D4);
        assertEq(dst.attackBonus, 1);
    }

    function test_cyberpunkToSciFi_clampsD12() public view {
        CyberpunkWeaponSchema.Ext memory src = _cybExt(
            DamageDie.Die.D12, 0, 0, CyberpunkWeaponSchema.Element.None, CyberpunkWeaponSchema.WeaponType.None
        );
        (, bytes memory data) = cybSci.translate(1, _attrs(SeedTypes.Tier.T1, CYBERPUNK_WEAPON), abi.encode(src));
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

    // --- WeaponType vocabulary -----------------------------------------

    function test_typeLabel_fantasyToCyberpunk() public view {
        assertEq(fCyb.sourceTypeLabel(uint8(FantasyWeaponSchema.WeaponType.Axe)), "axe");
        assertEq(fCyb.sourceTypeLabel(uint8(FantasyWeaponSchema.WeaponType.Staff)), "staff");
        assertEq(fCyb.targetTypeLabel(uint8(CyberpunkWeaponSchema.WeaponType.Shotgun)), "shotgun");
        assertEq(fCyb.targetTypeLabel(uint8(CyberpunkWeaponSchema.WeaponType.Monowire)), "monowire");
    }

    function test_typeLabel_sciFiToFantasy() public view {
        assertEq(sciF.sourceTypeLabel(uint8(SciFiWeaponSchema.WeaponType.Railgun)), "railgun");
        assertEq(sciF.targetTypeLabel(uint8(FantasyWeaponSchema.WeaponType.Bow)), "bow");
    }

    function test_typeLabel_none() public view {
        assertEq(fSci.sourceTypeLabel(0), "none");
        assertEq(cybF.targetTypeLabel(0), "none");
    }

    // --- Tier-scaled name() --------------------------------------------

    function test_name_fantasyDagger_tierLadder() public view {
        // T1 = Tooth, T5 = Dragon's Fang per the schema's tier ladder.
        uint8 d = uint8(FantasyWeaponSchema.WeaponType.Dagger);
        assertEq(fSci.sourceName(d, uint8(SeedTypes.Tier.T1)), "Tooth");
        assertEq(fSci.sourceName(d, uint8(SeedTypes.Tier.T5)), "Dragon's Fang");
    }

    function test_name_cyberpunkKatana_tierLadder() public view {
        uint8 k = uint8(CyberpunkWeaponSchema.WeaponType.Katana);
        assertEq(fCyb.targetName(k, uint8(SeedTypes.Tier.T1)), "Tanto");
        assertEq(fCyb.targetName(k, uint8(SeedTypes.Tier.T3)), "Katana");
        assertEq(fCyb.targetName(k, uint8(SeedTypes.Tier.T5)), "Edgelord");
    }

    function test_name_none_isEmpty() public view {
        assertEq(fSci.sourceName(0, uint8(SeedTypes.Tier.T3)), "");
        assertEq(fSci.targetName(0, uint8(SeedTypes.Tier.T3)), "");
    }
}
