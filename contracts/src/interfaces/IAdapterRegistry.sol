// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  IAdapterRegistry
/// @notice Local mirror of seed-protocol/src/interfaces/IAdapterRegistry.sol.
///         Only the surface the PoC seeder calls (`registerAdapter`,
///         `getAdapters`) is mirrored; other catalog views can be added if
///         a later step needs them.
interface IAdapterRegistry {
    struct Adapter {
        address adapterContract;
        uint256 sourceSchemaId;
        uint256 targetSchemaId;
        address registeredBy;
        uint64 registeredAt;
    }

    event AdapterRegistered(
        uint256 indexed sourceSchemaId,
        uint256 indexed targetSchemaId,
        address indexed adapterContract,
        address registeredBy
    );

    function registerAdapter(
        address adapterContract,
        uint256 sourceSchemaId,
        uint256 targetSchemaId
    ) external;

    function getAdapters(uint256 sourceSchemaId) external view returns (Adapter[] memory);
}
