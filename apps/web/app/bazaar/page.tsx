import { ListingsGrid } from "@/components/bazaar/ListingsGrid";
import { RecentSalesFeed } from "@/components/bazaar/RecentSalesFeed";
import { ListButton } from "@/components/bazaar/ListButton";
import { RealmLeaderboards } from "@/components/bazaar/RealmLeaderboards";
import { ProtocolSurfaceGate } from "@/components/guards/ProtocolSurfaceGate";
import { AppShell } from "@/components/ui";

export const metadata = {
  title: "Bazaar — Realms",
};

/**
 * Read-only listings + recent sales feed. Buy/list writes wire in
 * after the value-flow demo + Trader server land.
 */
export default function BazaarPage() {
  return (
    <ProtocolSurfaceGate>
      <AppShell
        title="Bazaar"
        back={{ href: "/", label: "← Home" }}
        actions={<ListButton />}
      >
        <section className="grid gap-10 lg:grid-cols-[1fr_320px]">
          <div>
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wider opacity-60">
              Active listings
            </h2>
            <ListingsGrid />
          </div>
          <aside className="flex flex-col gap-6">
            <div>
              <h2 className="mb-4 text-sm font-medium uppercase tracking-wider opacity-60">
                Recent sales
              </h2>
              <RecentSalesFeed />
            </div>
            <RealmLeaderboards />
          </aside>
        </section>
      </AppShell>
    </ProtocolSurfaceGate>
  );
}
