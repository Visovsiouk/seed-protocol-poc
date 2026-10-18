/**
 * The audio graph and its lifecycle.
 *
 *            ┌── musicBus ──┬── deckA ── BufferSource
 *   master ──┤              └── deckB ── BufferSource
 *            └── sfxBus   ──── one-shot sources
 *
 * Two music "decks" exist so a crossfade can run between two live
 * sources without reallocating the graph on every realm change.
 *
 * ## Autoplay
 *
 * Browsers create an `AudioContext` in the `suspended` state and refuse
 * to run it until a user gesture. We therefore build nothing at module
 * load — `ensureEngine()` is called from a capture-phase gesture
 * listener (see `AudioProvider`), and everything downstream treats "no
 * engine yet" as a normal state rather than an error.
 *
 * ## Why `AudioBuffer` and not `<audio>`
 *
 * `music.ts` needs to start a source at a precise future time and at an
 * arbitrary offset, with sample-exact loop points. `HTMLAudioElement`
 * gives none of those: its `currentTime` is approximate, seeks are
 * asynchronous, and loops gap. Decoded buffers cost memory but are the
 * only way to hit a downbeat reliably.
 */

import { busGain, type AudioSettings } from "./settings";

export type Engine = {
  ctx: AudioContext;
  master: GainNode;
  musicBus: GainNode;
  sfxBus: GainNode;
  /** The two interchangeable music decks. */
  decks: readonly [GainNode, GainNode];
};

let engine: Engine | null = null;

/** The live engine, or `null` before the first user gesture. */
export function getEngine(): Engine | null {
  return engine;
}

type AudioContextCtor = new () => AudioContext;

function resolveAudioContext(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** True where Web Audio exists at all (false under SSR and in happy-dom). */
export function isAudioSupported(): boolean {
  return resolveAudioContext() !== null;
}

/**
 * Build the graph on first call and return it; subsequent calls return
 * the same instance. Returns `null` where Web Audio is unavailable, so
 * callers degrade to silence rather than throwing.
 *
 * Safe to call on every gesture — it also re-`resume()`s a context that
 * the browser suspended on tab-hide.
 */
export function ensureEngine(settings: AudioSettings): Engine | null {
  if (engine) {
    void resume(engine);
    return engine;
  }

  const Ctor = resolveAudioContext();
  if (!Ctor) return null;

  let ctx: AudioContext;
  try {
    ctx = new Ctor();
  } catch {
    // Some hardened/embedded browsers throw on construction.
    return null;
  }

  const master = ctx.createGain();
  const musicBus = ctx.createGain();
  const sfxBus = ctx.createGain();
  const deckA = ctx.createGain();
  const deckB = ctx.createGain();

  // Decks start silent; `music.ts` ramps whichever one it starts.
  deckA.gain.value = 0;
  deckB.gain.value = 0;
  deckA.connect(musicBus);
  deckB.connect(musicBus);
  musicBus.connect(master);
  sfxBus.connect(master);
  master.connect(ctx.destination);

  // Master sits at unity: the settings' master trim is folded into each
  // bus by `busGain` instead, so muting is a single ramp per bus and the
  // two buses stay independently adjustable.
  master.gain.value = 1;
  musicBus.gain.value = busGain(settings, "music");
  sfxBus.gain.value = busGain(settings, "sfx");

  engine = { ctx, master, musicBus, sfxBus, decks: [deckA, deckB] };
  void resume(engine);
  return engine;
}

async function resume(e: Engine): Promise<void> {
  if (e.ctx.state === "suspended") {
    try {
      await e.ctx.resume();
    } catch {
      // Gesture wasn't trusted, or the context is closing. The next
      // gesture will try again.
    }
  }
}

/**
 * Apply settings to the live buses with a short ramp.
 *
 * Ramped rather than assigned because an abrupt `gain.value` change on a
 * running source produces a click — audible on the master bus as a pop
 * when dragging a slider.
 */
export function applySettings(settings: AudioSettings, rampSeconds = 0.08): void {
  if (!engine) return;
  const { ctx, musicBus, sfxBus } = engine;
  const t = ctx.currentTime;
  for (const [node, bus] of [
    [musicBus, "music"],
    [sfxBus, "sfx"],
  ] as const) {
    node.gain.cancelScheduledValues(t);
    node.gain.setValueAtTime(node.gain.value, t);
    node.gain.linearRampToValueAtTime(busGain(settings, bus), t + rampSeconds);
  }
}

// ---------------------------------------------------------------------------
// Buffer loading
// ---------------------------------------------------------------------------

/**
 * Decoded music, keyed by URL.
 *
 * These are big. `decodeAudioData` expands to raw float PCM, so at 48kHz
 * stereo a three-minute track costs `48000 * 2 * 4 * 180` ≈ **70MB** —
 * about thirty times the 2.4MB file it came from. Holding all four would
 * be ~300MB of resident memory for background music, which is why
 * `evictBuffersExcept` exists and why nothing is prefetched speculatively.
 */
const buffers = new Map<string, AudioBuffer>();
/** In-flight decodes, so concurrent requests for one URL share a fetch. */
const inFlight = new Map<string, Promise<AudioBuffer | null>>();

/** Rough resident size of a decoded buffer, in bytes. */
function bufferBytes(buf: AudioBuffer): number {
  return buf.length * buf.numberOfChannels * 4;
}

/** Total bytes currently held as decoded audio. Exposed for the debug surface. */
export function decodedBytes(): number {
  let total = 0;
  for (const buf of buffers.values()) total += bufferBytes(buf);
  return total;
}

/**
 * Drop every decoded buffer except the given URLs.
 *
 * Called by the conductor after a switch settles, keeping only what's
 * audible (and whatever is mid-crossfade). Re-entering a realm costs a
 * fresh decode, which is a fair trade against carrying a few hundred MB
 * for tracks nobody is listening to. Sources already playing hold their
 * own reference to the buffer, so eviction can never cut off audio.
 */
export function evictBuffersExcept(keep: readonly string[]): void {
  const keepSet = new Set(keep);
  for (const src of [...buffers.keys()]) {
    if (!keepSet.has(src)) buffers.delete(src);
  }
}

/** A buffer already decoded for `src`, if any. Never triggers a fetch. */
export function getBuffer(src: string): AudioBuffer | null {
  return buffers.get(src) ?? null;
}

/**
 * Fetch and decode `src`, caching the result. Resolves `null` on a 404
 * or a decode failure — missing audio degrades to silence rather than
 * breaking the page, which matters while the real assets are still
 * being dropped in.
 */
export function loadBuffer(src: string): Promise<AudioBuffer | null> {
  const cached = buffers.get(src);
  if (cached) return Promise.resolve(cached);

  const pending = inFlight.get(src);
  if (pending) return pending;

  const e = engine;
  if (!e) return Promise.resolve(null);

  const task = (async (): Promise<AudioBuffer | null> => {
    try {
      const res = await fetch(src);
      if (!res.ok) return null;
      const bytes = await res.arrayBuffer();
      const buf = await e.ctx.decodeAudioData(bytes);
      buffers.set(src, buf);
      return buf;
    } catch {
      return null;
    } finally {
      inFlight.delete(src);
    }
  })();

  inFlight.set(src, task);
  return task;
}

/**
 * Tear the graph down. Only used by tests and HMR — the engine is
 * otherwise process-lifetime.
 */
export function destroyEngine(): void {
  if (!engine) return;
  try {
    void engine.ctx.close();
  } catch {
    // Already closed.
  }
  engine = null;
  buffers.clear();
  inFlight.clear();
}
