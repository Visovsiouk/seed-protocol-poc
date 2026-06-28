"use client";

/**
 * `useEnterToActivate` — make Enter fire a screen's single primary action
 * regardless of what's focused. Used by the "proceed" surfaces (loadout
 * Descend, gear-translation Descend, extract Bank) where there's one obvious
 * forward action and no roving selection.
 *
 * Why a document-capture listener instead of auto-focusing the button:
 * auto-focus would scroll the page to the control on mount, steal the focus
 * ring while the player is still reading, and risk a held-Enter double-fire
 * via the native button default. Owning the keydown lets us gate it against
 * the shared activation gate (so a held Enter doesn't cascade across a screen
 * transition) and call exactly once.
 *
 * Enter only — Space is left free to scroll.
 */

import { useEffect, useRef } from "react";
import { useActivationArmed } from "./activation-gate";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export function useEnterToActivate({
  onActivate,
  enabled = true,
  sig,
}: {
  onActivate: () => void;
  enabled?: boolean;
  sig?: string;
}): void {
  const armed = useActivationArmed(sig);

  // Keep the latest callback in a ref so the listener always calls the
  // current closure (e.g. LoadoutStaging's `descend`, which closes over the
  // selected loadout) without re-registering on every render.
  const cbRef = useRef(onActivate);
  cbRef.current = onActivate;

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Enter") return;
      if (e.repeat) return; // ignore key autorepeat
      if (!armed) return; // held from a prior screen — wait for release
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      cbRef.current();
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [enabled, armed]);
}
