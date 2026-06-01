"use client";

/**
 * `useRealmTheme(preset, accent?)` — drives the per-realm palette by
 * setting `data-preset` on `<body>` (which selects the genre token block
 * in globals.css) and, when a realm carries a custom accent, overriding
 * `--color-preset-accent` inline so every derived token (`--border-2`,
 * `--glow`, `--focus-ring`, `--rare`, primary-button fill) re-resolves
 * against the chosen colour.
 *
 * Both mutations are reverted on cleanup so navigating away restores
 * whatever the previous route had set — important because the body is a
 * shared surface across client-side route transitions.
 *
 * Consolidates the effect that was duplicated in the two play routes and
 * was missing entirely from the realm dashboard.
 *
 * `preset` is nullable so callers that haven't resolved the realm yet
 * (e.g. the dashboard's unknown-realm branch) can pass `null` to leave
 * the root default palette in place rather than forcing a genre.
 */

import { useEffect } from "react";
import type { Preset } from "@/lib/engine/types";

export function useRealmTheme(
  preset: Preset | null | undefined,
  accent?: string | null,
): void {
  useEffect(() => {
    const body = document.body;
    const prevPreset = body.getAttribute("data-preset");
    const prevAccent = body.style.getPropertyValue("--color-preset-accent");

    if (preset) body.setAttribute("data-preset", preset);
    else body.removeAttribute("data-preset");

    if (preset && accent) {
      body.style.setProperty("--color-preset-accent", accent);
    } else {
      // No custom accent (or no preset): clear any inline override so the
      // genre default from the `data-preset` block — or the root default —
      // wins.
      body.style.removeProperty("--color-preset-accent");
    }

    return () => {
      if (prevPreset) body.setAttribute("data-preset", prevPreset);
      else body.removeAttribute("data-preset");

      if (prevAccent) body.style.setProperty("--color-preset-accent", prevAccent);
      else body.style.removeProperty("--color-preset-accent");
    };
  }, [preset, accent]);
}
