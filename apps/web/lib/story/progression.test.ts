import { describe, expect, it } from "vitest";
import type { Preset } from "@/lib/engine/types";
import type { TutorialProgress } from "@/lib/tutorial/progress";
import {
  REALM_ORDER,
  creatorPageCleared,
  ctaLabel,
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

/**
 * The CTA is the only way off the clear screen now — `EncounterFrame` used to
 * route home on a 3.5s timer and drop this data on the floor. So "every beat
 * names its own exit" is a product requirement, not a style preference, and
 * these are the tests that keep it one.
 */
describe("every clear beat offers a way out", () => {
  const CASES: Array<[string, ReturnType<typeof interstitialFor>]> = [
    ["fantasy", interstitialFor({ justCleared: "fantasy", progress: progressWith(1) })],
    ["cyberpunk", interstitialFor({ justCleared: "cyberpunk", progress: progressWith(2) })],
    ["scifi", interstitialFor({ justCleared: "scifi", progress: progressWith(3) })],
    ["post-arc", interstitialFor({ justCleared: "fantasy", progress: progressWith(3) })],
    [
      "creator page, someone else's",
      creatorPageCleared({ pageName: "The Unread Quire", bookmarkName: "Mirela Vance", mine: false }),
    ],
    [
      "creator page, your own",
      creatorPageCleared({ pageName: "The Unread Quire", bookmarkName: "Mirela Vance", mine: true }),
    ],
  ];

  for (const [name, story] of CASES) {
    it(`${name} has a label the button can wear`, () => {
      const label = ctaLabel(story);
      expect(label).toBeTruthy();
      // It goes on a button in a run-over panel at 375px — a sentence would
      // wrap into the bank status below it.
      expect(label!.length).toBeLessThanOrEqual(28);
    });

    it(`${name} has prose in all three slots`, () => {
      expect(story.eyebrow.length).toBeGreaterThan(0);
      expect(story.title.length).toBeGreaterThan(0);
      expect(story.body.length).toBeGreaterThan(0);
    });
  }

  it("no label promises a descent the button doesn't make", () => {
    // "Go down" was the `warp-next` label while the button didn't exist. Now
    // that it does, and it goes to the base, that label would be a lie.
    for (const [, story] of CASES) {
      expect(ctaLabel(story)?.toLowerCase()).not.toContain("go down");
    }
  });

  it("ctaLabel is undefined only for the no-exit variant", () => {
    expect(ctaLabel({ eyebrow: "e", title: "t", body: "b", cta: { kind: "none" } })).toBeUndefined();
  });
});

describe("creatorPageCleared", () => {
  const ARGS = {
    pageName: "The Unread Quire",
    bookmarkName: "Mirela Vance",
  } as const;

  it("names the bookmark the player just tore out, both ways round", () => {
    // The generated lore spends a paragraph on this name and the player
    // spends a boss fight on it; the clear is where it has to pay off.
    expect(creatorPageCleared({ ...ARGS, mine: false }).body).toContain("Mirela Vance");
    expect(creatorPageCleared({ ...ARGS, mine: true }).body).toContain("Mirela Vance");
    expect(creatorPageCleared({ ...ARGS, mine: false }).eyebrow).toContain("Mirela Vance");
    expect(creatorPageCleared({ ...ARGS, mine: true }).eyebrow).toContain("Mirela Vance");
  });

  it("names the page", () => {
    expect(creatorPageCleared({ ...ARGS, mine: false }).body).toContain("The Unread Quire");
    expect(creatorPageCleared({ ...ARGS, mine: true }).body).toContain("The Unread Quire");
  });

  it("tells a different story about your own page", () => {
    const mine = creatorPageCleared({ ...ARGS, mine: true });
    const theirs = creatorPageCleared({ ...ARGS, mine: false });
    expect(mine.title).not.toBe(theirs.title);
    expect(mine.body).not.toBe(theirs.body);
  });

  it("sends the player to the picker, never the Altar", () => {
    // A creator clear presses no stamp, so it can't be the arc-completing
    // beat and must not land on the chest.
    for (const mine of [true, false]) {
      expect(creatorPageCleared({ ...ARGS, mine }).cta.kind).toBe("open-picker");
    }
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
