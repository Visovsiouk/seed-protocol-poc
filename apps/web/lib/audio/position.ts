/**
 * Musical-position math — the core of the seamless cross-genre hand-off.
 *
 * The four music pieces share one arrangement at different tempos and
 * different loop lengths. To hand off between them mid-phrase we need a
 * position that means the same thing in all of them, and seconds don't:
 * 30s into a 90 BPM piece is bar 11, but 30s into a 140 BPM piece is bar
 * 17. Resuming the new track at the old track's *second* would jump the
 * melody forward six bars.
 *
 * So the shared clock is measured in **bars**. Bar 11 is the same moment
 * of the theme in every piece, so mapping bar→bar keeps the melody
 * continuous while the tempo changes underneath it.
 *
 * Tempo is *derived*, never authored. The only number we're told per
 * track is its bar count (an integer); the bar duration falls out of the
 * decoded buffer's exact length:
 *
 *     barDuration = loopDuration / bars
 *
 * That's why `TrackTiming` carries a duration rather than a BPM — see
 * `manifest.ts` for why the asset format matters to this division.
 *
 * Everything here is pure and free of Web Audio imports so it can be
 * unit-tested under happy-dom (which has no `AudioContext`).
 */

/** Resolved timing for one track, derived from its decoded buffer. */
export type TrackTiming = {
  /**
   * Length of the loop in seconds. Normally `buffer.duration`, or the
   * manifest's `loopEndSeconds` override when a file carries encoder
   * padding that would otherwise skew `barDuration`.
   */
  loopDuration: number;
  /** Bars in the loop. Authored in the manifest; cannot be derived. */
  bars: number;
  /** Beats per bar. 4 unless a track says otherwise. */
  beatsPerBar: number;
};

/** Seconds per bar. The one quantity the whole system rests on. */
export function barDuration(timing: TrackTiming): number {
  return timing.loopDuration / timing.bars;
}

/**
 * Tempo implied by `timing`. Derived output only — nothing in the
 * transition path consumes this. It exists so the inspect script and the
 * dev debug surface can sanity-check authored bar counts: an implausible
 * BPM (say 31 or 400) means the bar count is wrong.
 */
export function derivedBpm(timing: TrackTiming): number {
  return (timing.bars * timing.beatsPerBar * 60) / timing.loopDuration;
}

/**
 * Convert elapsed playback seconds to an absolute, unwrapped bar
 * position. Monotonic — it keeps counting past the end of the loop, and
 * wrapping is the caller's business (see `wrapBars`). Keeping it
 * unwrapped means a long stay in one realm doesn't accumulate rounding
 * through repeated modulo operations.
 */
export function secondsToBars(seconds: number, timing: TrackTiming): number {
  return seconds / barDuration(timing);
}

/** Inverse of `secondsToBars`, within a single track's tempo. */
export function barsToSeconds(bars: number, timing: TrackTiming): number {
  return bars * barDuration(timing);
}

/**
 * Fold an absolute bar position into `[0, bars)`.
 *
 * Uses a floored modulo so negative positions wrap correctly — relevant
 * because a transition scheduled at the next bar line can be computed
 * from a slightly negative offset when the audio clock has just been
 * resumed.
 */
export function wrapBars(bars: number, timing: TrackTiming): number {
  const n = timing.bars;
  return ((bars % n) + n) % n;
}

/**
 * Map an absolute bar position from one track onto a start offset (in
 * seconds) into another. This is the hand-off:
 *
 *   1. fold the position into the target's own loop length, because the
 *      tracks differ in length (a 16-bar menu loop vs a 64-bar realm
 *      loop), and
 *   2. convert back to seconds at the *target's* bar duration.
 *
 * When bar counts are multiples of each other — 16 and 64, the usual
 * case for a theme and its variations — the fold preserves phrase
 * position as well as the downbeat, so the melody lands where the ear
 * expects it.
 */
export function mapBarsToTrackSeconds(bars: number, target: TrackTiming): number {
  return barsToSeconds(wrapBars(bars, target), target);
}

/**
 * The next bar line at or after `bars`, as an absolute bar position.
 *
 * `every` quantizes to a coarser grid: 1 switches on any bar, 4 waits
 * for the top of a four-bar phrase. Positions already sitting exactly on
 * a line are returned unchanged, so a switch requested precisely on the
 * beat isn't pushed a whole bar late.
 */
export function nextBarLine(bars: number, every = 1): number {
  const k = bars / every;
  const nearest = Math.round(k);
  // Snap when we're already on a line to within float noise. The check
  // has to be against the *nearest* line, not the ceiling: a bar
  // position is always a division result, so it routinely lands a hair
  // above an integer, and `ceil` alone would push the switch a full bar
  // late every time that happened.
  if (Math.abs(k - nearest) < 1e-9) return nearest * every;
  return Math.ceil(k) * every;
}

/**
 * Everything the conductor needs to perform one bar-quantized switch.
 * Computed as pure data here so the scheduling in `music.ts` stays a
 * thin translation into Web Audio calls — and so the arithmetic is
 * testable without an audio device.
 */
export type Transition = {
  /** Absolute bar position at which the cut happens. */
  atBars: number;
  /** Seconds from `now` until that bar line. Never negative. */
  delaySeconds: number;
  /** Offset into the target buffer to start playback at. */
  targetOffsetSeconds: number;
};

/**
 * Plan a switch from `from` (currently at absolute `atBars`) to `to`.
 *
 * The cut is pushed to the next `quantizeBars` line so the tempo change
 * lands on a downbeat. `delaySeconds` is measured in the *source*
 * track's tempo, since that's the track still playing while we wait.
 */
export function planTransition(args: {
  fromBars: number;
  from: TrackTiming;
  to: TrackTiming;
  quantizeBars?: number;
}): Transition {
  const { fromBars, from, to, quantizeBars = 1 } = args;
  const atBars = nextBarLine(fromBars, quantizeBars);
  return {
    atBars,
    delaySeconds: Math.max(0, barsToSeconds(atBars - fromBars, from)),
    targetOffsetSeconds: mapBarsToTrackSeconds(atBars, to),
  };
}
