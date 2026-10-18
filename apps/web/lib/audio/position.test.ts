import { describe, expect, it } from "vitest";
import {
  barDuration,
  barsToSeconds,
  derivedBpm,
  mapBarsToTrackSeconds,
  nextBarLine,
  planTransition,
  secondsToBars,
  wrapBars,
  type TrackTiming,
} from "./position";

/**
 * Fixtures modelled on the real case: one arrangement at three tempos
 * and three loop lengths.
 *
 *   theme      32 bars over 64s      → 2.0s/bar →  120 BPM
 *   medieval   16 bars over 40s      → 2.5s/bar →   96 BPM
 *   cyberpunk  64 bars over 96s      → 1.5s/bar →  160 BPM
 */
const theme: TrackTiming = { loopDuration: 64, bars: 32, beatsPerBar: 4 };
const medieval: TrackTiming = { loopDuration: 40, bars: 16, beatsPerBar: 4 };
const cyberpunk: TrackTiming = { loopDuration: 96, bars: 64, beatsPerBar: 4 };

describe("barDuration / derivedBpm", () => {
  it("derives seconds-per-bar from duration and bar count", () => {
    expect(barDuration(theme)).toBe(2);
    expect(barDuration(medieval)).toBe(2.5);
    expect(barDuration(cyberpunk)).toBe(1.5);
  });

  it("derives a plausible tempo without being told one", () => {
    expect(derivedBpm(theme)).toBeCloseTo(120, 6);
    expect(derivedBpm(medieval)).toBeCloseTo(96, 6);
    expect(derivedBpm(cyberpunk)).toBeCloseTo(160, 6);
  });

  it("is the inverse of duration: halving the loop doubles the tempo", () => {
    const half: TrackTiming = { ...theme, loopDuration: theme.loopDuration / 2 };
    expect(derivedBpm(half)).toBeCloseTo(derivedBpm(theme) * 2, 6);
  });
});

describe("secondsToBars / barsToSeconds", () => {
  it("round-trips within a track", () => {
    for (const bars of [0, 0.25, 1, 7.5, 31.999, 100]) {
      expect(secondsToBars(barsToSeconds(bars, theme), theme)).toBeCloseTo(bars, 9);
    }
  });

  it("keeps counting past the end of the loop rather than wrapping", () => {
    // 3 full passes of a 64s loop plus 4 bars.
    expect(secondsToBars(64 * 3 + 8, theme)).toBeCloseTo(100, 9);
  });
});

describe("wrapBars", () => {
  it("folds a position into the track's own length", () => {
    expect(wrapBars(5, theme)).toBe(5);
    expect(wrapBars(37, theme)).toBe(5);
    expect(wrapBars(69, theme)).toBe(5);
  });

  it("wraps into a shorter track", () => {
    // Bar 20 of the 32-bar theme lands in the second pass of the
    // 16-bar medieval loop.
    expect(wrapBars(20, medieval)).toBe(4);
  });

  it("handles negative positions with a floored modulo", () => {
    expect(wrapBars(-1, theme)).toBe(31);
    expect(wrapBars(-33, theme)).toBe(31);
  });

  it("returns 0 rather than the loop length on an exact multiple", () => {
    expect(wrapBars(32, theme)).toBe(0);
    expect(wrapBars(64, theme)).toBe(0);
  });
});

describe("mapBarsToTrackSeconds", () => {
  it("maps a bar position to the target's own tempo", () => {
    // Bar 8 is bar 8 in both, but a bar is longer in the slower piece.
    expect(mapBarsToTrackSeconds(8, theme)).toBe(16);
    expect(mapBarsToTrackSeconds(8, medieval)).toBe(20);
    expect(mapBarsToTrackSeconds(8, cyberpunk)).toBe(12);
  });

  it("never returns an offset past the end of the target loop", () => {
    for (const bars of [0, 15, 31, 32, 63, 100, 1000]) {
      for (const track of [theme, medieval, cyberpunk]) {
        const offset = mapBarsToTrackSeconds(bars, track);
        expect(offset).toBeGreaterThanOrEqual(0);
        expect(offset).toBeLessThan(track.loopDuration);
      }
    }
  });

  it("preserves phrase position when bar counts are multiples", () => {
    // theme (32) -> cyberpunk (64): bar 5 is bar 5, same point of the
    // four-bar phrase, so the melody lands where the ear expects.
    const offset = mapBarsToTrackSeconds(5, cyberpunk);
    expect(secondsToBars(offset, cyberpunk)).toBeCloseTo(5, 9);
  });
});

describe("nextBarLine", () => {
  it("rounds up to the next whole bar", () => {
    expect(nextBarLine(7.2)).toBe(8);
    expect(nextBarLine(7.999)).toBe(8);
  });

  it("leaves a position already on the line alone", () => {
    // Otherwise a switch requested exactly on the beat would be pushed a
    // full bar late.
    expect(nextBarLine(8)).toBe(8);
    expect(nextBarLine(8, 4)).toBe(8);
  });

  it("quantizes to a coarser phrase grid", () => {
    expect(nextBarLine(5.1, 4)).toBe(8);
    expect(nextBarLine(1, 4)).toBe(4);
    expect(nextBarLine(12.5, 8)).toBe(16);
  });

  it("does not quantize at all when `every` is 0", () => {
    // Used for the ambient theme: there's no audible downbeat, so waiting
    // for one is a delay with nothing to show for it.
    expect(nextBarLine(7.2, 0)).toBe(7.2);
    expect(nextBarLine(0.001, 0)).toBe(0.001);
  });

  it("tolerates float fuzz just above a line", () => {
    // A derived bar position is a division result, so it lands a hair off
    // the integer; ceil() alone would cost a whole bar here.
    expect(nextBarLine(8 + 1e-12)).toBeCloseTo(8, 9);
  });
});

describe("planTransition", () => {
  it("waits for the next bar line and starts the target there", () => {
    const plan = planTransition({ fromBars: 7.5, from: theme, to: medieval });
    expect(plan.atBars).toBe(8);
    // Half a bar of the theme remains: 0.5 * 2s.
    expect(plan.delaySeconds).toBeCloseTo(1, 9);
    // Bar 8 of the 16-bar medieval loop, at 2.5s/bar.
    expect(plan.targetOffsetSeconds).toBeCloseTo(20, 9);
  });

  it("measures the wait in the outgoing track's tempo", () => {
    // Same fractional position, different source tempo → different wait.
    const fromTheme = planTransition({ fromBars: 7.5, from: theme, to: medieval });
    const fromCyber = planTransition({
      fromBars: 7.5,
      from: cyberpunk,
      to: medieval,
    });
    expect(fromTheme.delaySeconds).toBeCloseTo(0.5 * 2, 9);
    expect(fromCyber.delaySeconds).toBeCloseTo(0.5 * 1.5, 9);
    // ...but they land at the same musical place.
    expect(fromCyber.targetOffsetSeconds).toBeCloseTo(
      fromTheme.targetOffsetSeconds,
      9,
    );
  });

  it("switches instantly from a beatless track", () => {
    // quantizeBars: 0 is how the conductor leaves an ambient piece. The
    // cut is immediate, but the target still lands at its mapped
    // position rather than restarting.
    const plan = planTransition({
      fromBars: 7.3,
      from: theme,
      to: medieval,
      quantizeBars: 0,
    });
    expect(plan.atBars).toBe(7.3);
    expect(plan.delaySeconds).toBe(0);
    expect(secondsToBars(plan.targetOffsetSeconds, medieval)).toBeCloseTo(7.3, 9);
  });

  it("never asks the caller to wait a negative amount of time", () => {
    for (const fromBars of [0, 0.001, 8, 8.5, -0.5, 1000.25]) {
      const plan = planTransition({ fromBars, from: theme, to: cyberpunk });
      expect(plan.delaySeconds).toBeGreaterThanOrEqual(0);
    }
  });

  it("wraps the target offset when the source has outlived the target loop", () => {
    // Bar 100 of the theme, into the 16-bar medieval loop: 100 % 16 = 4.
    const plan = planTransition({ fromBars: 100, from: theme, to: medieval });
    expect(plan.atBars).toBe(100);
    expect(plan.targetOffsetSeconds).toBeCloseTo(4 * 2.5, 9);
  });

  it("is continuous: the bar clock does not jump across a switch", () => {
    // This is the property the whole feature rests on. The cut happens at
    // `atBars`, and the offset the new track starts at must correspond to
    // that same bar in the new track's time base.
    const plan = planTransition({ fromBars: 13.3, from: theme, to: cyberpunk });
    const landedBar = secondsToBars(plan.targetOffsetSeconds, cyberpunk);
    expect(wrapBars(plan.atBars, cyberpunk)).toBeCloseTo(landedBar, 9);
  });

  it("round-trips A -> B -> A back to the original bar", () => {
    // Walking into a realm and straight back out must not drift the
    // melody, even though the two hops go through different tempos.
    const startBar = 9;
    const toMedieval = planTransition({
      fromBars: startBar,
      from: theme,
      to: medieval,
    });
    const atMedieval = secondsToBars(toMedieval.targetOffsetSeconds, medieval);

    const backToTheme = planTransition({
      fromBars: atMedieval,
      from: medieval,
      to: theme,
    });
    const atTheme = secondsToBars(backToTheme.targetOffsetSeconds, theme);

    expect(wrapBars(startBar, theme)).toBeCloseTo(atTheme, 9);
  });

  it("collapses a chain of hops to the shortest loop in the chain", () => {
    // Passing through a short loop is lossy *by design*: folding bar 22
    // into a 16-bar loop yields bar 6, and nothing downstream can know
    // it was once bar 22. Musically that's the right trade — position
    // within the repeating phrase survives, which is what makes the
    // shared theme line up — but it means a long chain settles at
    // `start mod shortestLoop`, not back at `start`.
    const chain = [
      { from: theme, to: medieval },
      { from: medieval, to: cyberpunk },
      { from: cyberpunk, to: theme },
    ];
    let bars = 21.75; // mid-bar, so the first hop quantizes up to 22
    for (const { from, to } of chain) {
      const plan = planTransition({ fromBars: bars, from, to });
      bars = secondsToBars(plan.targetOffsetSeconds, to);
    }
    const shortest = Math.min(theme.bars, medieval.bars, cyberpunk.bars);
    expect(bars).toBeCloseTo(22 % shortest, 9);
  });

  it("is lossless when every loop is at least as long as the start position", () => {
    // The common case — the player never leaves the phrase the short
    // loop can represent, so the position survives the whole round trip.
    let bars = 9;
    for (const { from, to } of [
      { from: theme, to: cyberpunk },
      { from: cyberpunk, to: medieval },
      { from: medieval, to: theme },
    ]) {
      const plan = planTransition({ fromBars: bars, from, to });
      bars = secondsToBars(plan.targetOffsetSeconds, to);
    }
    expect(bars).toBeCloseTo(9, 9);
  });
});
