// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  PresetTypes
/// @notice Shared enums + wire formats used by the PoC adapters. Pulled
///         out so both `PresetWeaponAdapter` and `PresetArmorAdapter` can
///         share the same canonical `Preset` and `Element` enums, and so
///         the off-chain seeder/encoder can `abi.decode` against a single
///         source of truth.
library PresetTypes {
    /// @notice The three PoC realms. Cast values map onto the off-chain
    ///         `Preset` union in the same order: fantasy=0, scifi=1, cyberpunk=2.
    enum Preset {Fantasy, SciFi, Cyberpunk}

    /// @notice Canonical element enum mirroring the off-chain engine
    ///         (`apps/web/lib/engine/types.ts`). Adapters translate
    ///         preset-specific aliases (Sci-Fi "plasma", Cyberpunk
    ///         "incendiary") onto the same numeric value the engine reads.
    ///         Order must match the off-chain `ELEMENTS` array so the
    ///         decoded numeric round-trips through metadata-as-truth.
    enum Element {None, Fire, Ice, Shock, Holy, Unholy}

    /// @notice Damage die steps. The cyberpunk weapon rebalance shifts the
    ///         die down one step (D8 → D6) and compensates with attack bonus.
    enum DamageDie {D4, D6, D8, D10, D12}

    /// @notice ABI-encoded layout of a weapon's extension data on the wire.
    ///         Adapters decode this from `IAdapter.translate(...).extensionData`
    ///         and emit the same layout for the target schema.
    struct WeaponExt {
        DamageDie damageDie;
        int8 attackBonus;
        int8 damageBonus;
        Element element;
    }

    /// @notice ABI-encoded layout of an armor's extension data on the wire.
    struct ArmorExt {
        int8 acBonus;
        int8 hpBonus;
        Element resistElement;
    }
}
