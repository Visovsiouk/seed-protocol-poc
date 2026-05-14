import { describe, it, expect } from "vitest";
import {
  ZERO_ADDRESS,
  isStarterRealmDeployed,
  pickStarterRealm,
} from "./realm-picker";
import type { RealmSummary } from "@/lib/reads/types";

const REALM_A: `0x${string}` = "0x000000000000000000000000000000000000aaaa";
const REALM_B: `0x${string}` = "0x000000000000000000000000000000000000bbbb";
const OWNER: `0x${string}` = "0x000000000000000000000000000000000000c0c0";

function summary(addr: `0x${string}`, active: boolean): RealmSummary {
  return { address: addr, owner: OWNER, createdAt: 1n, active };
}

describe("isStarterRealmDeployed", () => {
  it("treats the zero address as not deployed", () => {
    expect(isStarterRealmDeployed(ZERO_ADDRESS)).toBe(false);
  });
  it("treats any non-zero address as deployed", () => {
    expect(isStarterRealmDeployed(REALM_A)).toBe(true);
  });
  it("ignores casing when comparing to zero", () => {
    expect(
      isStarterRealmDeployed(
        "0x0000000000000000000000000000000000000000" as `0x${string}`,
      ),
    ).toBe(false);
  });
});

describe("pickStarterRealm", () => {
  it("returns deployed=false for the zero-address case and no on-chain match", () => {
    const result = pickStarterRealm({
      preset: "fantasy",
      configuredAddress: ZERO_ADDRESS,
      realms: [summary(REALM_A, true)],
    });
    expect(result).toEqual({ onchain: undefined, deployed: false });
  });

  it("finds the matching on-chain summary by address (case-insensitive)", () => {
    const realms = [summary(REALM_A, true), summary(REALM_B, false)];
    const result = pickStarterRealm({
      preset: "scifi",
      configuredAddress: REALM_A.toUpperCase() as `0x${string}`,
      realms,
    });
    expect(result.deployed).toBe(true);
    expect(result.onchain).toEqual(summary(REALM_A, true));
  });

  it("returns deployed=true but no onchain summary when the configured realm isn't registered", () => {
    const result = pickStarterRealm({
      preset: "cyberpunk",
      configuredAddress: REALM_B,
      realms: [summary(REALM_A, true)],
    });
    expect(result.deployed).toBe(true);
    expect(result.onchain).toBeUndefined();
  });

  it("preserves the `active` flag of the matched realm so callers can compute readiness", () => {
    const result = pickStarterRealm({
      preset: "fantasy",
      configuredAddress: REALM_B,
      realms: [summary(REALM_B, false)],
    });
    expect(result.onchain?.active).toBe(false);
  });
});
