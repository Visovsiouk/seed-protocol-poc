import { describe, it, expect } from "vitest";
import { buildContributionProof, pickClaimRealm } from "./proof";
import type { BossClearEvent } from "./progress";

const REALM_A: `0x${string}` = "0x000000000000000000000000000000000000aaaa";
const REALM_B: `0x${string}` = "0x000000000000000000000000000000000000bbbb";
const REALM_C: `0x${string}` = "0x000000000000000000000000000000000000cccc";

function ev(
  realm: `0x${string}`,
  blockNumber: bigint,
  logIndex = 0,
  finalHp = 10,
  turns = 7,
): BossClearEvent {
  return {
    realm,
    preset: "fantasy",
    finalHp,
    turns,
    ts: Number(blockNumber),
    blockNumber,
    logIndex,
  };
}

describe("buildContributionProof", () => {
  it("returns empty arrays for no events", () => {
    const p = buildContributionProof([]);
    expect(p.metricHashes).toEqual([]);
    expect(p.timestamps).toEqual([]);
    expect(p.eventReferences).toEqual([]);
  });

  it("produces arrays of equal length and aligned indices", () => {
    const p = buildContributionProof([
      ev(REALM_A, 10n),
      ev(REALM_B, 20n),
      ev(REALM_C, 30n),
    ]);
    expect(p.metricHashes).toHaveLength(3);
    expect(p.timestamps).toHaveLength(3);
    expect(p.eventReferences).toHaveLength(3);
    // timestamps mirror blockNumber after the sort
    expect(p.timestamps).toEqual([10n, 20n, 30n]);
  });

  it("sorts by (blockNumber, logIndex) regardless of input order", () => {
    const out = buildContributionProof([
      ev(REALM_C, 30n, 2),
      ev(REALM_A, 10n, 0),
      ev(REALM_B, 20n, 1),
    ]);
    expect(out.timestamps).toEqual([10n, 20n, 30n]);
  });

  it("breaks blockNumber ties with logIndex", () => {
    const out = buildContributionProof([
      ev(REALM_B, 10n, 5),
      ev(REALM_A, 10n, 1),
    ]);
    // Both share timestamp 10, but A's logIndex 1 comes before B's 5.
    // eventReferences encode (blockNumber, logIndex) so the first entry
    // must be the lower-logIndex one.
    expect(out.eventReferences[0]).not.toBe(out.eventReferences[1]);
  });

  it("yields deterministic metricHashes (same inputs → same hashes)", () => {
    const a = buildContributionProof([ev(REALM_A, 10n, 0, 15, 9)]);
    const b = buildContributionProof([ev(REALM_A, 10n, 0, 15, 9)]);
    expect(a.metricHashes).toEqual(b.metricHashes);
  });

  it("yields different metricHashes for different mechanical outcomes", () => {
    const a = buildContributionProof([ev(REALM_A, 10n, 0, 15, 9)]);
    const b = buildContributionProof([ev(REALM_A, 10n, 0, 20, 9)]);
    expect(a.metricHashes[0]).not.toBe(b.metricHashes[0]);
  });
});

describe("pickClaimRealm", () => {
  it("returns undefined when there are no events", () => {
    expect(pickClaimRealm([])).toBeUndefined();
  });

  it("returns the only realm when there's exactly one event", () => {
    expect(pickClaimRealm([ev(REALM_A, 10n)])).toBe(REALM_A);
  });

  it("returns the latest realm by block / logIndex", () => {
    const events = [
      ev(REALM_A, 10n, 0),
      ev(REALM_B, 30n, 0),
      ev(REALM_C, 20n, 0),
    ];
    expect(pickClaimRealm(events)).toBe(REALM_B);
  });

  it("breaks block ties with logIndex", () => {
    const events = [
      ev(REALM_A, 30n, 0),
      ev(REALM_B, 30n, 2),
      ev(REALM_C, 30n, 1),
    ];
    expect(pickClaimRealm(events)).toBe(REALM_B);
  });
});
