"use client";

/**
 * Wave C gate: protocol surfaces (`/bazaar`, `/create`, `/genesis`) are
 * hidden from the player until they've cleared all three starter
 * realms (or already hold the Seed). The landing page bifurcates on
 * the same condition; this gate handles the case where the URL is hit
 * directly.
 *
 * Behavior:
 *   - tutorial query not yet settled → render a minimal sealed
 *     placeholder so we don't flash protected content during the
 *     wagmi/react-query rehydrate.
 *   - `starterClears < 3 && !hasSeed` → effect routes back to `/`,
 *     UI shows a quiet "still sealed" message in the meantime.
 *   - otherwise → render children.
 *
 * Wallet-disconnected case: the tutorial hook still returns a default
 * (zero clears) shape, so disconnected visitors are gated the same way
 * as fresh-start connected ones. They get sent home where the
 * pre-arc landing flow (cold open / continue) is the right entry.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useTutorialProgress } from "@/lib/reads/hooks";
import { emptyTutorialProgress } from "@/lib/tutorial/progress";

export function ProtocolSurfaceGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { address } = useAccount();
  const query = useTutorialProgress(address);
  const progress = query.data ?? emptyTutorialProgress();
  const arcCompleted = progress.starterClears >= 3 || progress.hasSeed;

  useEffect(() => {
    if (!query.isSuccess) return;
    if (!arcCompleted) router.replace("/");
  }, [query.isSuccess, arcCompleted, router]);

  if (!arcCompleted) {
    return (
      <main className="min-h-screen px-6 py-10">
        <section
          aria-label="Sealed"
          className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-md p-6 text-center bg-[var(--surface-2)] border border-dashed border-[var(--border-2)]"
        >
          <h2 className="text-lg font-semibold">Sealed</h2>
          <p className="text-sm opacity-75 leading-relaxed">
            There are doors you haven&apos;t walked through yet. Walk them first.
          </p>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
