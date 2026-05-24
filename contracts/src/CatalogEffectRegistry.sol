// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  CatalogEffectRegistry
/// @notice Hard on-chain commitment of `schemaId → catalog effect names`.
///
///         The PoC's off-chain engine recognises nine "catalog effects"
///         (lifesteal, armor_pierce, crit_chance, multi_hit, bleed,
///         regen, thorns, dodge_chance, damage_reduction). A catalog
///         effect is the *kind* of bonus a drop can roll — the rolled
///         numeric value still lives in the per-mint metadata URI.
///
///         The sister-repo `EcosystemTemplate` doesn't expose a
///         schema-extension hook for this — the `SchemaField` layout it
///         stores per schema is element/weaponType/etc, with no "effects"
///         field. This registry sits beside the SchemaRegistry and
///         carries that mapping as a typed view rather than as an opaque
///         metadataURI blob.
///
///         Effect names are right-padded UTF-8 in `bytes32`, matching
///         the convention `SchemaField.name` already uses
///         (see `apps/web/lib/contracts/schemas.ts`'s `stringToHex(name,
///         { size: 32 })` helper).
///
///         Writes are owner-gated (the bring-up admin). Reads are
///         permissionless and pure.
contract CatalogEffectRegistry {
    address public owner;

    /// schemaId → ordered list of effect names (bytes32 right-padded UTF-8).
    /// Length capped at MAX_EFFECTS by `setEffects`. Empty array on
    /// unset ids — no revert (matches the "schema with no catalog
    /// effects declared" reading).
    mapping(uint256 => bytes32[]) private _effects;

    /// Per-schema hard cap. The engine's loot roller + validator
    /// expect ≤ 2 effects per schema today; we lift to 4 to leave room
    /// for future schemas that bundle a flavor pair without redeploying.
    uint256 public constant MAX_EFFECTS = 4;

    event EffectsSet(uint256 indexed schemaId, bytes32[] names);
    event OwnerTransferred(address indexed prev, address indexed next);

    error NotOwner();
    error TooManyEffects(uint256 got, uint256 max);
    error DuplicateEffect(bytes32 name);
    error ZeroOwner();

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert ZeroOwner();
        owner = initialOwner;
        emit OwnerTransferred(address(0), initialOwner);
    }

    /// @notice Replace the effect list for `schemaId` with `names`.
    /// @dev    Whole-list replacement. Pass an empty array to clear.
    function setEffects(uint256 schemaId, bytes32[] calldata names) external {
        if (msg.sender != owner) revert NotOwner();
        if (names.length > MAX_EFFECTS) revert TooManyEffects(names.length, MAX_EFFECTS);
        // Reject duplicates: off-chain effect values stack by name, so
        // declaring "bleed" twice would silently mean "double bleed".
        // O(n^2) but n ≤ MAX_EFFECTS = 4.
        for (uint256 i = 0; i < names.length; i++) {
            for (uint256 j = i + 1; j < names.length; j++) {
                if (names[i] == names[j]) revert DuplicateEffect(names[i]);
            }
        }
        _effects[schemaId] = names;
        emit EffectsSet(schemaId, names);
    }

    /// @notice Return the declared effect names for `schemaId`. Empty
    ///         array if none have been set.
    function effectsOf(uint256 schemaId) external view returns (bytes32[] memory) {
        return _effects[schemaId];
    }

    /// @notice Transfer admin ownership. The new owner can immediately
    ///         call `setEffects`; the old owner cannot.
    function transferOwnership(address next) external {
        if (msg.sender != owner) revert NotOwner();
        if (next == address(0)) revert ZeroOwner();
        emit OwnerTransferred(owner, next);
        owner = next;
    }
}
