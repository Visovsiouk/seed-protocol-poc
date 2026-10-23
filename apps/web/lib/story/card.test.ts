import { describe, expect, it } from "vitest";
import type { Preset } from "@/lib/engine/types";
import type { TutorialProgress } from "@/lib/tutorial/progress";
import { dueDateCard } from "./card";
import { REALM_ORDER } from "./progression";

/**
 * Same shape as `progression.test.ts`'s helper, but `cleared` matters here —
 * the card reads clear timestamps off it to date each stamp.
 */
function progressWith(
  clearedPresets: Preset[],
  overrides: Partial<TutorialProgress> = {},
): TutorialProgress {
  const cleared = clearedPresets.map((preset, i) => ({
    realm: `0x${String(i + 1).repeat(40)}` as `0x${string}`,
    preset,
    ts: 1_700_000_000 + i * 86_400,
  }));
  const starterClears = clearedPresets.length;
  return {
    hasSeed: false,
    cleared,
    starterClears,
    communityClears: 0,
    communityRealmCount: 0,
    distinctClears: starterClears,
    act: starterClears === 0 ? 1 : starterClears === 1 ? 2 : starterClears === 2 ? 3 : 4,
    eligibleForSeed: starterClears >= 3,
    ...overrides,
  };
}

describe("dueDateCard", () => {
  it("a fresh borrower: unsigned, nothing stamped, only the first page open", () => {
    const card = dueDateCard({ progress: progressWith([]), signed: false });

    expect(card.signed).toBe(false);
    expect(card.stampCount).toBe(0);
    expect(card.signetPressed).toBe(false);
    expect(card.stamps.map((s) => s.state)).toEqual(["open", "sealed", "sealed"]);
  });

  it("stamps follow the canonical play order, slotted 1..3", () => {
    const card = dueDateCard({ progress: progressWith([]), signed: true });
    expect(card.stamps.map((s) => s.preset)).toEqual([...REALM_ORDER]);
    expect(card.stamps.map((s) => s.slot)).toEqual([1, 2, 3]);
  });

  it("clearing a page stamps it and opens the next", () => {
    const card = dueDateCard({ progress: progressWith(["fantasy"]), signed: true });
    expect(card.stamps.map((s) => s.state)).toEqual(["stamped", "open", "sealed"]);
    expect(card.stampCount).toBe(1);
  });

  it("two down leaves only the last page sealed", () => {
    const card = dueDateCard({
      progress: progressWith(["fantasy", "cyberpunk"]),
      signed: true,
    });
    expect(card.stamps.map((s) => s.state)).toEqual(["stamped", "stamped", "open"]);
    expect(card.stampCount).toBe(2);
  });

  it("three stamps, and the signet is still unpressed until the Seed is held", () => {
    const progress = progressWith(["fantasy", "cyberpunk", "scifi"]);
    const card = dueDateCard({ progress, signed: true });

    expect(card.stamps.every((s) => s.state === "stamped")).toBe(true);
    expect(card.stampCount).toBe(3);
    // Earning the right to the signet and holding it are different beats —
    // the Altar sits between them.
    expect(card.signetPressed).toBe(false);
  });

  it("the signet reads as pressed once the Seed is held", () => {
    const card = dueDateCard({
      progress: progressWith(["fantasy", "cyberpunk", "scifi"], { hasSeed: true }),
      signed: true,
    });
    expect(card.signetPressed).toBe(true);
  });

  it("dates a stamp from the clear that earned it, and only a stamped one", () => {
    const progress = progressWith(["fantasy", "cyberpunk"]);
    const card = dueDateCard({ progress, signed: true });

    expect(card.stamps[0]!.ts).toBe(progress.cleared[0]!.ts);
    expect(card.stamps[1]!.ts).toBe(progress.cleared[1]!.ts);
    // An unstamped slot carries no date — there's nothing to date.
    expect(card.stamps[2]!.ts).toBeNull();
  });

  it("carries the canon page name on every slot", () => {
    const card = dueDateCard({ progress: progressWith([]), signed: false });
    expect(card.stamps.map((s) => s.page)).toEqual([
      "The Hollow Reach",
      "Black Ice District",
      "Drift Station Ker-7",
    ]);
  });

  it("the return column stays torn — that's why authorship is the only way on", () => {
    for (const presets of [[], ["fantasy"], ["fantasy", "cyberpunk", "scifi"]] as Preset[][]) {
      const card = dueDateCard({
        progress: progressWith(presets, { hasSeed: presets.length >= 3 }),
        signed: true,
      });
      expect(card.returnColumnTorn).toBe(true);
    }
  });

  it("passes `signed` through untouched — it is the caller's fact to own", () => {
    const progress = progressWith([]);
    expect(dueDateCard({ progress, signed: true }).signed).toBe(true);
    expect(dueDateCard({ progress, signed: false }).signed).toBe(false);
  });

  it("does not mutate the progress snapshot it was handed", () => {
    const progress = progressWith(["fantasy"]);
    const snapshot = JSON.stringify(progress);
    dueDateCard({ progress, signed: true });
    expect(JSON.stringify(progress)).toBe(snapshot);
  });

  it("tolerates a clear with no matching entry in `cleared`", () => {
    // `starterClears` is a count and `cleared` is the detail; a chain read can
    // land them out of step mid-refetch. The slot should still stamp, just
    // undated, rather than throwing in the dock.
    const progress = progressWith([], {
      starterClears: 1,
      cleared: [],
    });
    // lockStateFor reads `cleared`, so this stays "open" — the point is only
    // that nothing throws and the shape holds.
    const card = dueDateCard({ progress, signed: true });
    expect(card.stamps).toHaveLength(3);
    expect(card.stamps.every((s) => s.ts === null)).toBe(true);
  });
});
