/**
 * Audio asset manifest — the one place tracks, bar counts and SFX
 * voicing are declared.
 *
 * ## Why `bars` is authored and tempo is not
 *
 * `position.ts` derives every timing quantity from `loopDuration / bars`.
 * The duration comes from the decoded buffer, so the bar count is the
 * only thing we have to be told. It cannot be derived: a 32-bar loop at
 * 120 BPM and a 16-bar loop at 60 BPM are the same number of seconds.
 *
 * ## Why the asset format matters
 *
 * That division is only exact if `buffer.duration` is the true musical
 * length. MP3 and AAC encoders prepend/append padding frames, which
 * inflate the decoded duration by a few tens of milliseconds and skew
 * `barDuration` — small, but it compounds over a long loop and smears
 * the downbeat. **Opus-in-WebM preserves exact sample counts**, so it's
 * the primary format. If a file does carry padding, set
 * `loopEndSeconds` to the true musical length and the engine will use
 * that instead of the buffer's.
 *
 * Run `node scripts/audio-inspect.mjs` to convert source files and print
 * the BPM implied by each candidate bar count — that's how the `bars`
 * values below get pinned down.
 */

import type { Preset } from "@/lib/engine/types";

/**
 * `theme` is the menu/overworld piece; the other three are the genre
 * variations and are named to match `Preset` so route code can map
 * straight across (`fantasy` = medieval, `scifi` = space).
 */
export type TrackId = "theme" | Preset;

export type TrackDef = {
  id: TrackId;
  /** Public URL of the loop. */
  src: string;
  /**
   * Bars in the loop. **Authored — verify with the inspect script.** A
   * wrong value puts the melody on the wrong beat after a switch.
   */
  bars: number;
  /** Beats per bar. Defaults to 4. */
  beatsPerBar?: number;
  /**
   * True musical length in seconds, when the encoded file's decoded
   * duration includes padding. Omit for Opus/WebM.
   */
  loopEndSeconds?: number;
  /** Human label for the settings panel / debug surface. */
  label: string;
};

/**
 * Built by `pnpm audio:inspect --prepare-loops` from the sources in
 * `assets-src/audio/`. Each file has already been trimmed to a whole
 * number of bars starting at its first downbeat, with the material after
 * the loop end crossfaded back over the head — so these loop seamlessly
 * under plain Web Audio looping and the runtime needs no seam handling.
 *
 * `loopEndSeconds` is the true musical length, stated explicitly rather
 * than inferred from the buffer. In practice Chrome's Opus decoder
 * honours the stream's pre-skip and hands back exactly this duration, so
 * the override is a safety net rather than a live correction — but
 * `ffprobe` reports these files ~8ms longer (container duration includes
 * the padding), and a decoder that didn't strip it would divide those
 * 8ms across `bars` and put every bar line fractionally late. Stating
 * the length keeps the grid independent of that.
 *
 * ## On the tempos
 *
 * These four are separate generations rather than one arrangement at
 * four tempos, so bar N is *not* the same melody in each — the hand-off
 * preserves musical position and the beat grid, not the tune. Three of
 * them land within ~1.5 BPM of each other, which is why switching
 * between them sits so flat.
 *
 * The BPMs were measured by autocorrelation, not authored, so they carry
 * real uncertainty (noted per track). Tempo error accumulates: at
 * ±0.2 BPM a bar line three minutes in can be ~0.3s out. The crossfade
 * is long enough to cover that, but **bpm is the knob** — if a switch
 * late in a track ever feels off the beat, adjust the value in
 * `scripts/audio-inspect.mjs` and re-run `--prepare-loops`.
 */

/**
 * Cache-buster appended to every music URL.
 *
 * In production Caddy serves `/audio/*` off disk with
 * `max-age=31536000, immutable` (see deploy/Caddyfile) — without a
 * version in the URL that would pin the first download forever, and
 * re-cut loops would never reach anyone who had already loaded the site.
 * Caddy resolves the file ignoring the query, so this costs nothing.
 *
 * **Bump this whenever you re-run `--prepare-loops`.**
 */
export const ASSET_VERSION = 1;

const musicSrc = (id: string): string =>
  `/audio/music/${id}.webm?v=${ASSET_VERSION}`;

export const TRACKS: readonly TrackDef[] = [
  {
    id: "theme",
    src: musicSrc("theme"),
    bars: 89,
    loopEndSeconds: 178.0,
    label: "Theme",
  },
  {
    id: "fantasy",
    src: musicSrc("fantasy"),
    bars: 96,
    loopEndSeconds: 191.696481,
    label: "Medieval",
  },
  {
    id: "cyberpunk",
    src: musicSrc("cyberpunk"),
    bars: 103,
    loopEndSeconds: 205.828476,
    label: "Cyberpunk",
  },
  {
    id: "scifi",
    src: musicSrc("scifi"),
    bars: 108,
    loopEndSeconds: 213.157895,
    label: "Space",
  },
] as const;

const TRACK_BY_ID = new Map<TrackId, TrackDef>(TRACKS.map((t) => [t.id, t]));

export function getTrack(id: TrackId): TrackDef {
  const t = TRACK_BY_ID.get(id);
  if (!t) throw new Error(`getTrack: unknown track "${id}"`);
  return t;
}

/** The track a route with no active realm plays. */
export const DEFAULT_TRACK: TrackId = "theme";

/**
 * Quantization grid for genre switches, in bars. 1 cuts on the next
 * downbeat (max ~2s wait at 120 BPM); 4 waits for the top of a phrase,
 * which sounds more deliberate but delays the handoff. Paired with
 * `CROSSFADE_SECONDS` below — both are single constants on purpose so
 * the feel can be tuned by ear without touching logic.
 */
export const QUANTIZE_BARS = 1;

/**
 * Crossfade length for a genre switch — about 1.4 beats at 120 BPM.
 *
 * Longer than the 0.5s a single-arrangement swap would need, for two
 * reasons: these are different compositions, so a slower blend reads as
 * a deliberate cross rather than a cut between two tunes; and the bar
 * grid comes from a *measured* tempo, so late in a long track the
 * downbeat can be a couple hundred ms out — a blend this long covers
 * that completely.
 */
export const CROSSFADE_SECONDS = 0.7;

/** Fade applied when music starts, stops, or is muted/unmuted. */
export const FADE_SECONDS = 0.8;

// ---------------------------------------------------------------------------
// SFX
// ---------------------------------------------------------------------------

export type SfxId =
  | "click"
  | "swing"
  | "hit"
  | "crit"
  | "miss"
  | "dodge"
  | "hurt"
  | "loot"
  | "defeat"
  | "victory"
  | "toastOk"
  | "toastDanger"
  | "toastAccent";

/**
 * Per-voice synthesis recipe, consumed by `sfx.ts`. These are
 * procedural rather than sampled so there are no assets to source and
 * each voice stays tunable by a single number here.
 *
 * `src` overrides synthesis with a real sample when one is available —
 * the override is per-voice, so samples can land one at a time without
 * any code change.
 */
export type SfxDef = {
  /** Oscillator shape for the tonal body. */
  wave: OscillatorType;
  /** Start frequency in Hz. */
  freq: number;
  /** Frequency swept to over the voice's life. Omit to hold `freq`. */
  sweepTo?: number;
  /** Total length in seconds. */
  duration: number;
  /** Peak gain, 0..1, before the SFX bus volume applies. */
  gain: number;
  /** Filtered-noise layer weight, 0..1 — the "impact" of a hit. */
  noise?: number;
  /** Low-pass cutoff for the noise layer, Hz. */
  noiseCutoff?: number;
  /** Random pitch spread in cents, applied per shot to avoid sameness. */
  detuneCents?: number;
  /** Optional sample URL. When set, synthesis is bypassed. */
  src?: string;
};

export const SFX: Readonly<Record<SfxId, SfxDef>> = {
  // UI — deliberately quiet and short; this fires on every click.
  click: {
    wave: "triangle",
    freq: 880,
    sweepTo: 660,
    duration: 0.05,
    gain: 0.18,
    detuneCents: 40,
  },
  // Combat. "swing" precedes the resolution, so it's airy rather than
  // percussive; "hit"/"crit" carry the noise impact.
  swing: {
    wave: "sine",
    freq: 420,
    sweepTo: 180,
    duration: 0.12,
    gain: 0.22,
    noise: 0.5,
    noiseCutoff: 2600,
    detuneCents: 70,
  },
  hit: {
    wave: "square",
    freq: 180,
    sweepTo: 90,
    duration: 0.16,
    gain: 0.3,
    noise: 0.8,
    noiseCutoff: 1400,
    detuneCents: 60,
  },
  crit: {
    wave: "sawtooth",
    freq: 300,
    sweepTo: 70,
    duration: 0.34,
    gain: 0.42,
    noise: 0.9,
    noiseCutoff: 1800,
    detuneCents: 30,
  },
  miss: {
    wave: "sine",
    freq: 300,
    sweepTo: 240,
    duration: 0.1,
    gain: 0.14,
    noise: 0.35,
    noiseCutoff: 3200,
    detuneCents: 80,
  },
  dodge: {
    wave: "sine",
    freq: 700,
    sweepTo: 1200,
    duration: 0.13,
    gain: 0.18,
    noise: 0.3,
    noiseCutoff: 4000,
    detuneCents: 60,
  },
  // Player taking damage — lower and duller than dealing it, so the two
  // directions of combat are distinguishable with eyes closed.
  hurt: {
    wave: "square",
    freq: 140,
    sweepTo: 60,
    duration: 0.22,
    gain: 0.32,
    noise: 0.6,
    noiseCutoff: 900,
    detuneCents: 50,
  },
  // Rewards and run outcomes — rising for good, falling for bad.
  loot: {
    wave: "triangle",
    freq: 660,
    sweepTo: 1320,
    duration: 0.3,
    gain: 0.3,
    detuneCents: 20,
  },
  victory: {
    wave: "triangle",
    freq: 520,
    sweepTo: 1560,
    duration: 0.7,
    gain: 0.34,
  },
  defeat: {
    wave: "sawtooth",
    freq: 260,
    sweepTo: 50,
    duration: 0.9,
    gain: 0.34,
    noise: 0.3,
    noiseCutoff: 700,
  },
  // Toast blips, keyed to `ToastTone`.
  toastOk: { wave: "sine", freq: 880, sweepTo: 1180, duration: 0.14, gain: 0.2 },
  toastDanger: {
    wave: "square",
    freq: 420,
    sweepTo: 260,
    duration: 0.2,
    gain: 0.22,
  },
  toastAccent: {
    wave: "triangle",
    freq: 740,
    sweepTo: 880,
    duration: 0.14,
    gain: 0.18,
  },
} as const;

/**
 * Minimum gap between two shots of the same voice. Combat can resolve
 * several beats in one step and the delegated click listener can see
 * bursts; without this they phase-stack into a click-track and clip the
 * bus.
 */
export const SFX_MIN_INTERVAL_MS = 40;
