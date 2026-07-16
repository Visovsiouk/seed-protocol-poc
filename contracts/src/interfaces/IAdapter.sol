// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SeedTypes} from "../SeedTypes.sol";

/// @title  IAdapter
/// @notice Local mirror of seed-protocol/src/interfaces/IAdapter.sol. The
///         PoC's adapter implementations declare this exact surface so the
///         on-chain AdapterRegistry registration is real — anyone reading
///         a registered adapter can call `translate` and `schemaMapping`
///         against the canonical interface.
/// @dev    Adapters are read-only translators — `translate` is `view` and
///         must be deterministic and side-effect-free. An adapter contract
///         is unaware of which ecosystems use it; activation is a separate,
///         owner-only decision made in each EcosystemTemplate. Discovery is
///         handled by the AdapterRegistry, which catalogs adapters by their
///         (sourceSchemaId, targetSchemaId) pair.
interface IAdapter {
    /// @notice Translates a foreign asset into the target schema's representation.
    /// @dev    The `extensionData` parameter is the asset's extension metadata
    ///         ABI-encoded for on-chain consumption; its layout MUST match the
    ///         source schema's extension struct (the adapter `abi.decode`s it
    ///         against that shape — a foreign layout produces garbage or a
    ///         revert). The returned `translatedExtensionData` is ABI-encoded
    ///         against the target schema's extension struct, and
    ///         `translatedAttrs.extensionSchemaId` is rewritten to the
    ///         adapter's target schema.
    /// @param tokenId                 The asset being translated. Provided so
    ///                                adapters can perform per-token logic if
    ///                                needed; the PoC adapters are stateless
    ///                                and ignore it.
    /// @param sourceAttrs             The asset's core attributes as stored in
    ///                                UniversalAsset under the source schema.
    /// @param extensionData           ABI-encoded extension metadata conforming
    ///                                to the source schema's extension struct.
    /// @return translatedAttrs        Core attributes rewritten for the target schema.
    /// @return translatedExtensionData ABI-encoded extension metadata conforming
    ///                                to the target schema's extension struct.
    function translate(
        uint256 tokenId,
        SeedTypes.CoreAttributes calldata sourceAttrs,
        bytes calldata extensionData
    ) external view returns (SeedTypes.CoreAttributes memory translatedAttrs, bytes memory translatedExtensionData);

    /// @notice Returns the schema pair this adapter handles.
    /// @dev    Must match the (sourceSchemaId, targetSchemaId) values the
    ///         adapter was registered under in the AdapterRegistry. Lets
    ///         registries, ecosystems, and frontends discover an adapter's
    ///         mapping without parsing the registry record.
    /// @return sourceSchemaId Schema the adapter translates from.
    /// @return targetSchemaId Schema the adapter translates into.
    function schemaMapping() external view returns (uint256 sourceSchemaId, uint256 targetSchemaId);
}
