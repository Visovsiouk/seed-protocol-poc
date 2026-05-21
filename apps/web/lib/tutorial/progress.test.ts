import { describe, expect, it } from "vitest";
import { deriveTutorialProgress, emptyTutorialProgress } from "./progress";
import type { BossClearEvent } from "./progress";

const REALM_A = "0x000000000000000000000000000000000000000a" as `0x${string}`;
const REALM_B = "0x000000000000000000000000000000000000000b" as `0x${string}`;
const REALM_C = "0x000000000000000000000000000000000000000c" as `0x${string}`;
const REALM_D = "0x000000000000000000000000000000000000000d" as `0x${string}`;
const REALM_E = "0x000000000000000000000000000000000000000e" as `0x${string}`;
const REALM_F = "0x000000000000000000000000000000000000000f" as `0x${string}`;
const REALM_G = "0x0000000000000000000000000000000000000010" as `0x${string}`;

// The three starters used by most cases. Tests for the second-tier
// gate add community-realm clears on top.
const STARTERS = new Set([REALM_A, REALM_B, REALM_C].map((a) => a.toLowerCase()));

function ev(realm: `0x${string}`, ts: number, blockNumber = 1n): BossClearEvent {
  return {
    realm,
    preset: "fantasy",
    finalHp: 10,
    turns: 7,
    ts,
    blockNumber,
    logIndex: 0,
  };
}

describe("deriveTutorialProgress — first tier (starter clears)", () => {
  it("empty events → Act 1, 0 clears, not eligible", () => {
    const p = deriveTutorialProgress({
      hasSeed: false,
      events: [],
      starterRealmAddresses: STARTERS,
      communityRealmCount: 0,
    });
    expect(p.act).toBe(1);
    expect(p.starterClears).toBe(0);
    expect(p.distinctClears).toBe(0);
    expect(p.eligibleForSeed).toBe(false);
  });

  it("one starter cleared → Act 2", () => {
    const p = deriveTutorialProgress({
      hasSeed: false,
      events: [ev(REALM_A, 100)],
      starterRealmAddresses: STARTERS,
      communityRealmCount: 0,
    });
    expect(p.act).toBe(2);
    expect(p.starterClears).toBe(1);
  });

  it("two starters cleared → Act 3", () => {
    const p = deriveTutorialProgress({
      hasSeed: false,
      events: [ev(REALM_A, 100), ev(REALM_B, 200)],
      starterRealmAddresses: STARTERS,
      communityRealmCount: 0,
    });
    expect(p.act).toBe(3);
    expect(p.starterClears).toBe(2);
  });

  it("three starters cleared with 0 community realms → Act 4, eligible immediately", () => {
    const p = deriveTutorialProgress({
      hasSeed: false,
      events: [ev(REALM_A, 100), ev(REALM_B, 200), ev(REALM_C, 300)],
      starterRealmAddresses: STARTERS,
      communityRealmCount: 0,
    });
    expect(p.act).toBe(4);
    expect(p.eligibleForSeed).toBe(true);
  });

  it("Seed owned → Act 5 regardless of clear count", () => {
    const p = deriveTutorialProgress({
      hasSeed: true,
      events: [],
      starterRealmAddresses: STARTERS,
    });
    expect(p.act).toBe(5);
    expect(p.eligibleForSeed).toBe(false);
  });

  it("dedupes multiple clears of the same realm", () => {
    const p = deriveTutorialProgress({
      hasSeed: false,
      events: [ev(REALM_A, 100), ev(REALM_A, 200), ev(REALM_A, 300)],
      starterRealmAddresses: STARTERS,
    });
    expect(p.starterClears).toBe(1);
    expect(p.act).toBe(2);
  });

  it("cleared list is sorted ascending by ts", () => {
    const p = deriveTutorialProgress({
      hasSeed: false,
      events: [ev(REALM_B, 300), ev(REALM_A, 100), ev(REALM_C, 200)],
      starterRealmAddresses: STARTERS,
    });
    expect(p.cleared.map((c) => c.realm)).toEqual([REALM_A, REALM_C, REALM_B]);
  });

  it("caps starterClears at 3 — extra starters never push above 3", () => {
    const p = deriveTutorialProgress({
      hasSeed: false,
      events: [ev(REALM_A, 100), ev(REALM_B, 200), ev(REALM_C, 300)],
      starterRealmAddresses: STARTERS,
      communityRealmCount: 0,
    });
    expect(p.starterClears).toBe(3);
    expect(p.act).toBe(4);
  });
});

describe("deriveTutorialProgress — second tier (community-realm gate)", () => {
  it("3 starters + 1 community realm exists + 0 community clears → not eligible", () => {
    const p = deriveTutorialProgress({
      hasSeed: false,
      events: [ev(REALM_A, 100), ev(REALM_B, 200), ev(REALM_C, 300)],
      starterRealmAddresses: STARTERS,
      communityRealmCount: 1,
    });
    expect(p.act).toBe(4);
    expect(p.eligibleForSeed).toBe(false);
    expect(p.communityClears).toBe(0);
    expect(p.communityRealmCount).toBe(1);
  });

  it("3 starters + 1 community realm + 1 community clear → eligible", () => {
    const p = deriveTutorialProgress({
      hasSeed: false,
      events: [
        ev(REALM_A, 100),
        ev(REALM_B, 200),
        ev(REALM_C, 300),
        ev(REALM_D, 400),
      ],
      starterRealmAddresses: STARTERS,
      communityRealmCount: 1,
    });
    expect(p.eligibleForSeed).toBe(true);
    expect(p.communityClears).toBe(1);
  });

  it("3 starters + 2 community realms + 1 community clear → not eligible (needs 2)", () => {
    const p = deriveTutorialProgress({
      hasSeed: false,
      events: [
        ev(REALM_A, 100),
        ev(REALM_B, 200),
        ev(REALM_C, 300),
        ev(REALM_D, 400),
      ],
      starterRealmAddresses: STARTERS,
      communityRealmCount: 2,
    });
    expect(p.eligibleForSeed).toBe(false);
  });

  it("3 starters + 2 community realms + 2 community clears → eligible", () => {
    const p = deriveTutorialProgress({
      hasSeed: false,
      events: [
        ev(REALM_A, 100),
        ev(REALM_B, 200),
        ev(REALM_C, 300),
        ev(REALM_D, 400),
        ev(REALM_E, 500),
      ],
      starterRealmAddresses: STARTERS,
      communityRealmCount: 2,
    });
    expect(p.eligibleForSeed).toBe(true);
  });

  it("3 starters + 3 community realms + 3 community clears → eligible at the cap", () => {
    const p = deriveTutorialProgress({
      hasSeed: false,
      events: [
        ev(REALM_A, 100),
        ev(REALM_B, 200),
        ev(REALM_C, 300),
        ev(REALM_D, 400),
        ev(REALM_E, 500),
        ev(REALM_F, 600),
      ],
      starterRealmAddresses: STARTERS,
      communityRealmCount: 3,
    });
    expect(p.eligibleForSeed).toBe(true);
    expect(p.communityClears).toBe(3);
  });

  it("3 starters + 7 community realms + 3 community clears → still eligible (cap holds)", () => {
    const p = deriveTutorialProgress({
      hasSeed: false,
      events: [
        ev(REALM_A, 100),
        ev(REALM_B, 200),
        ev(REALM_C, 300),
        ev(REALM_D, 400),
        ev(REALM_E, 500),
        ev(REALM_F, 600),
      ],
      starterRealmAddresses: STARTERS,
      communityRealmCount: 7,
    });
    expect(p.eligibleForSeed).toBe(true);
  });

  it("3 starters + 7 community realms + 2 community clears → not eligible (cap is 3)", () => {
    const p = deriveTutorialProgress({
      hasSeed: false,
      events: [
        ev(REALM_A, 100),
        ev(REALM_B, 200),
        ev(REALM_C, 300),
        ev(REALM_D, 400),
        ev(REALM_E, 500),
      ],
      starterRealmAddresses: STARTERS,
      communityRealmCount: 7,
    });
    expect(p.eligibleForSeed).toBe(false);
    expect(p.communityClears).toBe(2);
  });

  it("communityClears is capped at 3 regardless of how many a player cleared", () => {
    const p = deriveTutorialProgress({
      hasSeed: false,
      events: [
        ev(REALM_A, 100),
        ev(REALM_B, 200),
        ev(REALM_C, 300),
        ev(REALM_D, 400),
        ev(REALM_E, 500),
        ev(REALM_F, 600),
        ev(REALM_G, 700),
      ],
      starterRealmAddresses: STARTERS,
      communityRealmCount: 4,
    });
    expect(p.communityClears).toBe(3);
  });
});

describe("emptyTutorialProgress", () => {
  it("matches the no-data state", () => {
    expect(emptyTutorialProgress()).toEqual(
      deriveTutorialProgress({ hasSeed: false, events: [] }),
    );
  });

  it("has zeroed community fields", () => {
    const e = emptyTutorialProgress();
    expect(e.starterClears).toBe(0);
    expect(e.communityClears).toBe(0);
    expect(e.communityRealmCount).toBe(0);
  });
});
