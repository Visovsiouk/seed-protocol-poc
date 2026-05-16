// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SeedTypes} from "../SeedTypes.sol";

/// @title  IAdapter
/// @notice Local mirror of seed-protocol/src/interfaces/IAdapter.sol. The
///         PoC's adapter implementations declare this exact surface so the
///         on-chain AdapterRegistry registration is real — anyone reading
///         a registered adapter can call `translate` and `schemaMapping`
///         against the canonical interface.
interface IAdapter {
    function translate(
        uint256 tokenId,
        SeedTypes.CoreAttributes calldata sourceAttrs,
        bytes calldata extensionData
    ) external view returns (SeedTypes.CoreAttributes memory, bytes memory);

    function schemaMapping() external view returns (uint256, uint256);
}
