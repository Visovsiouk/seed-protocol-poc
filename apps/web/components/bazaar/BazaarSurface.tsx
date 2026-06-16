import { ListingsGrid } from "@/components/bazaar/ListingsGrid";
import { RecentSalesFeed } from "@/components/bazaar/RecentSalesFeed";
import { ListButton } from "@/components/bazaar/ListButton";
import { RealmLeaderboards } from "@/components/bazaar/RealmLeaderboards";
import { Stamp } from "@/components/ui";

/**
 * The Bazaar's presentational body, extracted so it can render both as the
 * standalone `/bazaar` route and as the Market station inside the HQ hub.
 * Read-only listings + recent sales feed; the `ListButton` (previously in the
 * AppShell actions slot) lives in the header here.
 */
export function BazaarSurface() {
  return (
    <section className="grid gap-10 lg:grid-cols-[1fr_320px]">
      <div>
        <header className="mb-4 flex items-center justify-between gap-3">
          <Stamp tone="muted">Active listings</Stamp>
          <ListButton />
        </header>
        <ListingsGrid />
      </div>
      <aside className="flex flex-col gap-6">
        <div>
          <header className="mb-4">
            <Stamp tone="muted">Recent sales</Stamp>
          </header>
          <RecentSalesFeed />
        </div>
        <RealmLeaderboards />
      </aside>
    </section>
  );
}
