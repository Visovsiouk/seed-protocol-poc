/**
 * Procedural sound effects.
 *
 * Every voice is synthesized from an oscillator plus an optional
 * filtered-noise layer, built fresh per shot and left to be collected
 * when it finishes. No samples to source, nothing to download, and each
 * voice is tunable by editing one number in `manifest.ts`.
 *
 * A `src` on any `SfxDef` bypasses synthesis in favour of a real sample,
 * so assets can replace voices one at a time later without touching this
 * file or any call site.
 */

import { SFX, SFX_MIN_INTERVAL_MS, type SfxDef, type SfxId } from "./manifest";
import { getBuffer, getEngine, loadBuffer } from "./engine";

/** Last play time per voice, for the anti-machine-gun throttle. */
const lastPlayed = new Map<SfxId, number>();

/**
 * Short-lived noise buffers, keyed by sample length. Generating white
 * noise is cheap but not free, and combat can fire several voices per
 * step — caching by duration means we allocate a handful of buffers for
 * the whole session instead of one per hit.
 */
const noiseCache = new Map<number, AudioBuffer>();

function noiseBuffer(ctx: AudioContext, duration: number): AudioBuffer {
  const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const cached = noiseCache.get(frames);
  if (cached) return cached;

  const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  noiseCache.set(frames, buf);
  return buf;
}

/** Random detune in cents → a playback/frequency multiplier. */
function detuneRatio(cents: number | undefined): number {
  if (!cents) return 1;
  const spread = (Math.random() * 2 - 1) * cents;
  return Math.pow(2, spread / 1200);
}

function playSynth(def: SfxDef): void {
  const e = getEngine();
  if (!e) return;

  const { ctx, sfxBus } = e;
  const t = ctx.currentTime;
  const end = t + def.duration;
  const ratio = detuneRatio(def.detuneCents);

  // Shared envelope: a near-instant attack (2ms, enough to avoid a click
  // at onset) and an exponential decay, which reads as "percussive"
  // where a linear ramp sounds artificial.
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(def.gain, t + 0.002);
  env.gain.exponentialRampToValueAtTime(0.0001, end);
  env.connect(sfxBus);

  const osc = ctx.createOscillator();
  osc.type = def.wave;
  osc.frequency.setValueAtTime(def.freq * ratio, t);
  if (def.sweepTo !== undefined) {
    // Exponential sweep so the pitch drop sounds even to the ear.
    // `exponentialRamp` cannot reach or cross zero, hence the floor.
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(20, def.sweepTo * ratio),
      end,
    );
  }
  osc.connect(env);
  osc.start(t);
  osc.stop(end);

  if (def.noise) {
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx, def.duration);

    // Low-pass the noise so impacts read as weight rather than hiss.
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = def.noiseCutoff ?? 2000;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = def.noise;

    noise.connect(lp);
    lp.connect(noiseGain);
    noiseGain.connect(env);
    noise.start(t);
    noise.stop(end);
  }
}

function playSample(src: string, def: SfxDef): void {
  const e = getEngine();
  if (!e) return;

  const buf = getBuffer(src);
  if (!buf) {
    // Not decoded yet — warm it so the *next* trigger is audible. Firing
    // late would be worse than dropping it: a hit sound landing 200ms
    // after the hit reads as a bug.
    void loadBuffer(src);
    return;
  }

  const { ctx, sfxBus } = e;
  const t = ctx.currentTime;
  const source = ctx.createBufferSource();
  source.buffer = buf;
  source.playbackRate.value = detuneRatio(def.detuneCents);

  const gain = ctx.createGain();
  gain.gain.value = def.gain;
  source.connect(gain);
  gain.connect(sfxBus);
  source.start(t);
}

/**
 * Fire a sound effect. A no-op before the first user gesture (no engine)
 * and when the same voice fired within `SFX_MIN_INTERVAL_MS` — combat
 * resolves several beats per step and the delegated click listener sees
 * bursts, which would otherwise phase-stack into a buzz and clip the
 * bus.
 */
export function play(id: SfxId): void {
  const def = SFX[id];
  if (!def) return;

  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const last = lastPlayed.get(id);
  if (last !== undefined && now - last < SFX_MIN_INTERVAL_MS) return;
  lastPlayed.set(id, now);

  if (def.src) playSample(def.src, def);
  else playSynth(def);
}

/**
 * Prefetch any voices backed by real samples. Synthesized voices need
 * no warming, so this is a no-op until `src` overrides are added.
 */
export function prefetchSfx(): void {
  for (const def of Object.values(SFX)) {
    if (def.src) void loadBuffer(def.src);
  }
}
