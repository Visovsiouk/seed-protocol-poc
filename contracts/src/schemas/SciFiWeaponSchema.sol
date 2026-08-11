// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SeedTypes} from "seed-protocol/SeedTypes.sol";
import {DamageDie} from "../DamageDie.sol";

/// @title  SciFiWeaponSchema
/// @notice The Sci-Fi realm's native weapon schema. Element vocabulary
///         is the space-opera lexicon (plasma, cryo, ion, photon,
///         void). WeaponType vocabulary is the matching firearms /
///         emitter set (cannon, pistol, rifle, beam, railgun). Index
///         parity with the other weapon schemas is a PoC convenience
///         (1:1 archetype lanes) — names are native, no aliasing.
library SciFiWeaponSchema {
    enum Element {None, Plasma, Cryo, Ion, Photon, Void}
    enum WeaponType {None, Cannon, Pistol, Rifle, Beam, Railgun}

    struct Ext {
        DamageDie.Die damageDie;
        int8 attackBonus;
        int8 damageBonus;
        Element element;
        WeaponType weaponType;
    }

    function elementLabel(Element e) internal pure returns (string memory) {
        if (e == Element.None) return "none";
        if (e == Element.Plasma) return "plasma";
        if (e == Element.Cryo) return "cryo";
        if (e == Element.Ion) return "ion";
        if (e == Element.Photon) return "photon";
        return "void";
    }

    function typeLabel(WeaponType t) internal pure returns (string memory) {
        if (t == WeaponType.None) return "none";
        if (t == WeaponType.Cannon) return "cannon";
        if (t == WeaponType.Pistol) return "pistol";
        if (t == WeaponType.Rifle) return "rifle";
        if (t == WeaponType.Beam) return "beam";
        return "railgun";
    }

    function name(WeaponType t, SeedTypes.Tier tier) internal pure returns (string memory) {
        if (t == WeaponType.Cannon) {
            if (tier == SeedTypes.Tier.T1) return "Heavy Iron";
            if (tier == SeedTypes.Tier.T2) return "Slugger";
            if (tier == SeedTypes.Tier.T3) return "Pulse Cannon";
            if (tier == SeedTypes.Tier.T4) return "Mass Driver";
            return "Singularity Lance";
        }
        if (t == WeaponType.Pistol) {
            if (tier == SeedTypes.Tier.T1) return "Hold-out";
            if (tier == SeedTypes.Tier.T2) return "Sidearm";
            if (tier == SeedTypes.Tier.T3) return "Service Pistol";
            if (tier == SeedTypes.Tier.T4) return "Coil Pistol";
            return "Annihilator";
        }
        if (t == WeaponType.Rifle) {
            if (tier == SeedTypes.Tier.T1) return "Carbine";
            if (tier == SeedTypes.Tier.T2) return "Service Rifle";
            if (tier == SeedTypes.Tier.T3) return "Pulse Rifle";
            if (tier == SeedTypes.Tier.T4) return "Coil Rifle";
            return "Nova Rifle";
        }
        if (t == WeaponType.Beam) {
            if (tier == SeedTypes.Tier.T1) return "Beam Emitter";
            if (tier == SeedTypes.Tier.T2) return "Lance Emitter";
            if (tier == SeedTypes.Tier.T3) return "Phase Beam";
            if (tier == SeedTypes.Tier.T4) return "Photon Lance";
            return "Sunspear";
        }
        if (t == WeaponType.Railgun) {
            if (tier == SeedTypes.Tier.T1) return "Coil-shot";
            if (tier == SeedTypes.Tier.T2) return "Mag-Spike";
            if (tier == SeedTypes.Tier.T3) return "Rail Spike";
            if (tier == SeedTypes.Tier.T4) return "Mass Rail";
            return "Voidrail";
        }
        return "";
    }
}
