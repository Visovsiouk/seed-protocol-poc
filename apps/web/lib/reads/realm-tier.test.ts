import { describe, expect, it } from "vitest";
import { playerRealmMaxTier, realmTierProgress } from "./realm-tier";

describe("playerRealmMaxTier", () => {
  it("starts every realm at T3", () => {
    expect(playerRealmMaxTier(0)).toBe(3);
  });

  it("stays T3 up to 19 distinct clearers", () => {
    expect(playerRealmMaxTier(1)).toBe(3);
    expect(playerRealmMaxTier(19)).toBe(3);
  });

  it("reaches T4 at 20 distinct clearers", () => {
    expect(playerRealmMaxTier(20)).toBe(4);
    expect(playerRealmMaxTier(49)).toBe(4);
  });

  it("reaches T5 at 50 distinct clearers", () => {
    expect(playerRealmMaxTier(50)).toBe(5);
    expect(playerRealmMaxTier(1000)).toBe(5);
  });
});

describe("realmTierProgress", () => {
  it("points a fresh realm at the T4 threshold", () => {
    expect(realmTierProgress(0)).toEqual({
      maxTier: 3,
      distinctClearers: 0,
      nextTierAt: 20,
    });
  });

  it("points a T4 realm at the T5 threshold", () => {
    expect(realmTierProgress(20)).toEqual({
      maxTier: 4,
      distinctClearers: 20,
      nextTierAt: 50,
    });
    expect(realmTierProgress(49).nextTierAt).toBe(50);
  });

  it("reports no next threshold once capped at T5", () => {
    expect(realmTierProgress(50)).toEqual({
      maxTier: 5,
      distinctClearers: 50,
      nextTierAt: null,
    });
  });
});
