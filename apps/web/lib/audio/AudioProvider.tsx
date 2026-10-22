"use client";

/**
 * AudioProvider — the React surface over `lib/audio/*`.
 *
 * Shaped after `NotificationProvider` in `components/ui/Toast.tsx`: a
 * context whose default value is a working no-op set, so a component
 * that calls `useAudio()` outside the provider degrades to silence
 * instead of throwing.
 *
 * Three responsibilities:
 *
 *  1. **Getting sound running.** Two paths, because browsers refuse to
 *     run an `AudioContext` until the user interacts. If music is
 *     already opted in from a previous visit we build the graph on load
 *     and ask for it anyway (`tryStartMusic`) — some browsers allow that
 *     for an origin the player keeps coming back to, and where they
 *     don't, the track is downloaded and decoded by the time the first
 *     click lands. Otherwise a capture-phase
 *     `pointerdown`/`keydown`/`touchstart` listener catches that click.
 *     Either way nothing is fetched unless `musicEnabled` says so.
 *
 *  2. **Delegated click SFX.** One document-level listener covers every
 *     button and link in the app. Deliberately not done inside
 *     `components/ui/Button.tsx`: that file has no `"use client"` and is
 *     usable from server components, so putting a hook in it would force
 *     every consumer client-side. Delegation also picks up the dock
 *     pills, `<a>` navigation and anything with `role="button"` for
 *     free. Opt out with `data-sfx="none"` on the element or any
 *     ancestor.
 *
 *  3. **Settings.** Loaded from localStorage after mount (never during
 *     render — that would desync hydration), then pushed to the buses on
 *     every change.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  applySettings,
  ensureEngine,
  getEngine,
  isAudioSupported,
} from "./engine";
import { DEFAULT_TRACK, type SfxId, type TrackId } from "./manifest";
import * as music from "./music";
import { play as playSfx, prefetchSfx } from "./sfx";
import {
  DEFAULT_SETTINGS,
  loadAudioSettings,
  saveAudioSettings,
  type AudioSettings,
} from "./settings";

type AudioApi = {
  settings: AudioSettings;
  /** Patch one or more settings; persisted and applied immediately. */
  setSettings: (patch: Partial<AudioSettings>) => void;
  /** Fire a sound effect. Silent before the first gesture. */
  play: (id: SfxId) => void;
  /** Request a music track. Idempotent. */
  setTrack: (id: TrackId) => void;
  /**
   * Turn music on or off. Off releases the decoded audio entirely —
   * see `music.setEnabled`.
   */
  setMusicEnabled: (on: boolean) => void;
  /** The track currently sounding, or null when music is off//loading. */
  nowPlaying: TrackId | null;
  /** True once the audio context exists and is running. */
  unlocked: boolean;
  /** False where Web Audio is unavailable — hides the settings UI. */
  supported: boolean;
};

const AudioContextValue = createContext<AudioApi>({
  settings: DEFAULT_SETTINGS,
  setSettings: () => {},
  play: () => {},
  setTrack: () => {},
  setMusicEnabled: () => {},
  nowPlaying: null,
  unlocked: false,
  supported: false,
});

export function useAudio(): AudioApi {
  return useContext(AudioContextValue);
}

/** Elements whose clicks get a UI blip. */
const CLICK_SELECTOR = 'button, a[href], [role="button"], summary';

export function AudioProvider({ children }: { children: ReactNode }) {
  const [settings, setSettingsState] = useState<AudioSettings>(DEFAULT_SETTINGS);
  const [unlocked, setUnlocked] = useState(false);
  const [supported, setSupported] = useState(false);

  // The gesture listener needs current settings without being torn down
  // and re-registered every time a slider moves.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Hydrate from storage after mount. Reading localStorage during render
  // would produce server/client markup mismatch.
  useEffect(() => {
    setSettingsState(loadAudioSettings());
    setSupported(isAudioSupported());
  }, []);

  // Push volume changes to the live buses.
  useEffect(() => {
    applySettings(settings);
  }, [settings]);

  const setSettings = useCallback((patch: Partial<AudioSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      saveAudioSettings(next);
      return next;
    });
  }, []);

  const [nowPlaying, setNowPlaying] = useState<TrackId | null>(null);

  /**
   * Build the graph, ask the browser to run it, and start the track the
   * current route wants.
   *
   * Safe to call at any moment, gesture or not. A context the browser
   * declines to start simply stays `suspended`, which is a normal state:
   * the sources and gain ramps are scheduled against a clock that isn't
   * moving yet, and they begin the instant it is. So the only cost of a
   * refusal is the fetch and decode, which we wanted anyway.
   *
   * `unlocked` is only claimed once the clock is genuinely running. A
   * suspended context reporting otherwise makes the panel hide its
   * "needs a click" hint and sit on "Loading…" with no explanation. It
   * never ramps back to false — the gesture listeners stay armed.
   */
  const tryStartMusic = useCallback(() => {
    const engine = ensureEngine({ ...settingsRef.current, musicEnabled: true });
    if (!engine) return;
    music.start();
    const sync = () => {
      if (engine.ctx.state === "running") setUnlocked(true);
    };
    void engine.ctx.resume().then(sync).catch(sync);
    sync();
  }, []);

  const setMusicEnabled = useCallback(
    (on: boolean) => {
      setSettings({ musicEnabled: on });
      // The toggle itself is a user gesture, so it can unlock the
      // context — important because with music off by default, turning
      // it on may well be the first audio-relevant thing a player does.
      // Done here rather than left to the effect below so the `resume()`
      // lands while the click is still the thing the browser is looking
      // at, which is the case a hostile autoplay policy is most likely
      // to allow.
      if (on) {
        tryStartMusic();
      } else {
        music.setEnabled(false);
        setNowPlaying(null);
      }
    },
    [setSettings, tryStartMusic],
  );

  /**
   * Pick the music back up on load for a player who already turned it on.
   *
   * `musicEnabled` persists, so "it was playing when I closed the tab"
   * should mean "it's playing when I open it again" — without making them
   * hunt down the speaker pill a second time. We don't wait for a gesture
   * to try, because waiting is what made the setting look broken: the
   * engine didn't even exist until the first click, so the first click
   * then bought a ~2MB download and a decode before anything sounded.
   *
   * Whether it actually *sounds* with no interaction is the browser's
   * call, and there's no API that lets us do better: Chrome permits it
   * once the origin has enough media-engagement history, Safari and the
   * stricter privacy browsers never do. When it's refused the first
   * click starts the music immediately instead of after a wait, and
   * `MusicNudge` says so rather than leaving the silence unexplained.
   */
  useEffect(() => {
    if (!supported || unlocked || !settings.musicEnabled) return;
    tryStartMusic();
  }, [supported, unlocked, settings.musicEnabled, tryStartMusic]);

  // Poll the conductor for what's actually sounding. The track changes
  // on a bar line up to a couple of seconds after a route asks for it,
  // so React state can't be the source of truth — the audio clock is.
  // Only runs while music is on.
  useEffect(() => {
    if (!settings.musicEnabled || !unlocked) return;
    const tick = () => setNowPlaying(music.debugState().track);
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [settings.musicEnabled, unlocked]);

  // --- 1. Unlock on first gesture -----------------------------------------
  useEffect(() => {
    if (!isAudioSupported()) return;

    let done = false;

    /**
     * Commit the unlock — but only once the clock is genuinely running.
     *
     * Creating an `AudioContext` is not the same as starting one. A
     * gesture the browser doesn't trust, or simply declines, leaves it
     * `suspended`; tearing the listeners down at that point would strand
     * us silent with no way back. So we stay armed until `resume()` has
     * actually taken, and every later gesture gets another go.
     */
    const finalize = () => {
      if (done) return;
      const engine = getEngine();
      if (!engine || engine.ctx.state !== "running") return;
      done = true;
      setUnlocked(true);
      // Music only starts if the player has asked for it — otherwise
      // nothing is fetched or decoded. SFX are always armed; they cost
      // nothing until something fires one.
      if (settingsRef.current.musicEnabled) music.start();
      prefetchSfx();
      remove();
    };

    const unlock = () => {
      if (done) return;
      const engine = ensureEngine(settingsRef.current);
      if (!engine) return;
      // Called inside the gesture handler so the browser counts it;
      // resuming an already-running context is a no-op. The state check
      // lives in `finalize` because resolution is async.
      engine.ctx.resume().then(finalize).catch(() => {});
      finalize();
    };

    // Capture phase so we unlock before any handler that might stop
    // propagation. `pointerdown` rather than `click` so the context is
    // already running by the time a click SFX wants to fire.
    const opts = { capture: true } as const;
    const remove = () => {
      document.removeEventListener("pointerdown", unlock, opts);
      document.removeEventListener("keydown", unlock, opts);
      document.removeEventListener("touchstart", unlock, opts);
    };
    document.addEventListener("pointerdown", unlock, opts);
    document.addEventListener("keydown", unlock, opts);
    document.addEventListener("touchstart", unlock, opts);
    return remove;
  }, []);

  // --- 2. Delegated click SFX ---------------------------------------------
  useEffect(() => {
    if (!unlocked) return;

    const blip = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return;
      const hit = target.closest(CLICK_SELECTOR);
      if (!hit) return;
      // Respect an opt-out anywhere up the tree, and never blip a
      // disabled control — it didn't do anything.
      if (target.closest('[data-sfx="none"]')) return;
      if (hit instanceof HTMLButtonElement && hit.disabled) return;
      if (hit.getAttribute("aria-disabled") === "true") return;
      playSfx("click");
    };

    const onPointerDown = (ev: PointerEvent) => blip(ev.target);

    // Keyboard activation emits no pointer event, so a keyboard-only
    // player would otherwise get a silent UI. Enter/Space on a focused
    // control is the same action as a click and gets the same sound.
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      if (ev.repeat) return; // held key shouldn't machine-gun
      blip(ev.target);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [unlocked]);

  // --- Dev debug surface ---------------------------------------------------
  // Exposes the bar clock so a genre switch can be verified as musically
  // continuous (bar position keeps rising while bar duration changes)
  // rather than judged by ear alone. Dev-only; tree-shaken in production.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const w = window as unknown as { __realmsAudio?: unknown };
    w.__realmsAudio = {
      debug: () => music.debugState(),
      setTrack: (id: TrackId) => music.setTrack(id),
      play: (id: SfxId) => playSfx(id),
    };
    return () => {
      delete w.__realmsAudio;
    };
  }, []);

  const api = useMemo<AudioApi>(
    () => ({
      settings,
      setSettings,
      play: playSfx,
      setTrack: music.setTrack,
      setMusicEnabled,
      nowPlaying,
      unlocked,
      supported,
    }),
    [settings, setSettings, setMusicEnabled, nowPlaying, unlocked, supported],
  );

  return (
    <AudioContextValue.Provider value={api}>
      {children}
    </AudioContextValue.Provider>
  );
}

export { DEFAULT_TRACK };
