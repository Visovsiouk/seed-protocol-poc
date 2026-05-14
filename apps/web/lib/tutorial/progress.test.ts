import { describe, expect, it } from "vitest";
import { deriveTutorialProgress, emptyTutorialProgress } from "./progress";
import type { BossClearEvent } from "./progress";

const REALM_A = "0x000000000000000000000000000000000000000a" as `0x${string}`;
const REALM_B = "0x000000000000000000000000000000000000000b" as `0x${string}`;
const REALM_C = "0x000000000000000000000000000000000000000c" as `0x${string}`;

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

describe("deriveTutorialProgress", () => {
  it("empty events → Act 1, 0 clears, not eligible", () => {
    const p = deriveTutorialProgress({ hasSeed: false, events: [] });
    expect(p.act).toBe(1);
    expect(p.distinctClears).toBe(0);
    expect(p.eligibleForSeed).toBe(false);
  });

  it("one realm cleared → Act 2", () => {
    const p = deriveTutorialProgress({ hasSeed: false, events: [ev(REALM_A, 100)] });
    expect(p.act).toBe(2);
    expect(p.distinctClears).toBe(1);
  });

  it("two distinct realms → Act 3", () => {
    const p = deriveTutorialProgress({
      hasSeed: false,
      events: [ev(REALM_A, 100), ev(REALM_B, 200)],
    });
    expect(p.act).toBe(3);
    expect(p.distinctClears).toBe(2);
  });

  it("three distinct realms → Act 4, eligible for Seed", () => {
    const p = deriveTutorialProgress({
      hasSeed: false,
      events: [ev(REALM_A, 100), ev(REALM_B, 200), ev(REALM_C, 300)],
    });
    expect(p.act).toBe(4);
    expect(p.eligibleForSeed).toBe(true);
  });

  it("Seed owned → Act 5 regardless of clear count", () => {
    const p = deriveTutorialProgress({ hasSeed: true, events: [] });
    expect(p.act).toBe(5);
    expect(p.eligibleForSeed).toBe(false);
  });

  it("dedupes multiple clears of the same realm", () => {
    const p = deriveTutorialProgress({
      hasSeed: false,
      events: [ev(REALM_A, 100), ev(REALM_A, 200), ev(REALM_A, 300)],
    });
    expect(p.distinctClears).toBe(1);
    expect(p.act).toBe(2);
  });

  it("cleared list is sorted ascending by ts", () => {
    const p = deriveTutorialProgress({
      hasSeed: false,
      events: [ev(REALM_B, 300), ev(REALM_A, 100), ev(REALM_C, 200)],
    });
    expect(p.cleared.map((c) => c.realm)).toEqual([REALM_A, REALM_C, REALM_B]);
  });

  it("caps distinctClears at 3 (further clears don't bump it)", () => {
    const REALM_D = "0x000000000000000000000000000000000000000d" as `0x${string}`;
    const p = deriveTutorialProgress({
      hasSeed: false,
      events: [ev(REALM_A, 100), ev(REALM_B, 200), ev(REALM_C, 300), ev(REALM_D, 400)],
    });
    expect(p.distinctClears).toBe(3);
    expect(p.act).toBe(4);
  });
});

describe("emptyTutorialProgress", () => {
  it("matches the no-data state", () => {
    expect(emptyTutorialProgress()).toEqual(deriveTutorialProgress({ hasSeed: false, events: [] }));
  });
});
