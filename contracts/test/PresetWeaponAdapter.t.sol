// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PresetWeaponAdapter} from "../src/PresetWeaponAdapter.sol";
import {PresetTypes} from "../src/PresetTypes.sol";
import {SeedTypes} from "../src/SeedTypes.sol";

contract PresetWeaponAdapterTest is Test {
    // Canonical PoC schema ids — 101/201/301 weapon, 102/202/302 armor.
    // The adapter doesn't enforce the numbering; the tests use the same
    // ids the off-chain runtime uses so a registered adapter wired to
    // these is registered against the same pair the engine reads.
    uint256 constant FANTASY_WEAPON = 101;
    uint256 constant SCIFI_WEAPON = 201;
    uint256 constant CYBERPUNK_WEAPON = 301;

    function _attrs(SeedTypes.Tier tier, uint256 schemaId) internal pure returns (SeedTypes.CoreAttributes memory) {
        return SeedTypes.CoreAttributes({tier: tier, extensionSchemaId: schemaId, metadataURI: "ipfs://x"});
    }

    function _ext(
        PresetTypes.DamageDie die,
        int8 atk,
        int8 dmg,
        PresetTypes.Element elem
    ) internal pure returns (bytes memory) {
        return abi.encode(PresetTypes.WeaponExt({damageDie: die, attackBonus: atk, damageBonus: dmg, element: elem}));
    }

    // --------------------------------------------------------------
    // Same-preset construction is rejected (a no-op adapter is a bug).
    // --------------------------------------------------------------
    function test_RevertsOnSamePreset() public {
        vm.expectRevert(PresetWeaponAdapter.SamePreset.selector);
        new PresetWeaponAdapter(
            FANTASY_WEAPON,
            FANTASY_WEAPON,
            PresetTypes.Preset.Fantasy,
            PresetTypes.Preset.Fantasy
        );
    }

    function test_SchemaMapping() public {
        PresetWeaponAdapter a = new PresetWeaponAdapter(
            FANTASY_WEAPON,
            SCIFI_WEAPON,
            PresetTypes.Preset.Fantasy,
            PresetTypes.Preset.SciFi
        );
        (uint256 s, uint256 t) = a.schemaMapping();
        assertEq(s, FANTASY_WEAPON);
        assertEq(t, SCIFI_WEAPON);
        assertEq(a.slot(), "weapon");
    }

    // --------------------------------------------------------------
    // Fantasy ↔ SciFi: no cyberpunk crossing → stats pass through.
    // Element + damageBonus also passthrough.
    // --------------------------------------------------------------
    function test_FantasyToScifi_StatPassthrough() public {
        PresetWeaponAdapter a = new PresetWeaponAdapter(
            FANTASY_WEAPON,
            SCIFI_WEAPON,
            PresetTypes.Preset.Fantasy,
            PresetTypes.Preset.SciFi
        );
        bytes memory ext = _ext(PresetTypes.DamageDie.D8, int8(2), int8(1), PresetTypes.Element.Fire);
        (SeedTypes.CoreAttributes memory attrs, bytes memory outExt) =
            a.translate(1, _attrs(SeedTypes.Tier.T3, FANTASY_WEAPON), ext);

        // CoreAttributes rewritten with the target schema id, tier + URI preserved.
        assertEq(uint256(attrs.tier), uint256(SeedTypes.Tier.T3));
        assertEq(attrs.extensionSchemaId, SCIFI_WEAPON);
        assertEq(attrs.metadataURI, "ipfs://x");

        PresetTypes.WeaponExt memory dst = abi.decode(outExt, (PresetTypes.WeaponExt));
        assertEq(uint8(dst.damageDie), uint8(PresetTypes.DamageDie.D8));
        assertEq(dst.attackBonus, int8(2));
        assertEq(dst.damageBonus, int8(1));
        assertEq(uint8(dst.element), uint8(PresetTypes.Element.Fire));
    }

    // --------------------------------------------------------------
    // Crossing INTO cyberpunk: die steps down, +1 attack.
    // --------------------------------------------------------------
    function test_FantasyToCyberpunk_DieStepsDown_AttackUp() public {
        PresetWeaponAdapter a = new PresetWeaponAdapter(
            FANTASY_WEAPON,
            CYBERPUNK_WEAPON,
            PresetTypes.Preset.Fantasy,
            PresetTypes.Preset.Cyberpunk
        );
        bytes memory ext = _ext(PresetTypes.DamageDie.D8, int8(1), int8(2), PresetTypes.Element.Ice);
        (, bytes memory outExt) = a.translate(1, _attrs(SeedTypes.Tier.T2, FANTASY_WEAPON), ext);

        PresetTypes.WeaponExt memory dst = abi.decode(outExt, (PresetTypes.WeaponExt));
        assertEq(uint8(dst.damageDie), uint8(PresetTypes.DamageDie.D6));
        assertEq(dst.attackBonus, int8(2));
        assertEq(dst.damageBonus, int8(2));
        assertEq(uint8(dst.element), uint8(PresetTypes.Element.Ice));
    }

    // --------------------------------------------------------------
    // Crossing OUT of cyberpunk: die steps up, -1 attack.
    // --------------------------------------------------------------
    function test_CyberpunkToFantasy_DieStepsUp_AttackDown() public {
        PresetWeaponAdapter a = new PresetWeaponAdapter(
            CYBERPUNK_WEAPON,
            FANTASY_WEAPON,
            PresetTypes.Preset.Cyberpunk,
            PresetTypes.Preset.Fantasy
        );
        bytes memory ext = _ext(PresetTypes.DamageDie.D6, int8(2), int8(0), PresetTypes.Element.Shock);
        (, bytes memory outExt) = a.translate(1, _attrs(SeedTypes.Tier.T2, CYBERPUNK_WEAPON), ext);

        PresetTypes.WeaponExt memory dst = abi.decode(outExt, (PresetTypes.WeaponExt));
        assertEq(uint8(dst.damageDie), uint8(PresetTypes.DamageDie.D8));
        assertEq(dst.attackBonus, int8(1));
        assertEq(dst.damageBonus, int8(0));
        assertEq(uint8(dst.element), uint8(PresetTypes.Element.Shock));
    }

    // --------------------------------------------------------------
    // Round-trip: fantasy → cyberpunk → fantasy returns original
    // stats so adapters are inverse-pair consistent. (Excluding D4
    // floor where stepDown clamps — that's covered separately.)
    // --------------------------------------------------------------
    function test_RoundTrip_FantasyCyberpunkFantasy_PreservesStats() public {
        PresetWeaponAdapter fwd = new PresetWeaponAdapter(
            FANTASY_WEAPON,
            CYBERPUNK_WEAPON,
            PresetTypes.Preset.Fantasy,
            PresetTypes.Preset.Cyberpunk
        );
        PresetWeaponAdapter rev = new PresetWeaponAdapter(
            CYBERPUNK_WEAPON,
            FANTASY_WEAPON,
            PresetTypes.Preset.Cyberpunk,
            PresetTypes.Preset.Fantasy
        );

        bytes memory ext = _ext(PresetTypes.DamageDie.D10, int8(3), int8(2), PresetTypes.Element.Holy);
        (, bytes memory once) = fwd.translate(1, _attrs(SeedTypes.Tier.T4, FANTASY_WEAPON), ext);
        (, bytes memory twice) =
            rev.translate(1, _attrs(SeedTypes.Tier.T4, CYBERPUNK_WEAPON), once);

        PresetTypes.WeaponExt memory back = abi.decode(twice, (PresetTypes.WeaponExt));
        assertEq(uint8(back.damageDie), uint8(PresetTypes.DamageDie.D10));
        assertEq(back.attackBonus, int8(3));
        assertEq(back.damageBonus, int8(2));
        assertEq(uint8(back.element), uint8(PresetTypes.Element.Holy));
    }

    // --------------------------------------------------------------
    // D4 floor: stepDown clamps. The +1 attack bonus still applies
    // (the docblock says this is intentional lossy behavior).
    // --------------------------------------------------------------
    function test_FantasyToCyberpunk_D4_ClampsAtFloor() public {
        PresetWeaponAdapter a = new PresetWeaponAdapter(
            FANTASY_WEAPON,
            CYBERPUNK_WEAPON,
            PresetTypes.Preset.Fantasy,
            PresetTypes.Preset.Cyberpunk
        );
        bytes memory ext = _ext(PresetTypes.DamageDie.D4, int8(0), int8(0), PresetTypes.Element.None);
        (, bytes memory outExt) = a.translate(1, _attrs(SeedTypes.Tier.T1, FANTASY_WEAPON), ext);

        PresetTypes.WeaponExt memory dst = abi.decode(outExt, (PresetTypes.WeaponExt));
        assertEq(uint8(dst.damageDie), uint8(PresetTypes.DamageDie.D4));
        assertEq(dst.attackBonus, int8(1));
    }

    // --------------------------------------------------------------
    // D12 ceiling on the reverse path.
    // --------------------------------------------------------------
    function test_CyberpunkToFantasy_D12_ClampsAtCeiling() public {
        PresetWeaponAdapter a = new PresetWeaponAdapter(
            CYBERPUNK_WEAPON,
            FANTASY_WEAPON,
            PresetTypes.Preset.Cyberpunk,
            PresetTypes.Preset.Fantasy
        );
        bytes memory ext = _ext(PresetTypes.DamageDie.D12, int8(0), int8(0), PresetTypes.Element.None);
        (, bytes memory outExt) = a.translate(1, _attrs(SeedTypes.Tier.T5, CYBERPUNK_WEAPON), ext);

        PresetTypes.WeaponExt memory dst = abi.decode(outExt, (PresetTypes.WeaponExt));
        assertEq(uint8(dst.damageDie), uint8(PresetTypes.DamageDie.D12));
        assertEq(dst.attackBonus, int8(-1));
    }

    // --------------------------------------------------------------
    // elementLabel — on-chain vocabulary table (each preset's local
    // name for the canonical element enum).
    // --------------------------------------------------------------
    function test_ElementLabel_FantasyVocabulary() public {
        PresetWeaponAdapter a = new PresetWeaponAdapter(
            FANTASY_WEAPON,
            SCIFI_WEAPON,
            PresetTypes.Preset.Fantasy,
            PresetTypes.Preset.SciFi
        );
        assertEq(a.elementLabel(PresetTypes.Preset.Fantasy, PresetTypes.Element.Fire), "fire");
        assertEq(a.elementLabel(PresetTypes.Preset.Fantasy, PresetTypes.Element.Ice), "ice");
        assertEq(a.elementLabel(PresetTypes.Preset.Fantasy, PresetTypes.Element.Shock), "shock");
        assertEq(a.elementLabel(PresetTypes.Preset.Fantasy, PresetTypes.Element.Holy), "holy");
        assertEq(a.elementLabel(PresetTypes.Preset.Fantasy, PresetTypes.Element.Unholy), "unholy");
        assertEq(a.elementLabel(PresetTypes.Preset.Fantasy, PresetTypes.Element.None), "none");
    }

    function test_ElementLabel_SciFiVocabulary() public {
        PresetWeaponAdapter a = new PresetWeaponAdapter(
            FANTASY_WEAPON,
            SCIFI_WEAPON,
            PresetTypes.Preset.Fantasy,
            PresetTypes.Preset.SciFi
        );
        assertEq(a.elementLabel(PresetTypes.Preset.SciFi, PresetTypes.Element.Fire), "plasma");
        assertEq(a.elementLabel(PresetTypes.Preset.SciFi, PresetTypes.Element.Ice), "cryo");
        assertEq(a.elementLabel(PresetTypes.Preset.SciFi, PresetTypes.Element.Shock), "ion");
        assertEq(a.elementLabel(PresetTypes.Preset.SciFi, PresetTypes.Element.Holy), "photon");
        assertEq(a.elementLabel(PresetTypes.Preset.SciFi, PresetTypes.Element.Unholy), "void");
    }

    function test_ElementLabel_CyberpunkVocabulary() public {
        PresetWeaponAdapter a = new PresetWeaponAdapter(
            FANTASY_WEAPON,
            SCIFI_WEAPON,
            PresetTypes.Preset.Fantasy,
            PresetTypes.Preset.SciFi
        );
        assertEq(a.elementLabel(PresetTypes.Preset.Cyberpunk, PresetTypes.Element.Fire), "incendiary");
        assertEq(a.elementLabel(PresetTypes.Preset.Cyberpunk, PresetTypes.Element.Ice), "cryogenic");
        assertEq(a.elementLabel(PresetTypes.Preset.Cyberpunk, PresetTypes.Element.Shock), "emp");
        assertEq(a.elementLabel(PresetTypes.Preset.Cyberpunk, PresetTypes.Element.Holy), "laser");
        assertEq(a.elementLabel(PresetTypes.Preset.Cyberpunk, PresetTypes.Element.Unholy), "nano");
    }

    // --------------------------------------------------------------
    // SciFi ↔ Cyberpunk: also exercises the cyberpunk delta.
    // --------------------------------------------------------------
    function test_ScifiToCyberpunk_AppliesDelta() public {
        PresetWeaponAdapter a = new PresetWeaponAdapter(
            SCIFI_WEAPON,
            CYBERPUNK_WEAPON,
            PresetTypes.Preset.SciFi,
            PresetTypes.Preset.Cyberpunk
        );
        bytes memory ext = _ext(PresetTypes.DamageDie.D10, int8(2), int8(1), PresetTypes.Element.Unholy);
        (, bytes memory outExt) = a.translate(1, _attrs(SeedTypes.Tier.T3, SCIFI_WEAPON), ext);

        PresetTypes.WeaponExt memory dst = abi.decode(outExt, (PresetTypes.WeaponExt));
        assertEq(uint8(dst.damageDie), uint8(PresetTypes.DamageDie.D8));
        assertEq(dst.attackBonus, int8(3));
    }
}
