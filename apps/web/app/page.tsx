"use client";

import { AppShell } from "@/components/ui";
import { PocketRealmHub } from "@/components/hub/PocketRealmHub";

/**
 * Landing page — the pocket realm (the hideout the player wakes into).
 *
 * Chrome and reveal are owned by `<AppShell/>`: the bar stays quiet (back-only,
 * no protocol nav, no title) so the cold-open Book / Continue card reads as a
 * narrow door pre-arc, and the HQ owns its own header band post-arc.
 *
 * `<PocketRealmHub/>` owns the whole staging flow: pre-arc the narrow door,
 * post-arc the base/HQ shell (station rail → Doors / Market / Altar / Forge),
 * so the page stays a thin composition of shell + hub.
 */
export default function HomePage() {
  return (
    <AppShell back={null}>
      <div className="flex flex-col items-center">
        <PocketRealmHub />
      </div>
    </AppShell>
  );
}
