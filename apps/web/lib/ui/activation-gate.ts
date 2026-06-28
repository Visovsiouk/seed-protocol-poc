"use client";

/**
 * Shared activation gate — the single source of truth for "is Enter/Space
 * currently physically held?".
 *
 * Lifted out of `ChoiceRow` so every keyboard-activated surface (the choice
 * row, the proceed-screen hook, the realm grid) consults one flag instead of
 * each installing its own window listeners. This matters across screen
 * transitions: if the player holds Enter to advance, the next surface mounts
 * "disarmed" and refuses to activate until the key is released and pressed
 * again — preventing a single held Enter from cascading through several
 * screens (e.g. Descend → run boot → first combat prompt).
 *
 * Key autorepeat is handled at the call sites (`event.repeat`); this module
 * only tracks the physical held state and notifies on release.
 */

import { useEffect, useState } from "react";

// Module-level state: is Enter or Space currently physically held?
// Set on keydown (capture), cleared on keyup. Shared so a surface that just
// mounted can ask "was an activation key already down when I appeared?".
let activationKeyHeld = false;
const releaseListeners = new Set<() => void>();
let listenersInstalled = false;

function isActivationKey(e: KeyboardEvent): boolean {
  return e.key === "Enter" || e.key === " " || e.code === "Space";
}

export function ensureActivationListeners(): void {
  if (listenersInstalled || typeof window === "undefined") return;
  listenersInstalled = true;
  window.addEventListener(
    "keydown",
    (e) => {
      if (isActivationKey(e)) activationKeyHeld = true;
    },
    true,
  );
  window.addEventListener(
    "keyup",
    (e) => {
      if (isActivationKey(e)) {
        activationKeyHeld = false;
        // Notify any disarmed surfaces so they can re-arm.
        for (const cb of releaseListeners) cb();
      }
    },
    true,
  );
  // Also clear when the window loses focus (alt-tab while holding key).
  window.addEventListener("blur", () => {
    activationKeyHeld = false;
    for (const cb of releaseListeners) cb();
  });
}

export function isActivationKeyHeld(): boolean {
  return activationKeyHeld;
}

export function onActivationRelease(cb: () => void): () => void {
  releaseListeners.add(cb);
  return () => {
    releaseListeners.delete(cb);
  };
}

/**
 * `armed=false` means an activation key is currently held from a prior
 * context; callers should ignore activations until it is released. Lazy init
 * reads the module-level flag synchronously so we never race the first
 * autorepeat keydown after mount. Pass a `sig` that changes whenever the
 * activatable content changes (e.g. the choice set, the target realm) to
 * re-run the disarm check on that change.
 */
export function useActivationArmed(sig?: string): boolean {
  const [armed, setArmed] = useState(() => {
    if (typeof window === "undefined") return true;
    ensureActivationListeners();
    return !activationKeyHeld;
  });

  useEffect(() => {
    ensureActivationListeners();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (activationKeyHeld) {
      // (Re-)mounted or sig changed while a key was held — disarm and wait
      // for release.
      setArmed(false);
      const off = onActivationRelease(() => setArmed(true));
      return off;
    }
    setArmed(true);
  }, [sig]);

  return armed;
}
