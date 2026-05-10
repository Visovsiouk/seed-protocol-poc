import { ListingsGrid } from "@/components/bazaar/ListingsGrid";
import { RecentSalesFeed } from "@/components/bazaar/RecentSalesFeed";
import { ListButton } from "@/components/bazaar/ListButton";
import { ConnectButton } from "@/components/wallet/ConnectButton";

export const metadata = {
  title: "Bazaar — Realms",
};

/**
 * Read-only listings + recent sales feed. Buy/list writes wire in
 * after the value-flow demo + Trader server land.
 */
export default function BazaarPage() {
  return (
    <main className="min-h-screen px-6 py-10">
      <header className="mx-auto mb-10 flex max-w-6xl items-center justify-between">
        <a href="/" className="text-sm opacity-70 hover:opacity-100">
          ← Home
        </a>
        <h1 className="text-2xl font-semibold tracking-tight">Bazaar</h1>
        <div className="flex items-center gap-3">
          <ListButton />
          <ConnectButton />
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_320px]">
        <div>
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wider opacity-60">
            Active listings
          </h2>
          <ListingsGrid />
        </div>
        <aside>
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wider opacity-60">
            Recent sales
          </h2>
          <RecentSalesFeed />
        </aside>
      </section>
    </main>
  );
}
