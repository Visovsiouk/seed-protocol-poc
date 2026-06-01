"use client";

import { useAccount } from "wagmi";
import { AppShell } from "@/components/ui";
import { RealmSelector } from "@/components/game/RealmSelector";
import { FeaturedRealm } from "@/components/landing/FeaturedRealm";
import { useTutorialProgress } from "@/lib/reads/hooks";
import { emptyTutorialProgress } from "@/lib/tutorial/progress";

/**
 * Landing page — the atlas.
 *
 * Chrome and reveal are owned by `<AppShell/>`: pre-arc it shows a quiet
 * bar (no protocol nav, no title) so the cold-open Book / Continue card
 * rendered by `<RealmSelector/>` reads as a narrow door; once the player
 * has closed all three starters (or holds a Seed) the shell lights the
 * Genesis/Bazaar/Create nav and this page surfaces the featured-realm
 * hero above the open picker.
 *
 * `<RealmSelector/>` owns the pre-arc → post-arc branch internally
 * (cold open, Continue card, full picker), so the page stays a thin
 * composition of shell + hero + selector.
 */
export default function HomePage() {
  const { address } = useAccount();
  const progress = useTutorialProgress(address).data ?? emptyTutorialProgress();
  const arcCompleted = progress.starterClears >= 3 || progress.hasSeed;

  return (
    <AppShell back={null} title={arcCompleted ? "Realms" : undefined}>
      {arcCompleted && <FeaturedRealm />}
      <div className="flex flex-col items-center">
        <RealmSelector />
      </div>
    </AppShell>
  );
}
