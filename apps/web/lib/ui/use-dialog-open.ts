"use client";

/**
 * True while any modal is mounted anywhere in the app.
 *
 * Watched in the DOM rather than plumbed through context because the dialogs
 * share no owner — the connect wizard, the inventory drawer, the extract
 * picker and the defeat overlay each portal themselves to the body
 * independently. What they do share is the ARIA role they already set, so
 * that's the hook.
 *
 * Why anything cares: the dock sits *below* dialogs by design (z-[35] against
 * z-40+) so a modal covers it, which is right for the pills and wrong for a
 * callout — it ends up behind a blurred scrim where it can be neither read nor
 * clicked. On the landing page that's the permanent state until the player
 * connects, so a nudge that ignored this would be drawn and buried every time.
 *
 * Extracted from `MusicNudge`, which had it private, when the Book grew a
 * nudge of its own and needed the identical rule.
 */

import { useEffect, useState } from "react";

/** Covers all five full-screen overlays in the app. */
const DIALOG_SELECTOR = '[role="dialog"], [role="alertdialog"]';

export function useDialogOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const check = () => {
      const found = document.querySelector(DIALOG_SELECTOR) !== null;
      // Return the same value when nothing changed: React bails out of the
      // re-render, which matters because this fires on every DOM mutation
      // anywhere in the app.
      setOpen((prev) => (prev === found ? prev : found));
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return open;
}
