"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { RealmSelector } from "@/components/game/RealmSelector";
import { FeaturedRealm } from "@/components/landing/FeaturedRealm";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { useTutorialProgress } from "@/lib/reads/hooks";
import { emptyTutorialProgress } from "@/lib/tutorial/progress";

/**
 * Landing page — gated chrome + realm picker.
 *
 * The first-time experience hides every protocol surface (bazaar,
 * create, Genesis claim) until the player has cleared all three
 * starters. Pre-3-clear the page is a quiet door: title, the cold-open
 * Book or the continue card (rendered by `<RealmSelector/>`), and the
 * wallet connect. Post-3-clear the full chrome plus the featured-realm
 * banner light up — the protocol's surfaces become legible once the
 * player has earned the right to read them.
 */
export default function HomePage() {
  const { address } = useAccount();
  const tutorial = useTutorialProgress(address);
  const progress = tutorial.data ?? emptyTutorialProgress();
  const arcCompleted = progress.starterClears >= 3 || progress.hasSeed;

  return (
    <main className="min-h-screen px-6 py-10">
      <header className="mx-auto mb-10 flex max-w-5xl items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">
            {arcCompleted ? "Realms" : "—"}
          </h1>
          {arcCompleted && (
            <p className="text-sm opacity-70">
              Three doors closed behind you. The rest are up to you.
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {arcCompleted && (
            <>
              <Link
                href="/create"
                className="rounded-md px-3 py-1.5 text-sm transition"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                Create realm
              </Link>
              <Link
                href="/bazaar"
                className="rounded-md px-3 py-1.5 text-sm transition"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                Bazaar
              </Link>
            </>
          )}
          <ConnectButton />
        </div>
      </header>
      <div className="mx-auto max-w-5xl">
        {arcCompleted && <FeaturedRealm />}
        <div className="flex flex-col items-center">
          <RealmSelector />
        </div>
      </div>
    </main>
  );
}
