/**
 * The music conductor — owns the shared bar clock and performs
 * bar-quantized crossfades between the four pieces.
 *
 * ## The clock
 *
 * There is exactly one musical position, held as an **absolute bar
 * count** that keeps rising for as long as music plays. It is never
 * stored as a mutable counter and never advanced by a timer: it's
 * derived on demand from `ctx.currentTime`, which is a sample-accurate
 * hardware clock. That's what makes the hand-off exact — a `setInterval`
 * would drift, and drift here means a smeared downbeat.
 *
 *     barsNow = startBars + (ctx.currentTime - startedAt) / barDuration
 *
 * When the player changes realm we read that position, map it into the
 * incoming track (`position.ts`), and schedule the cut on the next bar
 * line. Bar N is the same moment of the theme in all four pieces, so the
 * melody continues across the cut while the tempo changes underneath it.
 *
 * ## Mute does not stop playback
 *
 * Muting ramps the bus to zero and leaves the sources running, so the
 * clock stays continuous and unmuting resumes at the musically correct
 * place rather than restarting. The cost is one or two idle buffer
 * sources, which is nothing.
 */

import {
  AMBIENT_CROSSFADE_SECONDS,
  CROSSFADE_SECONDS,
  DEFAULT_TRACK,
  FADE_SECONDS,
  QUANTIZE_BARS,
  getTrack,
  type TrackId,
} from "./manifest";
import {
  barDuration,
  derivedBpm,
  planTransition,
  secondsToBars,
  wrapBars,
  type TrackTiming,
} from "./position";
import {
  decodedBytes,
  evictBuffersExcept,
  getBuffer,
  getEngine,
  loadBuffer,
  type Engine,
} from "./engine";

type Playing = {
  trackId: TrackId;
  timing: TrackTiming;
  source: AudioBufferSourceNode;
  /** Index into `engine.decks`. */
  deck: 0 | 1;
  /** Context time at which this source's playback began. */
  startedAt: number;
  /** Absolute bar position corresponding to `startedAt`. */
  startBars: number;
};

/** Currently audible (or fading out) track. */
let current: Playing | null = null;
/**
 * A scheduled-but-not-yet-started track. Promoted to `current` once the
 * context clock passes its `startedAt`. Holding it separately keeps
 * `position()` honest during the half-second the cut is pending — the
 * old track is still the one defining "now".
 */
let pending: Playing | null = null;
/**
 * What the app has asked for, independent of what's audible. Compared
 * against on async buffer arrival so a player who walks through two
 * portals quickly doesn't get a switch to the realm they already left.
 */
let desired: TrackId = DEFAULT_TRACK;
let started = false;
/**
 * Pending retirement of an outgoing source.
 *
 * A `setTimeout` rather than `source.stop(when)` because a scheduled
 * stop is irrevocable: if the switch that triggered it gets superseded
 * (see `cancelPending`) we need to keep that source alive. Timer
 * accuracy is irrelevant here — by the time it fires the deck has
 * already been faded to silence.
 */
let retireTimer: ReturnType<typeof setTimeout> | null = null;
/** Set while a `setTrack` call is coalescing into a microtask. */
let flushQueued = false;

function timingFor(trackId: TrackId, buffer: AudioBuffer): TrackTiming {
  const def = getTrack(trackId);
  return {
    // Prefer the manifest's declared musical length: a padded MP3/AAC
    // decodes longer than it really is, and that padding would otherwise
    // be divided into `bars` and skew every beat.
    loopDuration: def.loopEndSeconds ?? buffer.duration,
    bars: def.bars,
    beatsPerBar: def.beatsPerBar ?? 4,
  };
}

/** Promote a pending track once its scheduled start time has passed. */
function settle(now: number): void {
  if (pending && now >= pending.startedAt) {
    current = pending;
    pending = null;
    // Release the track we just left. Safe mid-crossfade: the outgoing
    // AudioBufferSourceNode holds its own reference to its buffer, so
    // dropping ours frees it only once that source is retired.
    evictBuffersExcept([getTrack(current.trackId).src]);
  }
}

/**
 * Abandon a scheduled-but-not-yet-started switch and undo its effect on
 * the decks.
 *
 * Needed because a switch can be superseded while it's still waiting for
 * its bar line: navigating between two realms gives us a cleanup (→
 * theme) and a setup (→ the new genre) in the same commit, and rapid
 * portal-hopping can outpace a one-bar quantize wait. Without this the
 * superseded source would still start, on a deck we're about to reuse.
 */
function cancelPending(e: Engine): void {
  if (!pending) return;
  try {
    pending.source.stop();
  } catch {
    // Never started; stop() on an unstarted source throws.
  }
  // Call off the retirement of the outgoing source — we're staying on it.
  if (retireTimer !== null) {
    clearTimeout(retireTimer);
    retireTimer = null;
  }
  const now = e.ctx.currentTime;
  // Drop the queued fade-in, and restore the outgoing deck that this
  // transition had scheduled a fade-out on.
  const inGain = e.decks[pending.deck].gain;
  inGain.cancelScheduledValues(now);
  inGain.setValueAtTime(0, now);
  if (current) {
    const outGain = e.decks[current.deck].gain;
    outGain.cancelScheduledValues(now);
    outGain.setValueAtTime(1, now);
  }
  pending = null;
}

/**
 * Absolute bar position of the music right now, or `null` when nothing
 * is playing. Exported for the dev debug surface, which asserts this is
 * continuous across a genre switch.
 */
export function position(): number | null {
  const e = getEngine();
  if (!e || !current) return null;
  const now = e.ctx.currentTime;
  settle(now);
  if (!current) return null;
  return current.startBars + secondsToBars(now - current.startedAt, current.timing);
}

function makeSource(
  e: Engine,
  buffer: AudioBuffer,
  timing: TrackTiming,
  deck: 0 | 1,
): AudioBufferSourceNode {
  const source = e.ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.loopStart = 0;
  // Explicit loop end rather than the buffer's own length: this is what
  // excludes any encoder padding tail from the loop, keeping successive
  // passes gapless and on-grid.
  source.loopEnd = timing.loopDuration;
  source.connect(e.decks[deck]);
  return source;
}

function rampDeck(
  e: Engine,
  deck: 0 | 1,
  to: number,
  at: number,
  over: number,
): void {
  const g = e.decks[deck].gain;
  g.cancelScheduledValues(at);
  g.setValueAtTime(g.value, at);
  g.linearRampToValueAtTime(to, at + over);
}

/**
 * Begin playback from bar 0 of `trackId`, fading in. Used for the very
 * first track only; every later change goes through `switchTo`.
 */
function startFresh(e: Engine, trackId: TrackId, buffer: AudioBuffer): void {
  const timing = timingFor(trackId, buffer);
  const at = e.ctx.currentTime;
  const source = makeSource(e, buffer, timing, 0);
  source.start(at, 0);
  rampDeck(e, 0, 1, at, FADE_SECONDS);
  current = { trackId, timing, source, deck: 0, startedAt: at, startBars: 0 };
  pending = null;
}

/**
 * Schedule the bar-quantized cut from `current` to `trackId`.
 *
 * The new source starts exactly on the bar line and the two decks
 * crossfade across the following `CROSSFADE_SECONDS`. Starting *on* the
 * line (rather than beginning the fade before it) keeps the incoming
 * downbeat aligned to the grid at the cost of a slightly soft attack —
 * the outgoing track covers that half-second, which is what makes the
 * tempo change read as a blend rather than a cut.
 */
function switchTo(e: Engine, trackId: TrackId, buffer: AudioBuffer): void {
  const from = current;
  if (!from) {
    startFresh(e, trackId, buffer);
    return;
  }

  cancelPending(e);

  const now = e.ctx.currentTime;
  const to = timingFor(trackId, buffer);
  const fromBars = from.startBars + secondsToBars(now - from.startedAt, from.timing);

  const plan = planTransition({
    fromBars,
    from: from.timing,
    to,
    // Only wait for a bar line if the outgoing track actually has a beat
    // to land on. Quantizing against an ambient piece just delays the
    // switch by up to a bar with nothing audible to justify it.
    quantizeBars: getTrack(from.trackId).beatless ? 0 : QUANTIZE_BARS,
  });
  const at = now + plan.delaySeconds;

  const deck: 0 | 1 = from.deck === 0 ? 1 : 0;
  const source = makeSource(e, buffer, to, deck);
  source.start(at, plan.targetOffsetSeconds);

  // Fade length is keyed to what we're arriving at, not what we're
  // leaving: a beat wants a crisp attack, a pad wants a long wash.
  const fade = getTrack(trackId).beatless
    ? AMBIENT_CROSSFADE_SECONDS
    : CROSSFADE_SECONDS;

  rampDeck(e, deck, 1, at, fade);
  rampDeck(e, from.deck, 0, at, fade);

  // Release the outgoing source once it's inaudible, via a cancellable
  // timer (see `retireTimer`).
  if (retireTimer !== null) clearTimeout(retireTimer);
  const outgoing = from.source;
  retireTimer = setTimeout(
    () => {
      retireTimer = null;
      try {
        outgoing.stop();
      } catch {
        // Already stopped.
      }
    },
    (plan.delaySeconds + fade + 0.1) * 1000,
  );

  pending = {
    trackId,
    timing: to,
    source,
    deck,
    startedAt: at,
    // The cut lands on `plan.atBars`, and the new source starts at the
    // position that bar maps to — so the absolute clock continues
    // through the switch rather than restarting.
    startBars: plan.atBars,
  };
}

/**
 * Ask for `trackId`. Idempotent: asking for what's already playing (or
 * already scheduled) does nothing, which matters because route effects
 * re-run on unrelated dependency changes.
 *
 * When the buffer isn't cached yet the current track keeps playing and
 * the switch happens at the first bar line after the download resolves.
 */
export function setTrack(trackId: TrackId): void {
  desired = trackId;
  if (flushQueued) return;
  flushQueued = true;
  // Coalesce into a microtask so a React commit that runs one route's
  // cleanup (reset to theme) and the next route's setup (the new genre)
  // produces a single transition instead of bouncing through the theme.
  queueMicrotask(flush);
}

function flush(): void {
  flushQueued = false;

  const e = getEngine();
  if (!e) return;

  const trackId = desired;
  settle(e.ctx.currentTime);

  const audible = pending ?? current;
  if (audible && audible.trackId === trackId) {
    // Already there — but a superseded transition may still be queued
    // toward somewhere else, so make sure we're not about to leave.
    if (pending && pending.trackId !== trackId) cancelPending(e);
    return;
  }

  const def = getTrack(trackId);
  const cached = getBuffer(def.src);
  if (cached) {
    if (current) switchTo(e, trackId, cached);
    else startFresh(e, trackId, cached);
    return;
  }

  void loadBuffer(def.src).then((buf) => {
    // Re-check: the player may have moved on, or another call may have
    // already handled this track, while the fetch was in flight.
    if (!buf || desired !== trackId) return;
    const e2 = getEngine();
    if (!e2) return;
    settle(e2.ctx.currentTime);
    if ((pending ?? current)?.trackId === trackId) return;
    if (current) switchTo(e2, trackId, buf);
    else startFresh(e2, trackId, buf);
  });
}

/**
 * Start the music system. Called from the first user gesture, after the
 * engine exists. Loads the currently-desired track, then warms the other
 * three off the critical path so walking into a portal doesn't wait on a
 * download.
 */
export function start(): void {
  if (started) return;
  started = true;
  setTrack(desired);
  // Nothing is prefetched. Each track is ~70MB once decoded, so warming
  // the three the player isn't listening to would cost a few hundred MB
  // and a long decode for a track they may never reach. A cold switch
  // keeps the current track playing and cuts over at the first bar line
  // after the download lands, which is a much better trade.
}

/**
 * Turn music on or off wholesale.
 *
 * `false` stops playback and releases every decoded buffer — this is the
 * gate that keeps a player who never wants music from paying for it.
 * `true` starts the track the current route has asked for.
 *
 * Distinct from muting, which leaves the clock running so unmuting
 * resumes in the right musical place. Disabling is a full stop: there is
 * no position to preserve once the audio is gone.
 */
export function setEnabled(on: boolean): void {
  if (on) {
    start();
    return;
  }
  stop();
  evictBuffersExcept([]);
}

/** Stop everything and reset the clock. Used on teardown/HMR. */
export function stop(): void {
  for (const p of [current, pending]) {
    if (!p) continue;
    try {
      p.source.stop();
    } catch {
      // Already stopped.
    }
  }
  if (retireTimer !== null) {
    clearTimeout(retireTimer);
    retireTimer = null;
  }
  current = null;
  pending = null;
  started = false;
}

/**
 * Snapshot for the dev debug surface. The verification step reads this
 * across a realm change to confirm `bars` is continuous while
 * `barSeconds` (and so the derived BPM) changes — the machine-checkable
 * form of "the music passed over seamlessly".
 */
export function debugState(): {
  track: TrackId | null;
  desired: TrackId;
  bars: number | null;
  barInLoop: number | null;
  barSeconds: number | null;
  bpm: number | null;
  pendingTrack: TrackId | null;
  contextState: AudioContextState | null;
  /** Resident decoded audio, MB. Should stay near one track's worth. */
  decodedMB: number;
} {
  const e = getEngine();
  const bars = position();
  return {
    track: current?.trackId ?? null,
    desired,
    bars,
    barInLoop:
      bars !== null && current ? wrapBars(bars, current.timing) : null,
    barSeconds: current ? barDuration(current.timing) : null,
    bpm: current ? derivedBpm(current.timing) : null,
    pendingTrack: pending?.trackId ?? null,
    contextState: e?.ctx.state ?? null,
    decodedMB: +(decodedBytes() / 1048576).toFixed(1),
  };
}
