"use client";

/**
 * `useRealmMusic(preset)` — selects the music track for a route.
 *
 * Deliberately a sibling of `lib/ui/useRealmTheme.ts` rather than part
 * of it: the two happen to be called from the same three places today,
 * but one mutates `<body>` attributes and the other drives an audio
 * graph, and a route could reasonably want a palette without a track
 * change. Keeping them separate also means the music hook can be added
 * to a route without touching its theming.
 *
 * Follows the same restore-on-unmount discipline as `useRealmTheme`: on
 * cleanup the track returns to the menu theme, so every route that
 * *doesn't* call this hook — landing, bazaar, create, genesis, about —
 * plays the theme with no per-route code.
 *
 * `preset` is nullable for callers that haven't resolved the realm yet
 * (the dashboard's unknown-realm branch), which hold the theme rather
 * than guessing a genre.
 */

import { useEffect } from "react";
import type { Preset } from "@/lib/engine/types";
import { DEFAULT_TRACK, type TrackId } from "./manifest";
import { setTrack } from "./music";

export function useRealmMusic(preset: Preset | null | undefined): void {
  useEffect(() => {
    // `TrackId` is `"theme" | Preset`, so a resolved preset is already a
    // valid track id — the manifest is named to make this a cast, not a
    // lookup table that could drift out of sync with the presets.
    const track: TrackId = preset ?? DEFAULT_TRACK;
    setTrack(track);
    return () => setTrack(DEFAULT_TRACK);
  }, [preset]);
}
