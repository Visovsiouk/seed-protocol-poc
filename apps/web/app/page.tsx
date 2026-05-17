import Link from "next/link";
import { RealmSelector } from "@/components/game/RealmSelector";
import { ConnectButton } from "@/components/wallet/ConnectButton";

/**
 * Landing page — preset/realm picker plus the connect surface.
 *
 * The selector pulls live data from `EcosystemRegistry` via `useRealms()`
 * and overlays per-preset starter metadata. Starter cards link straight
 * into `/play/[preset]`; creator-deployed realms surface as
 * address-tagged placeholders until a `/realm/[address]` route lands.
 */
export default function HomePage() {
  return (
    <main className="min-h-screen px-6 py-10">
      <header className="mx-auto mb-10 flex max-w-5xl items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">Realms</h1>
          <p className="text-sm opacity-70">
            Genesis is fantasy. Two more realms wake when the Reach falls.
          </p>
        </div>
        <div className="flex items-center gap-3">
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
            href="/genesis"
            className="rounded-md px-3 py-1.5 text-sm transition"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            Genesis
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
          <ConnectButton />
        </div>
      </header>
      <div className="mx-auto flex max-w-5xl flex-col items-center">
        <RealmSelector />
      </div>
    </main>
  );
}
