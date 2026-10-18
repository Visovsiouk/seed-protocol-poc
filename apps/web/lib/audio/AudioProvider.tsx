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
 *  1. **Unlock on first gesture.** Browsers refuse to run an
 *     `AudioContext` until the user interacts, so the graph is built
 *     from a capture-phase `pointerdown`/`keydown` listener. That first
 *     click is also the visitor's implicit opt-in — nothing plays before
 *     it, whatever the saved settings say.
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
import { applySettings, ensureEngine, isAudioSupported } from "./engine";
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

  // --- 1. Unlock on first gesture -----------------------------------------
  useEffect(() => {
    if (!isAudioSupported()) return;

    let done = false;
    const unlock = () => {
      if (done) return;
      const engine = ensureEngine(settingsRef.current);
      if (!engine) return;
      done = true;
      setUnlocked(true);
      music.start();
      prefetchSfx();
      remove();
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
      unlocked,
      supported,
    }),
    [settings, setSettings, unlocked, supported],
  );

  return (
    <AudioContextValue.Provider value={api}>
      {children}
    </AudioContextValue.Provider>
  );
}

export { DEFAULT_TRACK };
