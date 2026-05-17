import Link from "next/link";
import { GenesisStatusCard } from "@/components/genesis/GenesisStatusCard";
import { ConnectButton } from "@/components/wallet/ConnectButton";

export const metadata = {
  title: "Genesis — Realms",
};

/**
 * `/genesis` — post-onboarding status board.
 *
 * Mirrors the in-run `<RealmClearedInterstitial/>`: shows distinct-realm
 * clear progress, lists every cleared realm with a deep link, and exposes
 * the Seed claim CTA when the player is eligible. All state derives from
 * on-chain reads via `useTutorialProgress`.
 */
export default function GenesisPage() {
  return (
    <main className="min-h-screen px-6 py-10">
      <header className="mx-auto mb-10 flex max-w-3xl items-center justify-between">
        <Link href="/" className="text-sm opacity-70 hover:opacity-100">
          ← Home
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Genesis</h1>
        <ConnectButton />
      </header>

      <section className="mx-auto max-w-3xl">
        <GenesisStatusCard />
      </section>
    </main>
  );
}
