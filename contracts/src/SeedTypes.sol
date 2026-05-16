// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  SeedTypes
/// @notice Local mirror of the Seed Protocol type library, scoped to what
///         the PoC adapters actually consume. The upstream lives at
///         seed-protocol/src/SeedTypes.sol and the field set here is a
///         strict subset — keep them in sync if upstream changes the Tier
///         enum or CoreAttributes struct.
library SeedTypes {
    enum Tier {T1, T2, T3, T4, T5}

    enum FieldType {Uint, Int, String, Bool, Address, Bytes}

    struct SchemaField {
        bytes32 name;
        FieldType fieldType;
        bool required;
    }

    struct CoreAttributes {
        Tier tier;
        uint256 extensionSchemaId;
        string metadataURI;
    }
}
