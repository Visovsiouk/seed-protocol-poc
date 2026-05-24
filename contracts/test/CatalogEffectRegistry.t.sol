// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {CatalogEffectRegistry} from "../src/CatalogEffectRegistry.sol";

/// @title  CatalogEffectRegistryTest
/// @notice Covers:
///         - constructor sets owner + emits OwnerTransferred(0, owner)
///         - constructor rejects zero owner
///         - setEffects writes; effectsOf reads identically
///         - setEffects from non-owner reverts NotOwner
///         - setEffects above MAX_EFFECTS reverts TooManyEffects
///         - setEffects with duplicates reverts DuplicateEffect
///         - setEffects overwrites prior entries (whole-list replacement)
///         - setEffects with empty array clears prior entries
///         - transferOwnership flips owner; old owner can no longer write
///         - transferOwnership rejects zero address
///         - effectsOf on unset schemaId returns empty array (no revert)
contract CatalogEffectRegistryTest is Test {
    CatalogEffectRegistry registry;

    address constant OWNER = address(0xA11CE);
    address constant OTHER = address(0xB0B);
    address constant NEXT_OWNER = address(0xC0DE);

    // Right-padded UTF-8 encodings of the off-chain effect names.
    // (Equivalent to viem's stringToHex(name, { size: 32 }).)
    bytes32 constant BLEED = bytes32(bytes("bleed"));
    bytes32 constant REGEN = bytes32(bytes("regen"));
    bytes32 constant THORNS = bytes32(bytes("thorns"));
    bytes32 constant CRIT = bytes32(bytes("crit_chance"));
    bytes32 constant DODGE = bytes32(bytes("dodge_chance"));

    event EffectsSet(uint256 indexed schemaId, bytes32[] names);
    event OwnerTransferred(address indexed prev, address indexed next);

    function setUp() public {
        vm.expectEmit(true, true, false, true);
        emit OwnerTransferred(address(0), OWNER);
        registry = new CatalogEffectRegistry(OWNER);
    }

    function test_constructor_setsOwner() public view {
        assertEq(registry.owner(), OWNER, "owner mismatch");
    }

    function test_constructor_rejectsZeroOwner() public {
        vm.expectRevert(CatalogEffectRegistry.ZeroOwner.selector);
        new CatalogEffectRegistry(address(0));
    }

    function test_setEffects_writesAndReads() public {
        bytes32[] memory names = new bytes32[](2);
        names[0] = BLEED;
        names[1] = CRIT;

        vm.expectEmit(true, false, false, true);
        emit EffectsSet(42, names);
        vm.prank(OWNER);
        registry.setEffects(42, names);

        bytes32[] memory read = registry.effectsOf(42);
        assertEq(read.length, 2, "len");
        assertEq(read[0], BLEED, "[0]");
        assertEq(read[1], CRIT, "[1]");
    }

    function test_setEffects_nonOwnerReverts() public {
        bytes32[] memory names = new bytes32[](1);
        names[0] = BLEED;
        vm.expectRevert(CatalogEffectRegistry.NotOwner.selector);
        vm.prank(OTHER);
        registry.setEffects(1, names);
    }

    function test_setEffects_tooManyReverts() public {
        bytes32[] memory names = new bytes32[](5);
        names[0] = BLEED;
        names[1] = REGEN;
        names[2] = THORNS;
        names[3] = CRIT;
        names[4] = DODGE;
        vm.expectRevert(
            abi.encodeWithSelector(
                CatalogEffectRegistry.TooManyEffects.selector,
                uint256(5),
                uint256(4)
            )
        );
        vm.prank(OWNER);
        registry.setEffects(1, names);
    }

    function test_setEffects_duplicateReverts() public {
        bytes32[] memory names = new bytes32[](3);
        names[0] = BLEED;
        names[1] = CRIT;
        names[2] = BLEED;
        vm.expectRevert(
            abi.encodeWithSelector(
                CatalogEffectRegistry.DuplicateEffect.selector,
                BLEED
            )
        );
        vm.prank(OWNER);
        registry.setEffects(1, names);
    }

    function test_setEffects_overwrites() public {
        bytes32[] memory first = new bytes32[](2);
        first[0] = BLEED;
        first[1] = CRIT;
        vm.prank(OWNER);
        registry.setEffects(7, first);

        bytes32[] memory second = new bytes32[](1);
        second[0] = REGEN;
        vm.prank(OWNER);
        registry.setEffects(7, second);

        bytes32[] memory read = registry.effectsOf(7);
        assertEq(read.length, 1, "overwrite len");
        assertEq(read[0], REGEN, "overwrite [0]");
    }

    function test_setEffects_emptyClears() public {
        bytes32[] memory pre = new bytes32[](1);
        pre[0] = BLEED;
        vm.prank(OWNER);
        registry.setEffects(9, pre);
        assertEq(registry.effectsOf(9).length, 1, "pre-clear");

        bytes32[] memory empty = new bytes32[](0);
        vm.prank(OWNER);
        registry.setEffects(9, empty);
        assertEq(registry.effectsOf(9).length, 0, "post-clear");
    }

    function test_transferOwnership_flipsAndLocksOldOwner() public {
        vm.expectEmit(true, true, false, true);
        emit OwnerTransferred(OWNER, NEXT_OWNER);
        vm.prank(OWNER);
        registry.transferOwnership(NEXT_OWNER);
        assertEq(registry.owner(), NEXT_OWNER, "new owner");

        bytes32[] memory names = new bytes32[](1);
        names[0] = BLEED;
        // Old owner now locked out.
        vm.expectRevert(CatalogEffectRegistry.NotOwner.selector);
        vm.prank(OWNER);
        registry.setEffects(1, names);
        // New owner can write.
        vm.prank(NEXT_OWNER);
        registry.setEffects(1, names);
        assertEq(registry.effectsOf(1).length, 1, "new owner write");
    }

    function test_transferOwnership_rejectsZero() public {
        vm.expectRevert(CatalogEffectRegistry.ZeroOwner.selector);
        vm.prank(OWNER);
        registry.transferOwnership(address(0));
    }

    function test_transferOwnership_nonOwnerReverts() public {
        vm.expectRevert(CatalogEffectRegistry.NotOwner.selector);
        vm.prank(OTHER);
        registry.transferOwnership(NEXT_OWNER);
    }

    function test_effectsOf_unsetReturnsEmpty() public view {
        bytes32[] memory read = registry.effectsOf(99999);
        assertEq(read.length, 0, "unset must be empty");
    }
}
