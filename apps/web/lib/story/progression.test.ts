import { describe, expect, it } from "vitest";
import type { Preset } from "@/lib/engine/types";
import type { TutorialProgress } from "@/lib/tutorial/progress";
import {
  REALM_ORDER,
  interstitialFor,
  lockStateFor,
  nextStarterFor,
} from "./progression";

// Build a minimal progress snapshot for the CTA-shape tests. `cleared`
// is irrelevant for `interstitialFor` (it reads only `starterClears`),
// so we don't synthesize realistic per-realm entries.
function progressWith(starterClears: number, overrides: Partial<TutorialProgress> = {}): TutorialProgress {
  return {
    hasSeed: false,
    cleared: [],
    starterClears,
    communityClears: 0,
    communityRealmCount: 0,
    distinctClears: starterClears,
    act: starterClears === 0 ? 1 : starterClears === 1 ? 2 : starterClears === 2 ? 3 : 4,
    eligibleForSeed: false,
    ...overrides,
  };
}

describe("REALM_ORDER", () => {
  it("is the locked Wave C walk: fantasy → cyberpunk → sci-fi", () => {
    expect(REALM_ORDER).toEqual(["fantasy", "cyberpunk", "scifi"]);
  });
});

describe("nextStarterFor", () => {
  it("hands off door by door", () => {
    expect(nextStarterFor(0)).toBe("fantasy");
    expect(nextStarterFor(1)).toBe("cyberpunk");
    expect(nextStarterFor(2)).toBe("scifi");
  });
  it("returns null after the arc — caller switches to the picker", () => {
    expect(nextStarterFor(3)).toBeNull();
    expect(nextStarterFor(7)).toBeNull();
  });
});

describe("interstitialFor — warp-next handoff", () => {
  it("fantasy clear (act 1 → 2) warps to cyberpunk", () => {
    const result = interstitialFor({
      justCleared: "fantasy",
      progress: progressWith(1),
    });
    expect(result.cta.kind).toBe("warp-next");
    if (result.cta.kind !== "warp-next") throw new Error("narrow");
    expect(result.cta.nextPreset).toBe("cyberpunk");
  });

  it("cyberpunk clear (act 2 → 3) warps to sci-fi", () => {
    const result = interstitialFor({
      justCleared: "cyberpunk",
      progress: progressWith(2),
    });
    expect(result.cta.kind).toBe("warp-next");
    if (result.cta.kind !== "warp-next") throw new Error("narrow");
    expect(result.cta.nextPreset).toBe("scifi");
  });

  it("sci-fi clear (act 3 → 4) hands the seed-claim shape — parent gates whether it fires", () => {
    const result = interstitialFor({
      justCleared: "scifi",
      progress: progressWith(3),
    });
    expect(result.cta.kind).toBe("claim-seed");
  });

  it("ad-hoc post-arc clears fall back to open-picker", () => {
    const result = interstitialFor({
      justCleared: "fantasy",
      progress: progressWith(3, { cleared: [] }),
    });
    expect(result.cta.kind).toBe("open-picker");
  });
});

describe("lockStateFor", () => {
  it("fantasy is always entry-playable (genesis-locked)", () => {
    const state = lockStateFor("fantasy", progressWith(0));
    expect(state).toBe("genesis-locked");
  });

  it("cyberpunk is sealed until fantasy is cleared", () => {
    expect(lockStateFor("cyberpunk", progressWith(0))).toBe("locked-pre-prev");
    const after = progressWith(1, {
      cleared: [
        { realm: "0x1111111111111111111111111111111111111111", preset: "fantasy" as Preset, ts: 0 },
      ],
    });
    expect(lockStateFor("cyberpunk", after)).toBe("unlocked");
  });
});
