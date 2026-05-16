// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PresetArmorAdapter} from "../src/PresetArmorAdapter.sol";
import {PresetTypes} from "../src/PresetTypes.sol";
import {SeedTypes} from "../src/SeedTypes.sol";

contract PresetArmorAdapterTest is Test {
    uint256 constant FANTASY_ARMOR = 102;
    uint256 constant SCIFI_ARMOR = 202;
    uint256 constant CYBERPUNK_ARMOR = 302;

    function _attrs(SeedTypes.Tier tier, uint256 schemaId) internal pure returns (SeedTypes.CoreAttributes memory) {
        return SeedTypes.CoreAttributes({tier: tier, extensionSchemaId: schemaId, metadataURI: "ipfs://x"});
    }

    function _ext(int8 ac, int8 hp, PresetTypes.Element resist) internal pure returns (bytes memory) {
        return abi.encode(PresetTypes.ArmorExt({acBonus: ac, hpBonus: hp, resistElement: resist}));
    }

    function test_RevertsOnSamePreset() public {
        vm.expectRevert(PresetArmorAdapter.SamePreset.selector);
        new PresetArmorAdapter(
            SCIFI_ARMOR,
            SCIFI_ARMOR,
            PresetTypes.Preset.SciFi,
            PresetTypes.Preset.SciFi
        );
    }

    function test_SchemaMapping() public {
        PresetArmorAdapter a = new PresetArmorAdapter(
            FANTASY_ARMOR,
            CYBERPUNK_ARMOR,
            PresetTypes.Preset.Fantasy,
            PresetTypes.Preset.Cyberpunk
        );
        (uint256 s, uint256 t) = a.schemaMapping();
        assertEq(s, FANTASY_ARMOR);
        assertEq(t, CYBERPUNK_ARMOR);
        assertEq(a.slot(), "armor");
    }

    // --------------------------------------------------------------
    // SciFi ↔ Cyberpunk: no fantasy crossing → stats pass through.
    // --------------------------------------------------------------
    function test_ScifiToCyberpunk_StatPassthrough() public {
        PresetArmorAdapter a = new PresetArmorAdapter(
            SCIFI_ARMOR,
            CYBERPUNK_ARMOR,
            PresetTypes.Preset.SciFi,
            PresetTypes.Preset.Cyberpunk
        );
        bytes memory ext = _ext(int8(2), int8(10), PresetTypes.Element.Ice);
        (SeedTypes.CoreAttributes memory attrs, bytes memory outExt) =
            a.translate(1, _attrs(SeedTypes.Tier.T3, SCIFI_ARMOR), ext);

        assertEq(uint256(attrs.tier), uint256(SeedTypes.Tier.T3));
        assertEq(attrs.extensionSchemaId, CYBERPUNK_ARMOR);
        assertEq(attrs.metadataURI, "ipfs://x");

        PresetTypes.ArmorExt memory dst = abi.decode(outExt, (PresetTypes.ArmorExt));
        assertEq(dst.acBonus, int8(2));
        assertEq(dst.hpBonus, int8(10));
        assertEq(uint8(dst.resistElement), uint8(PresetTypes.Element.Ice));
    }

    // --------------------------------------------------------------
    // Crossing INTO fantasy: -1 AC, +5 HP.
    // --------------------------------------------------------------
    function test_ScifiToFantasy_AcDown_HpUp() public {
        PresetArmorAdapter a = new PresetArmorAdapter(
            SCIFI_ARMOR,
            FANTASY_ARMOR,
            PresetTypes.Preset.SciFi,
            PresetTypes.Preset.Fantasy
        );
        bytes memory ext = _ext(int8(2), int8(10), PresetTypes.Element.Fire);
        (, bytes memory outExt) = a.translate(1, _attrs(SeedTypes.Tier.T3, SCIFI_ARMOR), ext);

        PresetTypes.ArmorExt memory dst = abi.decode(outExt, (PresetTypes.ArmorExt));
        assertEq(dst.acBonus, int8(1));
        assertEq(dst.hpBonus, int8(15));
        assertEq(uint8(dst.resistElement), uint8(PresetTypes.Element.Fire));
    }

    // --------------------------------------------------------------
    // Crossing OUT of fantasy: +1 AC, -5 HP.
    // --------------------------------------------------------------
    function test_FantasyToScifi_AcUp_HpDown() public {
        PresetArmorAdapter a = new PresetArmorAdapter(
            FANTASY_ARMOR,
            SCIFI_ARMOR,
            PresetTypes.Preset.Fantasy,
            PresetTypes.Preset.SciFi
        );
        bytes memory ext = _ext(int8(1), int8(15), PresetTypes.Element.Holy);
        (, bytes memory outExt) = a.translate(1, _attrs(SeedTypes.Tier.T2, FANTASY_ARMOR), ext);

        PresetTypes.ArmorExt memory dst = abi.decode(outExt, (PresetTypes.ArmorExt));
        assertEq(dst.acBonus, int8(2));
        assertEq(dst.hpBonus, int8(10));
        assertEq(uint8(dst.resistElement), uint8(PresetTypes.Element.Holy));
    }

    // --------------------------------------------------------------
    // Round-trip: scifi → fantasy → scifi returns original stats.
    // --------------------------------------------------------------
    function test_RoundTrip_ScifiFantasyScifi_PreservesStats() public {
        PresetArmorAdapter fwd = new PresetArmorAdapter(
            SCIFI_ARMOR,
            FANTASY_ARMOR,
            PresetTypes.Preset.SciFi,
            PresetTypes.Preset.Fantasy
        );
        PresetArmorAdapter rev = new PresetArmorAdapter(
            FANTASY_ARMOR,
            SCIFI_ARMOR,
            PresetTypes.Preset.Fantasy,
            PresetTypes.Preset.SciFi
        );

        bytes memory ext = _ext(int8(3), int8(20), PresetTypes.Element.Unholy);
        (, bytes memory once) = fwd.translate(1, _attrs(SeedTypes.Tier.T4, SCIFI_ARMOR), ext);
        (, bytes memory twice) =
            rev.translate(1, _attrs(SeedTypes.Tier.T4, FANTASY_ARMOR), once);

        PresetTypes.ArmorExt memory back = abi.decode(twice, (PresetTypes.ArmorExt));
        assertEq(back.acBonus, int8(3));
        assertEq(back.hpBonus, int8(20));
        assertEq(uint8(back.resistElement), uint8(PresetTypes.Element.Unholy));
    }

    // --------------------------------------------------------------
    // Cyberpunk → Fantasy also applies the fantasy rebalance.
    // --------------------------------------------------------------
    function test_CyberpunkToFantasy_AppliesDelta() public {
        PresetArmorAdapter a = new PresetArmorAdapter(
            CYBERPUNK_ARMOR,
            FANTASY_ARMOR,
            PresetTypes.Preset.Cyberpunk,
            PresetTypes.Preset.Fantasy
        );
        bytes memory ext = _ext(int8(3), int8(5), PresetTypes.Element.Shock);
        (, bytes memory outExt) = a.translate(1, _attrs(SeedTypes.Tier.T3, CYBERPUNK_ARMOR), ext);

        PresetTypes.ArmorExt memory dst = abi.decode(outExt, (PresetTypes.ArmorExt));
        assertEq(dst.acBonus, int8(2));
        assertEq(dst.hpBonus, int8(10));
    }
}
