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
 *
 * ── The one surface with no story in it ────────────────────────────────────
 * Every listing is a finding another living borrower carried up a page, and
 * both addresses stay on the ledger after it changes hands. That is the most
 * concrete proof of simultaneity the app has, and it shipped as two bare
 * section labels. The framing line below is the whole fix — the mechanics were
 * already right.
 */
export function BazaarSurface() {
  return (
    <section className="grid gap-10 lg:grid-cols-[1fr_320px]">
      <div>
        <header className="mb-4 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <Stamp tone="muted">On offer</Stamp>
            <ListButton />
          </div>
          <p className="text-[11px] leading-relaxed opacity-65">
            Findings other borrowers carried up out of the pages. Nothing here
            was made — all of it was survived. The ledger keeps whoever sold and
            whoever bought, for as long as the book lasts.
          </p>
        </header>
        <ListingsGrid />
      </div>
      <aside className="flex flex-col gap-6">
        <div>
          <header className="mb-4">
            <Stamp tone="muted">Changed hands</Stamp>
          </header>
          <RecentSalesFeed />
        </div>
        <RealmLeaderboards />
      </aside>
    </section>
  );
}
