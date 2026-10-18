/**
 * Persisted audio preferences.
 *
 * Mirrors `lib/persistence/equipped.ts` — same storage-key namespace,
 * same SSR guard, same silent swallow on quota/privacy failure (volume
 * still works in-session, it just won't survive a reload, and there's
 * nothing the user can do about it).
 *
 * Defaults assume audio-on: browsers won't let anything play before the
 * visitor's first gesture anyway, so that click is the opt-in. Music
 * sits well under SFX because it's a bed, not a feature.
 */

const STORAGE_KEY = "seed-protocol-poc:audio";

export type AudioSettings = {
  /** 0..1 master trim, applied above the music and SFX buses. */
  master: number;
  /** 0..1 music bus. */
  music: number;
  /** 0..1 SFX bus. */
  sfx: number;
  /** Hard mute, independent of the volumes so it's reversible. */
  muted: boolean;
};

export const DEFAULT_SETTINGS: AudioSettings = {
  master: 0.8,
  music: 0.35,
  sfx: 0.6,
  muted: false,
};

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Coerce whatever was in storage into a usable settings object. Written
 * defensively rather than trusting the parse: a half-written or
 * hand-edited key shouldn't be able to produce a `NaN` gain, which would
 * silence the whole graph with no obvious cause.
 */
function normalize(raw: unknown): AudioSettings {
  if (typeof raw !== "object" || raw === null) return DEFAULT_SETTINGS;
  const o = raw as Partial<Record<keyof AudioSettings, unknown>>;
  const num = (v: unknown, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) ? clamp01(v) : fallback;
  return {
    master: num(o.master, DEFAULT_SETTINGS.master),
    music: num(o.music, DEFAULT_SETTINGS.music),
    sfx: num(o.sfx, DEFAULT_SETTINGS.sfx),
    muted: typeof o.muted === "boolean" ? o.muted : DEFAULT_SETTINGS.muted,
  };
}

/**
 * Read persisted settings, falling back to defaults on SSR, empty
 * storage, or any parse error.
 */
export function loadAudioSettings(): AudioSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return normalize(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Write settings. No-op on SSR or storage failure. */
export function saveAudioSettings(settings: AudioSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Same swallow rationale as saveEquipped.
  }
}

/**
 * Effective gain for a bus, folding in master and mute. Kept here
 * rather than in the engine so the same arithmetic backs both the audio
 * graph and any UI that previews a level.
 */
export function busGain(
  settings: AudioSettings,
  bus: "music" | "sfx",
): number {
  if (settings.muted) return 0;
  return clamp01(settings.master) * clamp01(settings[bus]);
}
