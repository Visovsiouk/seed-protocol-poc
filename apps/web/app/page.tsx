import { ConnectButton } from "@/components/wallet/ConnectButton";

/**
 *  placeholder landing page. replaces this with <HeroIntro/>
 * + <IntroReel/> per
 */
export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 px-6 text-center">
      <header className="absolute top-6 right-6">
        <ConnectButton />
      </header>
      <h1 className="text-5xl font-semibold tracking-tight">Realms</h1>
      <p className="max-w-xl text-lg opacity-80">
        A reference application for the Seed Protocol — universal assets,
        adoptable schemas, and provenance-bound royalties, demonstrated through
        a dice-driven text RPG.
      </p>
      <div className="flex gap-3">
        <a
          href="/play/fantasy"
          className="rounded-md px-6 py-3 font-medium transition"
          style={{
            background: "var(--color-preset-accent)",
            color: "var(--color-preset-bg)",
          }}
        >
          Begin your adventure
        </a>
        <a
          href="/bazaar"
          className="rounded-md px-6 py-3 font-medium transition"
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.2)",
            color: "var(--color-preset-fg)",
          }}
        >
          Visit the Bazaar
        </a>
      </div>
      <p className="text-sm opacity-50">
        Phase 1 in progress — bazaar reads live, writes land next.
      </p>
    </main>
  );
}
